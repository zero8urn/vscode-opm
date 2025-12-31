# STORY-001-01-011-search-cache

**Feature**: [FEAT-001-01-browse-search](../features/FEAT-001-01-browse-search.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Not Started  
**Priority**: Medium  
**Estimate**: 2 Story Points  
**Created**: 2025-11-16  
**Last Updated**: 2025-12-30

## User Story

**As a** developer using the NuGet Package Management extension  
**I want** search results to be cached for 5 minutes  
**So that** repeated searches don't trigger unnecessary NuGet API calls, improving performance and reducing rate limiting risk

## Description

This story implements a time-based cache for NuGet package search results with a 5-minute TTL (time-to-live). The cache stores raw API responses keyed by a composite identifier that includes the package source URL and all query parameters (query string, pagination, prerelease filter, SemVer level). When users perform identical searches within the cache window, results are returned from memory without hitting the NuGet API, significantly improving response times and reducing network overhead.

The search results cache addresses a common usage pattern where developers repeatedly search for the same package while exploring versions, reading documentation, or comparing alternatives. Without caching, every navigation action (switching between search and details views, toggling prerelease filters, or revisiting previous queries) triggers a fresh API call. This creates unnecessary latency and increases the risk of hitting NuGet.org's rate limits (HTTP 429 responses), especially during active browsing sessions.

The implementation uses an in-memory Map-based cache with automatic TTL-based expiration and LRU (Least Recently Used) eviction when the cache exceeds 100 entries. The cache is source-aware, meaning searches against different NuGet feeds (nuget.org vs. private feeds) maintain separate cache entries. This cache layer is distinct from request deduplication (STORY-001-01-010), which prevents duplicate concurrent requests, and from the pagination state management in `SearchService`, which accumulates results for the current active search only.

## Acceptance Criteria

### Scenario: Cache Hit for Repeated Search
**Given** a user has searched for "newtonsoft" with default filters  
**When** the user searches for "newtonsoft" again within 5 minutes  
**Then** the cached results are returned immediately without calling the NuGet API

### Scenario: Cache Miss After TTL Expiration
**Given** a user searched for "serilog" 6 minutes ago  
**When** the user searches for "serilog" again  
**Then** a fresh API call is made and the cache is updated with new results

### Scenario: Different Query Parameters Create Separate Cache Entries
**Given** a user has searched for "json" with prerelease=false  
**When** the user searches for "json" with prerelease=true  
**Then** a separate API call is made (different cache key)

### Scenario: Different Package Sources Create Separate Cache Entries
**Given** a user has searched for "logging" on nuget.org  
**When** the user searches for "logging" on a private feed  
**Then** a separate API call is made (source-aware cache key)

### Scenario: Pagination Parameters Affect Cache Key
**Given** a user has loaded page 1 (skip=0, take=20) for "test"  
**When** the user loads page 2 (skip=20, take=20) for "test"  
**Then** a separate API call is made (different skip offset)

### Additional Criteria
- [ ] Cache stores raw API responses with composite keys: `${sourceUrl}:${queryParams}`
- [ ] Cache entries expire after 5 minutes (300,000ms) from creation timestamp
- [ ] Cache implements LRU eviction when size exceeds 100 entries
- [ ] Cache supports manual invalidation via explicit clear/refresh action
- [ ] Cache keys normalize query parameters for consistency (lowercase, sorted)
- [ ] Cache tracks hit/miss metrics for observability and performance tuning
- [ ] Cached search queries return results in <100ms (per NFR)

## Technical Implementation

### Implementation Plan
This story implements a reusable cache manager that can be shared across search and details caching (STORY-001-01-012).

### Key Components
- **File/Module**: `src/domain/cache/cacheManager.ts` - Generic TTL-based cache with LRU eviction
- **File/Module**: `src/webviews/services/searchService.ts` - Integration of cache into search flow
- **File/Module**: `src/domain/cache/__tests__/cacheManager.test.ts` - Unit tests for cache behavior

### Technical Approach

**Cache Structure:**
```typescript
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class CacheManager<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  
  get(key: string): T | null; // Returns null if expired or missing
  set(key: string, data: T, ttl: number): void;
  invalidate(key: string): void;
  clear(): void;
  prune(): void; // Remove expired entries
  getMetrics(): CacheMetrics;
}
```

**Cache Key Generation:**
- Composite key format: `search:${sourceUrl}:${JSON.stringify(normalizedParams)}`
- Normalized parameters: lowercase query, sorted object keys for consistency
- Example: `search:https://api.nuget.org:{"prerelease":"false","q":"newtonsoft","skip":0,"take":20}`

**Integration Points:**
- `SearchService.fetchPage()` checks cache before calling `nugetClient.searchPackages()`
- Cache manager injected into `SearchService` via constructor DI for testability
- Background pruning via `setInterval()` (every 60 seconds) to clean expired entries

**LRU Eviction Strategy:**
- When cache size exceeds `maxSize` (default: 100), evict oldest entry by insertion order
- Map maintains insertion order (ES2015+ spec), so `map.keys().next().value` is oldest

### API/Integration Points
- `INuGetApiClient.searchPackages()` - Wrapped with cache layer
- `ISearchService` - Extended to support cache invalidation
- No VS Code API dependencies (pure domain logic)

## Testing Strategy

### Unit Tests
- [ ] **Cache hit**: Get returns cached data when entry exists and is not expired
- [ ] **Cache miss**: Get returns null when entry does not exist
- [ ] **TTL expiration**: Get returns null for expired entries (timestamp + ttl < now)
- [ ] **Set with TTL**: Entry is stored with correct timestamp and ttl values
- [ ] **LRU eviction**: Oldest entry is removed when cache exceeds maxSize
- [ ] **Manual invalidation**: Invalidate removes specific entry by key
- [ ] **Clear**: Clear removes all entries from cache
- [ ] **Prune**: Prune removes only expired entries, keeps valid ones
- [ ] **Metrics tracking**: Hit/miss counters increment correctly
- [ ] **Key normalization**: Same query with different parameter order produces same key
- [ ] **Source-aware keys**: Same query on different sources produces different keys

### Integration Tests
- [ ] **Search cache integration**: SearchService uses cache before API call
- [ ] **Cache hit performance**: Cached search completes in <100ms
- [ ] **Cache miss triggers API**: Expired/missing entry calls NuGet API
- [ ] **Pagination cache separation**: Different skip/take values create separate cache entries
- [ ] **Prerelease filter cache separation**: Same query with prerelease=true/false cached separately

### Manual Testing
- [ ] **Repeat search**: Search for "newtonsoft" twice within 5 minutes, verify second is instant (no spinner)
- [ ] **Wait for expiration**: Search for "json", wait 6 minutes, search again, verify API call (spinner appears)
- [ ] **Toggle prerelease**: Search for "serilog", toggle prerelease checkbox, verify new API call
- [ ] **Load more pages**: Search, load page 2, go back to page 1, verify page 1 is cached
- [ ] **Check logs**: Verify cache hit/miss events appear in extension output channel with metrics

## Dependencies

### Blocked By
- STORY-001-01-001 (NuGet Search API Integration) - Requires `INuGetApiClient` interface
- STORY-001-01-002 (Search Webview UI) - Requires `SearchService` implementation

### Blocks
- None - Independent optimization layer

### External Dependencies
- None - Pure TypeScript/Node.js implementation (no external libraries required)

## INVEST Check

- [x] **I**ndependent - Can be developed independently (cache layer is isolated)
- [x] **N**egotiable - Details can be adjusted (TTL, max size, eviction strategy)
- [x] **V**aluable - Delivers value to users (faster repeat searches, reduced rate limiting)
- [x] **E**stimable - Can be estimated (2 story points for cache manager + integration)
- [x] **S**mall - Can be completed in one iteration (~1-2 days for implementation + tests)
- [x] **T**estable - Has clear acceptance criteria (cache hit/miss behavior is deterministic)

## Notes

### Design Decisions

**Why In-Memory vs. Persistent Storage?**
- 5-minute TTL makes persistent storage overkill (overhead not justified)
- Extension reload naturally clears stale cache (acceptable for short TTL)
- In-memory access is <1ms, file I/O would add 10-50ms overhead
- No cross-session cache requirement for search results

**Why Separate from Request Deduplication (STORY-001-01-010)?**
- **Deduplication** prevents concurrent duplicate requests (promise-based, cleared on completion)
- **Caching** prevents sequential duplicate requests (time-based, persists across searches)
- Example: Typing "newtonsoft" triggers deduplication to prevent 10 parallel calls; navigating away and back triggers cache to prevent new API call

**Why Not Use HTTP Cache-Control Headers?**
- NuGet API does not provide reliable `Cache-Control` headers
- Application-level cache gives explicit control over TTL and eviction
- Allows source-aware caching (different feeds, auth credentials)

**Why LRU Eviction at 100 Entries?**
- Average cache entry size: ~5-50KB (search response JSON)
- 100 entries ≈ 0.5-5MB max memory usage (acceptable overhead)
- Typical browsing session involves 10-20 unique queries, so 100 is generous buffer
- Prevents memory bloat in edge cases (e.g., automated testing, rapid source switching)

### Edge Cases

**Scenario: User changes package source mid-session**
- Cache key includes source URL, so switching sources naturally creates separate cache entries
- No explicit invalidation needed

**Scenario: Package published during cache window**
- User may see stale results for up to 5 minutes
- Acceptable tradeoff (VS Code extensions typically don't require real-time package discovery)
- Manual refresh action can bypass cache if needed

**Scenario: Network error during cache miss**
- Return last cached result (even if expired) as fallback with warning banner?
- OR return error and let user retry (current behavior)
- **Decision**: Return error for now; stale data fallback can be added in future enhancement

### Future Enhancements

- **Cache warming**: Pre-populate cache with common searches on extension activation
- **Adaptive TTL**: Extend TTL to 15 minutes during off-peak hours (heuristic-based)
- **Compression**: Store compressed JSON for large result sets (if memory becomes issue)
- **Persistent cache**: Use VS Code `ExtensionContext.globalState` for cross-session caching (if user requests it)

## Changelog

| Date | Change | Author |
|---|---|---|
| 2025-11-16 | Story created | AI Assistant |
| 2025-12-30 | Completed story details: description, acceptance criteria, technical implementation, testing strategy, dependencies, and design notes | AI Assistant |

---
**Story ID**: STORY-001-01-011-search-cache  
**Feature**: [FEAT-001-01-browse-search](../features/FEAT-001-01-browse-search.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)
