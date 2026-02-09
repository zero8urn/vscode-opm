# IMPL-REDESIGN-03: API Client Decomposition

> **Phase 3 of 6** — Break 1376 LOC monolith into 4 focused services using Facade + Strategy patterns

**Status:** Planning  
**Priority:** P1  
**Estimated Effort:** 3 weeks  
**Risk Level:** High (complex refactor)  
**Dependencies:** Phase 1 (Foundation), Phase 2 (Command Template)

---

## Overview

### Problem
Current `NuGetApiClient` is 1376 LOC with 4 distinct responsibilities:
1. Service index resolution (endpoints discovery)
2. Package search (query execution)
3. Package metadata fetch (registration API)
4. README download (content retrieval)

### Solution
Apply **Facade** + **Strategy** patterns to decompose into:

```
NuGetApiFacade (~100 LOC)           // Facade: simple public API
├── ServiceIndexResolver (~80 LOC)   // Strategy: endpoint discovery
├── SearchExecutor (~120 LOC)        // Strategy: search API
├── MetadataFetcher (~150 LOC)       // Strategy: registration API
└── ReadmeFetcher (~90 LOC)          // Strategy: README download

HttpPipeline (~80 LOC)              // Decorator: retry/rate limit
├── RateLimitMiddleware (~40 LOC)
└── RetryMiddleware (~40 LOC)

Source Adapters (3 × ~50 LOC)       // Adapter: source-specific logic
├── NuGetOrgAdapter
├── LocalFeedAdapter
└── CustomSourceAdapter
```

### Success Criteria
- ✅ 1376 LOC → 1080 LOC across 9 files (21% reduction + better cohesion)
- ✅ Each service ≤200 LOC
- ✅ 100% test coverage maintained
- ✅ All existing API calls work unchanged

---

## Implementation Steps

### Step 1: Extract ServiceIndexResolver

**File:** `src/api/services/serviceIndexResolver.ts` (~80 LOC)

**Responsibility:** Discover and cache NuGet API endpoints

```typescript
import type { Result, AppError } from '../../core/result';
import { ok, fail } from '../../core/result';
import type { IHttpClient } from '../../infrastructure/httpClient';

export interface ServiceIndex {
  readonly searchQueryService: string;
  readonly registrationBaseUrl: string;
  readonly packageBaseAddress: string;
}

export interface IServiceIndexResolver {
  resolve(sourceUrl: string): Promise<Result<ServiceIndex, AppError>>;
  invalidateCache(sourceUrl: string): void;
}

export class ServiceIndexResolver implements IServiceIndexResolver {
  private readonly cache = new Map<string, ServiceIndex>();

  constructor(private readonly http: IHttpClient) {}

  async resolve(sourceUrl: string): Promise<Result<ServiceIndex, AppError>> {
    // Check cache
    if (this.cache.has(sourceUrl)) {
      return ok(this.cache.get(sourceUrl)!);
    }

    // Fetch service index
    const indexUrl = `${sourceUrl}/v3/index.json`;
    const response = await this.http.get<{ resources: Array<{ '@type': string; '@id': string }> }>(indexUrl);

    if (!response.success) return response;

    // Parse endpoints
    const resources = response.value.resources;
    const searchUrl = resources.find(r => r['@type'].includes('SearchQueryService'))?. ['@id'];
    const registrationUrl = resources.find(r => r['@type'].includes('RegistrationsBaseUrl'))?. ['@id'];
    const packageUrl = resources.find(r => r['@type'].includes('PackageBaseAddress'))?. ['@id'];

    if (!searchUrl || !registrationUrl) {
      return fail({ code: 'ApiError', message: 'Invalid service index: missing required endpoints' });
    }

    const index: ServiceIndex = {
      searchQueryService: searchUrl,
      registrationBaseUrl: registrationUrl,
      packageBaseAddress: packageUrl || '',
    };

    this.cache.set(sourceUrl, index);
    return ok(index);
  }

  invalidateCache(sourceUrl: string): void {
    this.cache.delete(sourceUrl);
  }
}
```

**Tests:** 10 unit tests covering cache hits, errors, missing endpoints

**Acceptance Criteria:**
- [ ] Service index caching works
- [ ] Handles malformed responses
- [ ] All endpoint types extracted
- [ ] 10 unit tests pass

---

### Step 2: Extract SearchExecutor

**File:** `src/api/services/searchExecutor.ts` (~120 LOC)

**Responsibility:** Execute package searches with pagination, filtering, sorting

```typescript
export interface SearchOptions {
  query: string;
  skip?: number;
  take?: number;
  prerelease?: boolean;
  packageType?: string;
  semVerLevel?: string;
}

export interface SearchResult {
  totalHits: number;
  data: PackageSearchResult[];
}

export interface ISearchExecutor {
  search(sourceUrl: string, options: SearchOptions): Promise<Result<SearchResult, AppError>>;
}

export class SearchExecutor implements ISearchExecutor {
  constructor(
    private readonly http: IHttpClient,
    private readonly indexResolver: IServiceIndexResolver,
  ) {}

  async search(sourceUrl: string, options: SearchOptions): Promise<Result<SearchResult, AppError>> {
    // Resolve search endpoint
    const indexResult = await this.indexResolver.resolve(sourceUrl);
    if (!indexResult.success) return indexResult;

    const searchUrl = indexResult.value.searchQueryService;

    // Build query params
    const params = new URLSearchParams({
      q: options.query || '',
      skip: String(options.skip || 0),
      take: String(options.take || 20),
      prerelease: String(options.prerelease ?? false),
      semVerLevel: options.semVerLevel || '2.0.0',
    });

    if (options.packageType) params.set('packageType', options.packageType);

    // Execute search
    const response = await this.http.get<{ totalHits: number; data: any[] }>(`${searchUrl}?${params}`);

    if (!response.success) return response;

    return ok({
      totalHits: response.value.totalHits,
      data: response.value.data.map(this.mapToSearchResult),
    });
  }

  private mapToSearchResult(raw: any): PackageSearchResult {
    // Parsing logic extracted from original client
    return {
      id: raw.id,
      version: raw.version,
      description: raw.description || '',
      authors: raw.authors?.join(', ') || '',
      totalDownloads: raw.totalDownloads || 0,
      // ... rest of mapping
    };
  }
}
```

**Tests:** 15 unit tests for search, pagination, filtering

**Acceptance Criteria:**
- [ ] Search with all filters works
- [ ] Pagination parameters correct
- [ ] Response mapping complete
- [ ] 15 unit tests pass

---

### Step 3: Extract MetadataFetcher & ReadmeFetcher

**Similar pattern:** Each service ~100-150 LOC with focused responsibility

**Files:**
- `src/api/services/metadataFetcher.ts` — Registration API (versions, deps, metadata)
- `src/api/services/readmeFetcher.ts` — README download and sanitization

**Acceptance Criteria:**
- [ ] Each service ≤200 LOC
- [ ] 10 tests per service
- [ ] Original functionality preserved

---

### Step 4: Create NuGetApiFacade

**File:** `src/api/nugetApiFacade.ts` (~100 LOC)

**Facade Pattern:** Simple public API delegating to specialized services

```typescript
export class NuGetApiFacade implements INuGetClient {
  constructor(
    private readonly searchExecutor: ISearchExecutor,
    private readonly metadataFetcher: IMetadataFetcher,
    private readonly readmeFetcher: IReadmeFetcher,
  ) {}

  async searchPackages(options: SearchOptions): Promise<Result<SearchResult, AppError>> {
    return this.searchExecutor.search('https://api.nuget.org/v3/index.json', options);
  }

  async getPackageMetadata(packageId: string): Promise<Result<PackageMetadata, AppError>> {
    return this.metadataFetcher.fetch('https://api.nuget.org/v3/index.json', packageId);
  }

  async getReadme(packageId: string, version: string): Promise<Result<string, AppError>> {
    return this.readmeFetcher.fetch('https://api.nuget.org/v3/index.json', packageId, version);
  }

  // Delegate to other services...
}
```

**Acceptance Criteria:**
- [ ] Facade is ≤100 LOC
- [ ] No business logic in facade
- [ ] All original methods delegated
- [ ] API surface unchanged

---

### Step 5: Implement HTTP Pipeline (Decorators)

**File:** `src/infrastructure/httpPipeline.ts` (~80 LOC)

**Decorator Pattern:** Wrap HTTP client with retry/rate limit middleware

```typescript
export class HttpPipeline implements IHttpClient {
  constructor(
    private readonly baseClient: IHttpClient,
    private readonly middleware: IHttpMiddleware[] = [],
  ) {}

  async get<T>(url: string): Promise<Result<T, AppError>> {
    return this.execute(() => this.baseClient.get<T>(url));
  }

  private async execute<T>(request: () => Promise<Result<T, AppError>>): Promise<Result<T, AppError>> {
    let result = request;
    // Apply middleware in reverse (decorator chaining)
    for (const mw of this.middleware.reverse()) {
      const current = result;
      result = () => mw.execute(current);
    }
    return result();
  }
}

export class RateLimitMiddleware implements IHttpMiddleware {
  private lastRequest = 0;
  private readonly minInterval = 100; // ms

  async execute<T>(next: () => Promise<Result<T, AppError>>): Promise<Result<T, AppError>> {
    const now = Date.now();
    const elapsed = now - this.lastRequest;
    if (elapsed < this.minInterval) {
      await sleep(this.minInterval - elapsed);
    }
    this.lastRequest = Date.now();
    return next();
  }
}

export class RetryMiddleware implements IHttpMiddleware {
  async execute<T>(next: () => Promise<Result<T, AppError>>): Promise<Result<T, AppError>> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await next();
      if (result.success || result.error.code !== 'Network') return result;
      await sleep(Math.pow(2, attempt) * 1000); // Exponential backoff
    }
    return next(); // Final attempt
  }
}
```

**Tests:** 15 tests for middleware composition, retry logic, rate limiting

**Acceptance Criteria:**
- [ ] Retry with exponential backoff
- [ ] Rate limiting enforced
- [ ] Middleware composable
- [ ] 15 unit tests pass

---

### Step 6: Wire Dependencies & Update Extension

**File:** `src/extension.ts`

```typescript
// Old:
const nugetClient = createNuGetApiClient();

// New:
const httpClient = new HttpClient();
const pipeline = new HttpPipeline(httpClient, [
  new RetryMiddleware(),
  new RateLimitMiddleware(),
]);
const indexResolver = new ServiceIndexResolver(pipeline);
const searchExecutor = new SearchExecutor(pipeline, indexResolver);
const metadataFetcher = new MetadataFetcher(pipeline, indexResolver);
const readmeFetcher = new ReadmeFetcher(pipeline, indexResolver);
const nugetClient = new NuGetApiFacade(searchExecutor, metadataFetcher, readmeFetcher);
```

**Acceptance Criteria:**
- [ ] All commands use facade
- [ ] Middleware applied globally
- [ ] E2E tests pass unchanged

---

## Rollback Plan

**Risk:** High — core API integration, network errors affect all features

**Strategy:**
1. Keep old `NuGetApiClient` as `NuGetApiClient.legacy.ts`
2. Feature flag to toggle implementations
3. Run both in parallel (assert same results)

**Rollback Trigger:**
- Test failure rate >10%
- Performance regression >20%
- Production errors increase

---

## Next Steps

After Phase 3:
- ✅ API client decomposed into 9 focused services
- ✅ HTTP pipeline with retry/rate limit
- 🚀 **Proceed to Phase 4:** Webview Mediator

---

## Related Documents
- **Master Plan:** [IMPL-REDESIGN-00-MASTER-PLAN.md](IMPL-REDESIGN-00-MASTER-PLAN.md)
- **Previous:** [IMPL-REDESIGN-02-COMMAND-TEMPLATE.md](IMPL-REDESIGN-02-COMMAND-TEMPLATE.md)
- **Next:** [IMPL-REDESIGN-04-WEBVIEW-MEDIATOR.md](IMPL-REDESIGN-04-WEBVIEW-MEDIATOR.md)
