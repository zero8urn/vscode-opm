# STORY-001-01-010-request-deduplication

**Feature**: [FEAT-001-01-browse-search](../features/FEAT-001-01-browse-search.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Descoped  
**Priority**: Low (Nice to Have)  
**Estimate**: 3 Story Points  
**Created**: 2025-11-16  
**Last Updated**: 2025-12-30

## User Story

**As a** developer using the NuGet Package Management extension  
**I want** duplicate in-flight API requests to be automatically deduplicated  
**So that** I avoid unnecessary network calls and respect API rate limits when multiple components request the same data simultaneously

## Description

This story implements a promise-based request deduplication cache to prevent duplicate concurrent API requests to the NuGet service. When multiple callers request the same data (e.g., package details for "Newtonsoft.Json" version "13.0.1") while a request is already in-flight, the cache returns the same shared promise instead of making duplicate HTTP calls.

The deduplication cache complements but differs from response caching (STORY-011, STORY-012): response caches store completed results with TTL expiration, while deduplication caches track only in-flight promises and auto-cleanup on resolution. This prevents race conditions in scenarios like rapid search query changes, double-clicking package items, or concurrent webview component initialization requesting the same metadata.

Current partial implementation in `SearchService.isLoading` guards pagination requests, but doesn't prevent duplicate concurrent searches, package details requests (`getPackageIndex`, `getPackageVersion`, `getPackageReadme`), or cross-component duplication. A centralized `PromiseCache<T>` utility would provide consistent deduplication across all NuGet API client methods.

**Descoping Rationale**: With proper 300ms search input debouncing and existing `isLoading` guards, duplicate requests are edge cases. Response caching (STORY-011/012) provides greater performance benefit. This story can be revisited if API rate limiting becomes a production issue.

## Acceptance Criteria

### Scenario: Concurrent Package Details Requests
**Given** the webview is loading and package details panel is initializing  
**When** both components request metadata for the same package (e.g., "Serilog") simultaneously  
**Then** only one HTTP request to NuGet API is made, and both callers receive the same promise result

### Scenario: Rapid Search Query Changes
**Given** a user is typing "Newto" in the search box  
**When** the debounce timer fires multiple search requests before the first completes (slow network)  
**Then** duplicate search requests for identical queries are deduplicated, returning the in-flight promise

### Scenario: Promise Auto-Cleanup on Resolution
**Given** a deduplicated promise for package "Moq" is in-flight  
**When** the HTTP request completes (success or failure)  
**Then** the cache entry is automatically removed to prevent memory leaks

### Scenario: Different Request Parameters Bypass Cache
**Given** a request for "Newtonsoft.Json" version "13.0.1" is in-flight  
**When** another request for "Newtonsoft.Json" version "13.0.2" is made  
**Then** both requests execute independently (different cache keys)

### Additional Criteria
- [ ] Cache key generation uses stable serialization (package ID, version, source ID)
- [ ] Promise failures are propagated to all waiting callers, not cached
- [ ] Cache entries auto-cleanup after promise settles (no manual eviction needed)
- [ ] Cache size is unbounded (short-lived entries, no TTL needed)
- [ ] Deduplication works across all NuGetApiClient methods (search, getPackageIndex, getPackageVersion, getPackageReadme)

## Technical Implementation

### Implementation Plan
- No implementation planned (story descoped)
- Reference implementation would create `src/domain/cache/promiseCache.ts`
- Would integrate into `NuGetApiClient` constructor with optional DI for testing

### Key Components
- **File/Module**: `src/domain/cache/promiseCache.ts` - Generic promise deduplication cache
- **Integration**: `src/env/node/nugetApiClient.ts` - Wrap fetch calls with deduplication

### Technical Approach

The cache would use a `Map<string, Promise<T>>` keyed by request signature (method + parameters). When a request is made:
1. Generate cache key from method name + normalized parameters (JSON.stringify with sorted keys)
2. Check if promise exists in cache; if yes, return existing promise
3. If no, create new promise, store in cache, attach `.finally()` cleanup handler
4. Return promise to caller

Cache keys would use format: `${method}:${JSON.stringify(normalizedParams)}` where normalizedParams excludes AbortSignal (not part of deduplication key) and sorts object keys for stable serialization.

Auto-cleanup via `.finally()` ensures entries are removed immediately when promise settles, preventing unbounded memory growth. No TTL or LRU eviction needed since entries are short-lived (duration of HTTP request).

### API/Integration Points
- `INuGetApiClient` - All public methods would be wrapped with deduplication
- `AbortSignal` - Excluded from cache keys, but cancellation propagated to underlying request

## Testing Strategy

### Unit Tests
- [ ] Test: Concurrent identical requests return same promise instance
- [ ] Test: Resolved promise auto-removes cache entry
- [ ] Test: Rejected promise auto-removes cache entry and propagates error to all callers
- [ ] Test: Different parameters generate different cache keys (no collision)
- [ ] Test: Cache key ignores AbortSignal parameter (not part of deduplication)
- [ ] Test: Cache handles concurrent requests with different source IDs separately

### Integration Tests
- [ ] Integration: Deduplication works with real NuGetApiClient HTTP requests
- [ ] Integration: AbortController cancellation works with deduplicated requests
- [ ] Integration: Network failures deduplicate and propagate errors correctly

### Manual Testing
- [ ] Manual: Open package browser, verify no duplicate network requests in DevTools
- [ ] Manual: Rapidly type search query on slow network, verify deduplication in logs
- [ ] Manual: Double-click package item, verify only one metadata request fires

## Dependencies

### Blocked By
- STORY-001-01-001 (NuGet Search API) - Needs API client implementation to wrap

### Blocks
- None (optimization, not blocking other features)

### External Dependencies
- None (pure TypeScript implementation)

## INVEST Check

- [x] **I**ndependent - Can be developed independently of response caching stories
- [x] **N**egotiable - Could be implemented at SearchService level instead of NuGetApiClient
- [x] **V**aluable - Reduces unnecessary API calls and respects rate limits
- [x] **E**stimable - Well-understood pattern (3 story points reasonable)
- [x] **S**mall - Single utility class + integration into client
- [x] **T**estable - Clear acceptance criteria with unit and integration tests

## Notes

**Descoping Decision (2025-12-30)**: After reviewing existing implementation, partial deduplication already exists (SearchService.isLoading guards pagination). With proper UI debouncing and response caching (STORY-011/012), full request deduplication provides marginal benefit for MVP. Descoped as "Nice to Have" optimization.

**If Implemented**: Consider using WeakMap for automatic garbage collection, or implementing max in-flight limit (e.g., 20 concurrent requests) to prevent resource exhaustion on very slow networks.

**Alternative Approach**: Instead of centralized cache, could add deduplication guards at SearchService and webview orchestration layers using simple `Map<string, Promise>` per service instance. More localized but less reusable.

**Cache Key Collisions**: Ensure source ID is part of cache key to prevent collisions when same package is requested from multiple sources. Example: `search:json:nuget.org` vs `search:json:private-feed`.

## Changelog

| Date | Change | Author |
|---|---|---|
| 2025-11-16 | Story created | AI Assistant |
| 2025-12-30 | Story descoped - existing partial implementation + response caching sufficient for MVP | AI Assistant |

---
**Story ID**: STORY-001-01-010-request-deduplication  
**Feature**: [FEAT-001-01-browse-search](../features/FEAT-001-01-browse-search.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)
