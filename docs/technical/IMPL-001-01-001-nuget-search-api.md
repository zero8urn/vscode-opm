# IMPL-001-01-001-nuget-search-api

**Story**: [STORY-001-01-001-nuget-search-api](../stories/STORY-001-01-001-nuget-search-api.md)  
**Feature**: [FEAT-001-01-browse-search](../features/FEAT-001-01-browse-search.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: In Progress  
**Created**: 2025-11-29  
**Last Updated**: 2025-11-29

## Overview

This implementation plan details the technical approach for building the NuGet Search API integration. The implementation creates the foundational data layer for package discovery, following the existing domain provider pattern with `DomainResult<T>` and introducing a `NuGetError` subtype to avoid polluting the shared domain error union.

The client uses native Node.js fetch (available in Node 18+) with `AbortController` for timeout management and cancellation support. The parser is a pure function that transforms NuGet API JSON responses into typed domain models with graceful handling of missing fields.

## Architecture Decisions

### 1. NuGetError Subtype

**Decision**: Create a separate `NuGetError` type instead of extending the shared `DomainError` union.

**Rationale**:
- NuGet-specific error codes (`RateLimit`, `Network`, `ApiError`, `ParseError`) shouldn't pollute the generic domain layer
- Allows specialized error handling and retry metadata (e.g., `retryAfter` duration)
- Maintains separation of concerns between generic domain operations and package-specific APIs

**Implementation**:
```typescript
// src/domain/models/nugetError.ts
export type NuGetError =
  | { code: 'RateLimit'; message: string; retryAfter?: number }
  | { code: 'Network'; message: string; details?: string }
  | { code: 'ApiError'; message: string; statusCode?: number }
  | { code: 'ParseError'; message: string; details?: string };

export type NuGetResult<T> = 
  | { success: true; result: T } 
  | { success: false; error: NuGetError };
```

### 2. No Caching in Client

**Decision**: Implement client without built-in caching; caching will be added in STORY-001-01-011.

**Rationale**:
- Separation of concerns: client handles HTTP, cache layer handles TTL/invalidation
- Allows testing of raw API behavior without cache interference
- Cache can wrap client transparently via decorator pattern

**Future Integration**:
```typescript
// Future: src/domain/cache/searchCache.ts (STORY-001-01-011)
export class SearchCache {
  constructor(private client: NuGetApiClient) {}
  
  async searchPackages(options: SearchOptions, signal?: AbortSignal): Promise<NuGetResult<PackageSearchResult[]>> {
    const cacheKey = this.buildCacheKey(options);
    const cached = this.get(cacheKey);
    if (cached) return { success: true, result: cached };
    
    const result = await this.client.searchPackages(options, signal);
    if (result.success) this.set(cacheKey, result.result, 5 * 60 * 1000); // 5 min TTL
    return result;
  }
}
```

### 3. AbortController Exposed to Callers

**Decision**: Accept optional `AbortSignal` parameter for caller-controlled cancellation.

**Rationale**:
- Enables webview to cancel in-flight requests when user types new search query
- Caller controls cancellation policy (debounce, latest-only, etc.)
- Client still enforces internal 30s timeout for all requests

**Implementation Pattern**:
```typescript
// Caller controls cancellation
const controller = new AbortController();
searchInput.addEventListener('input', () => {
  controller.abort(); // Cancel previous request
  const newController = new AbortController();
  searchPackages({ query: input.value }, newController.signal);
});

// Client enforces timeout
async searchPackages(options: SearchOptions, signal?: AbortSignal): Promise<NuGetResult<PackageSearchResult[]>> {
  const timeout = 30000;
  const controller = new AbortController();
  
  // Combine caller signal + internal timeout
  if (signal) {
    signal.addEventListener('abort', () => controller.abort());
  }
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    // ...
  } finally {
    clearTimeout(timeoutId);
  }
}
```

### 4. Native Fetch (No Dependencies)

**Decision**: Use Node.js native `fetch` without external HTTP libraries.

**Rationale**:
- Available in Node 18+ (container runs Node 22)
- No additional dependencies (axios, node-fetch)
- Modern async/await API with full TypeScript support
- Built-in `AbortController` integration

## Implementation Steps

### Step 1: Create Domain Models

**Files to Create**:
- `src/domain/models/packageSearchResult.ts`
- `src/domain/models/searchOptions.ts`
- `src/domain/models/nugetError.ts`

**PackageSearchResult Interface**:
```typescript
// src/domain/models/packageSearchResult.ts

/**
 * Represents a single package from NuGet search results.
 * Maps to the NuGet API v3 SearchResult schema.
 */
export interface PackageSearchResult {
  /** Package identifier (e.g., "Newtonsoft.Json") */
  id: string;
  
  /** Latest version or highest matching version */
  version: string;
  
  /** Package description (may be empty) */
  description: string;
  
  /** Package authors (may be empty array) */
  authors: string[];
  
  /** Total download count across all versions */
  downloadCount: number;
  
  /** Icon URL (may be empty string for default icon) */
  iconUrl: string;
  
  /** Whether package is from a verified publisher */
  verified: boolean;
  
  /** Package tags for categorization (may be empty array) */
  tags: string[];
}
```

**SearchOptions Interface**:
```typescript
// src/domain/models/searchOptions.ts

/**
 * Options for NuGet package search API requests.
 * All fields are optional to support various search scenarios.
 */
export interface SearchOptions {
  /** Search query string (omit for browsing all packages) */
  query?: string;
  
  /** Include prerelease versions (default: false) */
  prerelease?: boolean;
  
  /** Number of results to skip for pagination (default: 0) */
  skip?: number;
  
  /** Number of results to return (default: 20, max: 1000) */
  take?: number;
  
  /** SemVer level filter (default: "2.0.0") */
  semVerLevel?: string;
}
```

**NuGetError Type**:
```typescript
// src/domain/models/nugetError.ts

/**
 * NuGet-specific error types for API operations.
 * Separate from generic DomainError to avoid pollution of shared types.
 */
export type NuGetError =
  | { code: 'RateLimit'; message: string; retryAfter?: number }
  | { code: 'Network'; message: string; details?: string }
  | { code: 'ApiError'; message: string; statusCode?: number }
  | { code: 'ParseError'; message: string; details?: string };

/**
 * Result type for NuGet operations.
 * Follows the same discriminated union pattern as DomainResult.
 */
export type NuGetResult<T> = 
  | { success: true; result: T } 
  | { success: false; error: NuGetError };
```

**Index Export**:
```typescript
// src/domain/models/index.ts
export * from './packageSearchResult';
export * from './searchOptions';
export * from './nugetError';
```

### Step 2: Implement Search Parser

**File**: `src/domain/parsers/searchParser.ts`

**NuGet API Response Schema**:
```typescript
interface NuGetSearchResponse {
  totalHits: number;
  data: Array<{
    id: string;
    version: string;
    description?: string;
    authors?: string | string[];
    totalDownloads?: number;
    iconUrl?: string;
    verified?: boolean;
    tags?: string[];
  }>;
}
```

**Parser Implementation**:
```typescript
// src/domain/parsers/searchParser.ts
import type { PackageSearchResult } from '../models/packageSearchResult';

/**
 * Parses NuGet Search API v3 JSON response into domain model.
 * 
 * Handles missing/optional fields gracefully with sensible defaults:
 * - Missing description → empty string
 * - Missing authors → empty array (handles string | string[] union)
 * - Missing downloadCount → 0
 * - Missing iconUrl → empty string (UI will use fallback)
 * - Missing verified → false
 * - Missing tags → empty array
 * 
 * @param apiResponse - Raw JSON response from NuGet API
 * @returns Array of PackageSearchResult (empty array if no results)
 * @throws Never throws; returns empty array for invalid input
 */
export function parseSearchResponse(apiResponse: unknown): PackageSearchResult[] {
  // Guard against invalid input
  if (!apiResponse || typeof apiResponse !== 'object') {
    return [];
  }
  
  const response = apiResponse as { data?: unknown[] };
  
  // Guard against missing data array
  if (!Array.isArray(response.data)) {
    return [];
  }
  
  return response.data
    .filter((item): item is Record<string, unknown> => 
      typeof item === 'object' && item !== null
    )
    .map((item): PackageSearchResult => ({
      id: String(item.id || ''),
      version: String(item.version || ''),
      description: String(item.description || ''),
      authors: normalizeAuthors(item.authors),
      downloadCount: Number(item.totalDownloads || 0),
      iconUrl: String(item.iconUrl || ''),
      verified: Boolean(item.verified),
      tags: normalizeTags(item.tags),
    }))
    .filter(result => result.id && result.version); // Remove invalid entries
}

/**
 * Normalizes authors field which can be string or string[] in API response.
 */
function normalizeAuthors(authors: unknown): string[] {
  if (typeof authors === 'string') {
    return authors.split(',').map(a => a.trim()).filter(Boolean);
  }
  if (Array.isArray(authors)) {
    return authors.map(a => String(a || '')).filter(Boolean);
  }
  return [];
}

/**
 * Normalizes tags field to string array.
 */
function normalizeTags(tags: unknown): string[] {
  if (Array.isArray(tags)) {
    return tags.map(t => String(t || '')).filter(Boolean);
  }
  return [];
}
```

**Parser Tests**:
```typescript
// src/domain/parsers/__tests__/searchParser.test.ts
import { describe, test, expect } from 'bun:test';
import { parseSearchResponse } from '../searchParser';

describe('parseSearchResponse', () => {
  test('parses valid API response with all fields', () => {
    const apiResponse = {
      totalHits: 1,
      data: [{
        id: 'Newtonsoft.Json',
        version: '13.0.3',
        description: 'Popular high-performance JSON framework for .NET',
        authors: ['James Newton-King'],
        totalDownloads: 1234567890,
        iconUrl: 'https://api.nuget.org/v3-flatcontainer/newtonsoft.json/13.0.3/icon',
        verified: true,
        tags: ['json', 'serialization', 'net']
      }]
    };
    
    const result = parseSearchResponse(apiResponse);
    
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'Newtonsoft.Json',
      version: '13.0.3',
      description: 'Popular high-performance JSON framework for .NET',
      authors: ['James Newton-King'],
      downloadCount: 1234567890,
      iconUrl: 'https://api.nuget.org/v3-flatcontainer/newtonsoft.json/13.0.3/icon',
      verified: true,
      tags: ['json', 'serialization', 'net']
    });
  });

  test('handles missing optional fields with defaults', () => {
    const apiResponse = {
      totalHits: 1,
      data: [{
        id: 'MinimalPackage',
        version: '1.0.0'
        // All optional fields missing
      }]
    };
    
    const result = parseSearchResponse(apiResponse);
    
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'MinimalPackage',
      version: '1.0.0',
      description: '',
      authors: [],
      downloadCount: 0,
      iconUrl: '',
      verified: false,
      tags: []
    });
  });

  test('normalizes authors from comma-separated string', () => {
    const apiResponse = {
      totalHits: 1,
      data: [{
        id: 'TestPackage',
        version: '1.0.0',
        authors: 'Author One, Author Two, Author Three'
      }]
    };
    
    const result = parseSearchResponse(apiResponse);
    expect(result[0].authors).toEqual(['Author One', 'Author Two', 'Author Three']);
  });

  test('normalizes authors from array', () => {
    const apiResponse = {
      totalHits: 1,
      data: [{
        id: 'TestPackage',
        version: '1.0.0',
        authors: ['Author One', 'Author Two']
      }]
    };
    
    const result = parseSearchResponse(apiResponse);
    expect(result[0].authors).toEqual(['Author One', 'Author Two']);
  });

  test('returns empty array for zero results', () => {
    const apiResponse = {
      totalHits: 0,
      data: []
    };
    
    const result = parseSearchResponse(apiResponse);
    expect(result).toEqual([]);
  });

  test('returns empty array for null/undefined input', () => {
    expect(parseSearchResponse(null)).toEqual([]);
    expect(parseSearchResponse(undefined)).toEqual([]);
  });

  test('returns empty array for invalid input types', () => {
    expect(parseSearchResponse('invalid')).toEqual([]);
    expect(parseSearchResponse(123)).toEqual([]);
    expect(parseSearchResponse([])).toEqual([]);
  });

  test('returns empty array for missing data field', () => {
    const apiResponse = {
      totalHits: 10
      // Missing 'data' field
    };
    
    const result = parseSearchResponse(apiResponse);
    expect(result).toEqual([]);
  });

  test('filters out entries missing required fields', () => {
    const apiResponse = {
      totalHits: 3,
      data: [
        { id: 'ValidPackage', version: '1.0.0' },
        { version: '2.0.0' }, // Missing id
        { id: 'AnotherValid', version: '3.0.0' },
        { id: '' }, // Empty id and missing version
      ]
    };
    
    const result = parseSearchResponse(apiResponse);
    expect(result).toHaveLength(2);
    expect(result.map(r => r.id)).toEqual(['ValidPackage', 'AnotherValid']);
  });

  test('handles multiple packages in single response', () => {
    const apiResponse = {
      totalHits: 3,
      data: [
        { id: 'Package1', version: '1.0.0' },
        { id: 'Package2', version: '2.0.0' },
        { id: 'Package3', version: '3.0.0' }
      ]
    };
    
    const result = parseSearchResponse(apiResponse);
    expect(result).toHaveLength(3);
  });
});
```

### Step 3: Build HTTP Client

**File**: `src/env/node/nugetApiClient.ts`

**Implementation**:
```typescript
// src/env/node/nugetApiClient.ts
import type { ILogger } from '../../services/loggerService';
import type { PackageSearchResult } from '../../domain/models/packageSearchResult';
import type { SearchOptions } from '../../domain/models/searchOptions';
import type { NuGetResult } from '../../domain/models/nugetError';
import { parseSearchResponse } from '../../domain/parsers/searchParser';

/**
 * NuGet Search API v3 client.
 * 
 * Uses native Node.js fetch with AbortController for timeout management.
 * Returns NuGetResult<T> for consistent error handling.
 * 
 * Features:
 * - 30-second timeout for all requests
 * - Caller-controlled cancellation via AbortSignal
 * - Rate limit detection with retry-after metadata
 * - Comprehensive error handling and logging
 */
export class NuGetApiClient {
  private readonly baseUrl = 'https://azuresearch-usnc.nuget.org/query';
  private readonly timeout = 30000; // 30 seconds

  constructor(private logger: ILogger) {}

  /**
   * Search NuGet packages by query with optional filters.
   * 
   * @param options - Search parameters (query, prerelease, pagination)
   * @param signal - Optional AbortSignal for caller-controlled cancellation
   * @returns NuGetResult with PackageSearchResult array or error
   * 
   * @example
   * ```typescript
   * const result = await client.searchPackages({ query: 'Newtonsoft.Json' });
   * if (result.success) {
   *   console.log(`Found ${result.result.length} packages`);
   * } else {
   *   console.error(`Error: ${result.error.message}`);
   * }
   * ```
   */
  async searchPackages(
    options: SearchOptions,
    signal?: AbortSignal
  ): Promise<NuGetResult<PackageSearchResult[]>> {
    const url = this.buildSearchUrl(options);
    
    this.logger.debug('NuGet search request', { 
      url, 
      query: options.query, 
      prerelease: options.prerelease 
    });

    // Create combined abort controller for timeout + caller cancellation
    const controller = new AbortController();
    
    // Link caller's signal
    if (signal) {
      if (signal.aborted) {
        return { 
          success: false, 
          error: { code: 'Network', message: 'Request cancelled by caller' } 
        };
      }
      signal.addEventListener('abort', () => controller.abort());
    }
    
    // Set timeout
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, { 
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'vscode-opm/1.0.0'
        }
      });

      clearTimeout(timeoutId);

      // Handle rate limiting (429)
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
        this.logger.warn('NuGet API rate limit exceeded', { retryAfter });
        return {
          success: false,
          error: {
            code: 'RateLimit',
            message: `API rate limit exceeded. Retry after ${retryAfter} seconds.`,
            retryAfter
          }
        };
      }

      // Handle other HTTP errors
      if (!response.ok) {
        this.logger.error('NuGet API error response', { 
          status: response.status, 
          statusText: response.statusText 
        });
        return {
          success: false,
          error: {
            code: 'ApiError',
            message: `API request failed: ${response.statusText}`,
            statusCode: response.status
          }
        };
      }

      // Parse JSON response
      let json: unknown;
      try {
        json = await response.json();
      } catch (parseError) {
        this.logger.error('Failed to parse NuGet API response', parseError as Error);
        return {
          success: false,
          error: {
            code: 'ParseError',
            message: 'Invalid JSON response from API',
            details: (parseError as Error).message
          }
        };
      }

      // Transform to domain model
      const results = parseSearchResponse(json);
      
      this.logger.debug('NuGet search completed', { 
        resultCount: results.length,
        totalHits: (json as any)?.totalHits 
      });

      return { success: true, result: results };

    } catch (error) {
      clearTimeout(timeoutId);

      // Check if request was aborted
      if ((error as Error).name === 'AbortError') {
        const message = signal?.aborted 
          ? 'Request cancelled by caller' 
          : 'Request timeout exceeded (30s)';
        
        this.logger.warn('NuGet API request aborted', { message });
        return {
          success: false,
          error: { code: 'Network', message }
        };
      }

      // Generic network error
      this.logger.error('NuGet API network error', error as Error);
      return {
        success: false,
        error: {
          code: 'Network',
          message: 'Network request failed',
          details: (error as Error).message
        }
      };
    }
  }

  /**
   * Builds the search URL with query parameters.
   * 
   * Parameters:
   * - q: Search query (omitted if empty for browsing all packages)
   * - prerelease: Include prerelease versions (default: false)
   * - skip: Pagination offset (default: 0)
   * - take: Results per page (default: 20)
   * - semVerLevel: SemVer compatibility (default: "2.0.0")
   */
  private buildSearchUrl(options: SearchOptions): string {
    const params = new URLSearchParams();
    
    if (options.query) {
      params.append('q', options.query);
    }
    
    params.append('prerelease', String(options.prerelease ?? false));
    params.append('skip', String(options.skip ?? 0));
    params.append('take', String(options.take ?? 20));
    params.append('semVerLevel', options.semVerLevel ?? '2.0.0');
    
    return `${this.baseUrl}?${params.toString()}`;
  }
}

/**
 * Factory function for creating NuGetApiClient with logger injection.
 * Follows the same pattern as createLogger() in extension.ts.
 */
export function createNuGetApiClient(logger: ILogger): NuGetApiClient {
  return new NuGetApiClient(logger);
}
```

**Client Tests**:
```typescript
// src/env/node/__tests__/nugetApiClient.test.ts
import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { NuGetApiClient } from '../nugetApiClient';
import type { ILogger } from '../../../services/loggerService';

// Mock logger
const createMockLogger = (): ILogger => ({
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
  debug: mock(() => {}),
  show: mock(() => {}),
  isDebugEnabled: () => false,
  dispose: mock(() => {})
});

describe('NuGetApiClient', () => {
  let logger: ILogger;
  let client: NuGetApiClient;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    logger = createMockLogger();
    client = new NuGetApiClient(logger);
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('buildSearchUrl', () => {
    test('builds URL with query parameter', async () => {
      globalThis.fetch = mock(async (url: string) => {
        expect(url).toContain('q=Newtonsoft.Json');
        return new Response(JSON.stringify({ totalHits: 0, data: [] }));
      }) as any;

      await client.searchPackages({ query: 'Newtonsoft.Json' });
    });

    test('omits query parameter when not provided', async () => {
      globalThis.fetch = mock(async (url: string) => {
        expect(url).not.toContain('q=');
        return new Response(JSON.stringify({ totalHits: 0, data: [] }));
      }) as any;

      await client.searchPackages({});
    });

    test('includes prerelease parameter', async () => {
      globalThis.fetch = mock(async (url: string) => {
        expect(url).toContain('prerelease=true');
        return new Response(JSON.stringify({ totalHits: 0, data: [] }));
      }) as any;

      await client.searchPackages({ prerelease: true });
    });

    test('includes pagination parameters', async () => {
      globalThis.fetch = mock(async (url: string) => {
        expect(url).toContain('skip=10');
        expect(url).toContain('take=50');
        return new Response(JSON.stringify({ totalHits: 0, data: [] }));
      }) as any;

      await client.searchPackages({ skip: 10, take: 50 });
    });

    test('includes semVerLevel parameter', async () => {
      globalThis.fetch = mock(async (url: string) => {
        expect(url).toContain('semVerLevel=2.0.0');
        return new Response(JSON.stringify({ totalHits: 0, data: [] }));
      }) as any;

      await client.searchPackages({});
    });
  });

  describe('successful search', () => {
    test('returns parsed results on successful response', async () => {
      const mockData = {
        totalHits: 1,
        data: [{
          id: 'Newtonsoft.Json',
          version: '13.0.3',
          description: 'JSON framework',
          authors: ['James Newton-King'],
          totalDownloads: 1000000,
          iconUrl: 'https://example.com/icon.png',
          verified: true,
          tags: ['json']
        }]
      };

      globalThis.fetch = mock(async () => 
        new Response(JSON.stringify(mockData))
      ) as any;

      const result = await client.searchPackages({ query: 'Newtonsoft' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toHaveLength(1);
        expect(result.result[0].id).toBe('Newtonsoft.Json');
      }
    });

    test('returns empty array for zero results', async () => {
      globalThis.fetch = mock(async () => 
        new Response(JSON.stringify({ totalHits: 0, data: [] }))
      ) as any;

      const result = await client.searchPackages({ query: 'NonExistent' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toEqual([]);
      }
    });
  });

  describe('error handling', () => {
    test('handles 429 rate limit with retry-after', async () => {
      globalThis.fetch = mock(async () => 
        new Response('', { 
          status: 429,
          headers: { 'Retry-After': '120' }
        })
      ) as any;

      const result = await client.searchPackages({ query: 'test' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('RateLimit');
        expect(result.error.retryAfter).toBe(120);
      }
    });

    test('handles 429 rate limit without retry-after header', async () => {
      globalThis.fetch = mock(async () => 
        new Response('', { status: 429 })
      ) as any;

      const result = await client.searchPackages({ query: 'test' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('RateLimit');
        expect(result.error.retryAfter).toBe(60); // Default
      }
    });

    test('handles HTTP error responses', async () => {
      globalThis.fetch = mock(async () => 
        new Response('Internal Server Error', { 
          status: 500,
          statusText: 'Internal Server Error'
        })
      ) as any;

      const result = await client.searchPackages({ query: 'test' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ApiError');
        expect(result.error.statusCode).toBe(500);
      }
    });

    test('handles invalid JSON response', async () => {
      globalThis.fetch = mock(async () => 
        new Response('Not valid JSON')
      ) as any;

      const result = await client.searchPackages({ query: 'test' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ParseError');
      }
    });

    test('handles network errors', async () => {
      globalThis.fetch = mock(async () => {
        throw new Error('Network connection failed');
      }) as any;

      const result = await client.searchPackages({ query: 'test' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('Network');
      }
    });
  });

  describe('timeout and cancellation', () => {
    test('handles request timeout (30s)', async () => {
      globalThis.fetch = mock(async (_url, options: any) => {
        // Simulate timeout by triggering abort
        await new Promise(resolve => setTimeout(resolve, 50));
        options.signal.dispatchEvent(new Event('abort'));
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        throw error;
      }) as any;

      const result = await client.searchPackages({ query: 'test' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('Network');
        expect(result.error.message).toContain('timeout');
      }
    }, 10000); // Increase test timeout

    test('handles caller cancellation via AbortSignal', async () => {
      const controller = new AbortController();
      
      globalThis.fetch = mock(async (_url, options: any) => {
        // Simulate cancellation
        controller.abort();
        options.signal.dispatchEvent(new Event('abort'));
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        throw error;
      }) as any;

      const result = await client.searchPackages({ query: 'test' }, controller.signal);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('Network');
        expect(result.error.message).toContain('cancelled');
      }
    });

    test('returns early if signal already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      globalThis.fetch = mock(async () => {
        throw new Error('Should not be called');
      }) as any;

      const result = await client.searchPackages({ query: 'test' }, controller.signal);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('Network');
        expect(result.error.message).toContain('cancelled');
      }
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  describe('logging', () => {
    test('logs debug info for successful requests', async () => {
      globalThis.fetch = mock(async () => 
        new Response(JSON.stringify({ totalHits: 5, data: [] }))
      ) as any;

      await client.searchPackages({ query: 'test' });

      expect(logger.debug).toHaveBeenCalledWith(
        'NuGet search request',
        expect.any(Object)
      );
      expect(logger.debug).toHaveBeenCalledWith(
        'NuGet search completed',
        expect.any(Object)
      );
    });

    test('logs errors for failed requests', async () => {
      globalThis.fetch = mock(async () => {
        throw new Error('Network error');
      }) as any;

      await client.searchPackages({ query: 'test' });

      expect(logger.error).toHaveBeenCalledWith(
        'NuGet API network error',
        expect.any(Error)
      );
    });
  });
});
```

### Step 4: Integration with Extension

**Modify Extension Activation** to create and register NuGetApiClient:

```typescript
// src/extension.ts (modifications)
import { createNuGetApiClient } from './env/node/nugetApiClient';

export function activate(context: vscode.ExtensionContext) {
  const logger = createLogger(context);
  context.subscriptions.push(logger);
  
  // Create NuGet API client
  const nugetClient = createNuGetApiClient(logger);
  
  // TODO: Register client with service locator or DI container
  // For now, pass to commands that need it
  
  // ... rest of activation
}
```

### Step 5: Validation & Testing

**Unit Tests**:
```bash
# Run all tests
bun test

# Run specific test suites
bun test src/domain/parsers/__tests__/searchParser.test.ts
bun test src/env/node/__tests__/nugetApiClient.test.ts
```

**Manual Integration Test**:
```typescript
// Create a quick validation script
// scripts/test-nuget-api.ts
import { createNuGetApiClient } from '../src/env/node/nugetApiClient';

// Mock logger for script
const mockLogger = {
  debug: (msg: string, data?: any) => console.log(`[DEBUG] ${msg}`, data),
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  warn: (msg: string) => console.log(`[WARN] ${msg}`),
  error: (msg: string, err?: Error) => console.error(`[ERROR] ${msg}`, err),
  show: () => {},
  isDebugEnabled: () => true,
  dispose: () => {}
};

async function testNuGetApi() {
  const client = createNuGetApiClient(mockLogger as any);
  
  console.log('\n=== Testing NuGet Search API ===\n');
  
  // Test 1: Search for popular package
  console.log('Test 1: Searching for "Newtonsoft.Json"...');
  const result1 = await client.searchPackages({ query: 'Newtonsoft.Json' });
  if (result1.success) {
    console.log(`✓ Found ${result1.result.length} results`);
    if (result1.result[0]) {
      console.log(`  - ${result1.result[0].id} v${result1.result[0].version}`);
      console.log(`  - Downloads: ${result1.result[0].downloadCount}`);
      console.log(`  - Verified: ${result1.result[0].verified}`);
    }
  } else {
    console.error(`✗ Error: ${result1.error.message}`);
  }
  
  // Test 2: Search with prerelease
  console.log('\nTest 2: Searching for "Serilog" with prerelease...');
  const result2 = await client.searchPackages({ 
    query: 'Serilog', 
    prerelease: true,
    take: 5
  });
  if (result2.success) {
    console.log(`✓ Found ${result2.result.length} results (including prerelease)`);
  } else {
    console.error(`✗ Error: ${result2.error.message}`);
  }
  
  // Test 3: Pagination
  console.log('\nTest 3: Testing pagination (skip=10, take=5)...');
  const result3 = await client.searchPackages({ 
    query: 'Microsoft', 
    skip: 10,
    take: 5
  });
  if (result3.success) {
    console.log(`✓ Found ${result3.result.length} results`);
  } else {
    console.error(`✗ Error: ${result3.error.message}`);
  }
  
  // Test 4: Cancellation
  console.log('\nTest 4: Testing request cancellation...');
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 100); // Cancel after 100ms
  const result4 = await client.searchPackages({ query: 'test' }, controller.signal);
  if (!result4.success && result4.error.code === 'Network') {
    console.log('✓ Request cancelled successfully');
  } else {
    console.error('✗ Expected cancellation error');
  }
  
  console.log('\n=== Tests Complete ===\n');
}

testNuGetApi().catch(console.error);
```

Run validation:
```bash
bun run scripts/test-nuget-api.ts
```

## File Structure Summary

```
src/
├── domain/
│   ├── models/
│   │   ├── index.ts                    (NEW - exports)
│   │   ├── packageSearchResult.ts      (NEW - interface)
│   │   ├── searchOptions.ts            (NEW - interface)
│   │   └── nugetError.ts               (NEW - error types)
│   ├── parsers/
│   │   ├── searchParser.ts             (NEW - JSON transformer)
│   │   └── __tests__/
│   │       └── searchParser.test.ts    (NEW - parser tests)
│   └── domainProvider.ts               (UNCHANGED)
├── env/
│   └── node/
│       ├── nugetApiClient.ts           (NEW - HTTP client)
│       └── __tests__/
│           └── nugetApiClient.test.ts  (NEW - client tests)
└── extension.ts                        (MODIFY - create client)

scripts/
└── test-nuget-api.ts                   (NEW - manual validation)
```

## Testing Checklist

### Parser Tests
- [ ] Valid API response with all fields
- [ ] Missing optional fields with defaults
- [ ] Authors normalization (string and array)
- [ ] Zero results
- [ ] Invalid input types
- [ ] Missing required fields (id, version)
- [ ] Multiple packages

### Client Tests
- [ ] URL construction with parameters
- [ ] Successful search returns parsed results
- [ ] Empty results
- [ ] 429 rate limit handling
- [ ] HTTP error responses (4xx, 5xx)
- [ ] Invalid JSON response
- [ ] Network errors
- [ ] Request timeout (30s)
- [ ] Caller cancellation via AbortSignal
- [ ] Already-aborted signal
- [ ] Debug logging

### Manual Validation
- [ ] Search for "Newtonsoft.Json" returns results
- [ ] Search with `prerelease: true` includes prerelease versions
- [ ] Pagination works correctly (skip/take)
- [ ] Request cancellation works
- [ ] Icon URLs resolve correctly
- [ ] Verified badge appears for Microsoft packages
- [ ] Empty query returns all packages (browse mode)

## Error Handling Reference

| Error Code | Trigger | Retry Strategy |
|---|---|---|
| `RateLimit` | HTTP 429 | Exponential backoff, respect `retryAfter` |
| `Network` | Timeout, connection failure, abort | User retry, check connectivity |
| `ApiError` | HTTP 4xx/5xx (except 429) | User retry, check API status |
| `ParseError` | Invalid JSON | Log error, notify user of API issue |

## Future Enhancements (Out of Scope)

These will be addressed in subsequent stories:

1. **STORY-001-01-011**: Search results caching (5 min TTL)
2. **STORY-001-01-010**: Request deduplication for duplicate in-flight queries
3. **Response streaming**: For very large result sets (>1000 items)
4. **Package details API**: Registration endpoint for full package metadata
5. **Authentication**: Support for private NuGet feeds with auth tokens

## References

- [NuGet Search API Documentation](https://learn.microsoft.com/en-us/nuget/api/search-query-service-resource)
- [Node.js Fetch API](https://nodejs.org/dist/latest-v22.x/docs/api/globals.html#fetch)
- [AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)
- [STORY-001-01-001](../stories/STORY-001-01-001-nuget-search-api.md)

---

**Implementation Plan ID**: IMPL-001-01-001-nuget-search-api  
**Story**: [STORY-001-01-001](../stories/STORY-001-01-001-nuget-search-api.md)  
**Author**: GitHub Copilot  
**Status**: Ready for Implementation
