import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { createNuGetApiClient } from '../nugetApiClient';
import type { ILogger } from '../../../services/loggerService';

// Mock logger
const createMockLogger = (): ILogger => ({
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
  debug: mock(() => {}),
  show: mock(() => {}),
  isDebugEnabled: mock(() => false),
  dispose: mock(() => {}),
});

const mockServiceIndex = {
  version: '3.0.0',
  resources: [
    {
      '@id': 'https://azuresearch-usnc.nuget.org/query',
      '@type': 'SearchQueryService/3.0.0-rc',
      comment: 'Query endpoint',
    },
    {
      '@id': 'https://api.nuget.org/v3/registration5',
      '@type': 'RegistrationsBaseUrl/3.6.0',
      comment: 'Registration endpoint',
    },
  ],
};

const mockSearchResponse = {
  totalHits: 1,
  data: [
    {
      id: 'Newtonsoft.Json',
      version: '13.0.1',
      description: 'Json.NET is a popular high-performance JSON framework for .NET',
      authors: ['James Newton-King'],
      iconUrl: 'https://www.nuget.org/profiles/newtonsoft/avatar',
      licenseUrl: 'https://licenses.nuget.org/MIT',
      projectUrl: 'https://www.newtonsoft.com/json',
      tags: ['json'],
      verified: true,
      totalDownloads: 1000000,
      versions: [],
    },
  ],
};

describe('NuGetApiClient - Service Index Integration', () => {
  let logger: ILogger;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    logger = createMockLogger();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('service index resolution', () => {
    test('fetches service index and resolves search URL', async () => {
      let fetchCallCount = 0;
      globalThis.fetch = mock(async (url: string) => {
        fetchCallCount++;
        if (url.includes('index.json')) {
          return new Response(JSON.stringify(mockServiceIndex));
        }
        return new Response(JSON.stringify(mockSearchResponse));
      }) as any;

      const client = createNuGetApiClient(logger);
      const result = await client.searchPackages({ query: 'test' });

      expect(result.success).toBe(true);
      expect(fetchCallCount).toBe(2); // One for service index, one for search
    });

    test('caches service index URL across multiple searches', async () => {
      let fetchCallCount = 0;
      globalThis.fetch = mock(async (url: string) => {
        fetchCallCount++;
        if (url.includes('index.json')) {
          return new Response(JSON.stringify(mockServiceIndex));
        }
        return new Response(JSON.stringify(mockSearchResponse));
      }) as any;

      const client = createNuGetApiClient(logger);

      // First search
      await client.searchPackages({ query: 'test1' });
      const firstFetchCount = fetchCallCount;

      // Second search should use cached URL
      await client.searchPackages({ query: 'test2' });

      // Should only fetch service index once (2 fetches for first search, 1 for second)
      expect(fetchCallCount).toBe(firstFetchCount + 1);
    });

    test('returns error when service index fetch fails', async () => {
      globalThis.fetch = mock(async () => {
        return new Response('Not Found', { status: 404 });
      }) as any;

      const client = createNuGetApiClient(logger);
      const result = await client.searchPackages({ query: 'test' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ApiError');
      }
    });

    test('returns error when service index has invalid JSON', async () => {
      globalThis.fetch = mock(async () => {
        return new Response('not json');
      }) as any;

      const client = createNuGetApiClient(logger);
      const result = await client.searchPackages({ query: 'test' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ParseError');
      }
    });

    test('returns error when SearchQueryService not found in service index', async () => {
      const indexWithoutSearch = {
        version: '3.0.0',
        resources: [
          {
            '@id': 'https://api.nuget.org/v3/registration5',
            '@type': 'RegistrationsBaseUrl/3.6.0',
          },
        ],
      };

      globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify(indexWithoutSearch));
      }) as any;

      const client = createNuGetApiClient(logger);
      const result = await client.searchPackages({ query: 'test' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ApiError');
        expect(result.error.message).toContain('SearchQueryService not found');
      }
    });

    test('handles network errors during service index fetch', async () => {
      globalThis.fetch = mock(async () => {
        throw new Error('Network failure');
      }) as any;

      const client = createNuGetApiClient(logger);
      const result = await client.searchPackages({ query: 'test' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('Network');
      }
    });

    test('handles abort signal during service index fetch', async () => {
      globalThis.fetch = mock(async () => {
        throw new DOMException('aborted', 'AbortError');
      }) as any;

      const client = createNuGetApiClient(logger);
      const controller = new AbortController();
      controller.abort();

      const result = await client.searchPackages({ query: 'test' }, controller.signal);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('Network');
      }
    });
  });
});
