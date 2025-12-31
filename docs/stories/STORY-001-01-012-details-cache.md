# STORY-001-01-012-details-cache

**Feature**: [FEAT-001-01-browse-search](../features/FEAT-001-01-browse-search.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Not Started  
**Priority**: Medium  
**Estimate**: 2 Story Points  
**Created**: 2025-11-16  
**Last Updated**: 2025-12-31

## User Story

**As a** developer using the NuGet Package Management extension  
**I want** package details metadata to be cached for 10 minutes  
**So that** viewing the same package multiple times doesn't trigger repeated API calls, improving performance and reducing network overhead

## Description

This story implements a time-based cache for NuGet package metadata (registration API responses) with a 10-minute TTL. The cache stores three types of package data: (1) package indexes containing all available versions, (2) detailed version-specific metadata including dependencies and deprecation information, and (3) README content. When users view package details they've recently accessed, data is served from memory without hitting the NuGet Registration API, significantly reducing latency and API call volume.

Package details caching addresses a common workflow where developers repeatedly view the same package while evaluating alternatives, comparing versions, reading documentation, or preparing to install. Without caching, every interaction (switching between search results, toggling between versions, reopening the details panel after closing it) triggers fresh API calls. This creates unnecessary network overhead and degrades the user experience with visible loading delays, especially for packages with large dependency trees or extensive version histories. The 10-minute TTL is longer than search cache (5 minutes) because package metadata changes less frequently than search result rankings.

The implementation reuses the `CacheManager<T>` class from STORY-001-01-011 but with separate cache instances for different data types. Cache keys are structured hierarchically: package indexes use `index:${sourceUrl}:${packageId}`, version details use `version:${sourceUrl}:${packageId}:${version}`, and READMEs use `readme:${sourceUrl}:${packageId}:${version}`. This multi-layered approach allows selective invalidation (e.g., clearing only version cache when a new version is published) and optimizes memory usage by caching only requested data granularity.

## Acceptance Criteria

### Scenario: Cache Hit for Package Index
**Given** a user has viewed details for "Newtonsoft.Json" (fetched package index with all versions)  
**When** the user views "Newtonsoft.Json" details again within 10 minutes  
**Then** the package index is returned from cache without calling the Registration API

### Scenario: Cache Hit for Specific Version Details
**Given** a user has viewed version "13.0.3" of "Serilog" (fetched version metadata)  
**When** the user views version "13.0.3" details again within 10 minutes  
**Then** the version metadata is returned from cache without API call

### Scenario: Cache Hit for README Content
**Given** a user has viewed the README for "Microsoft.Extensions.Logging" v8.0.0  
**When** the user switches to another package and returns to view the same README within 10 minutes  
**Then** the README content is returned from cache without API call

### Scenario: Cache Miss After TTL Expiration
**Given** a user viewed "EntityFramework" package index 11 minutes ago  
**When** the user views "EntityFramework" details again  
**Then** a fresh Registration API call is made and the cache is updated

### Scenario: Different Versions of Same Package Have Separate Cache Entries
**Given** a user has viewed version "6.0.0" of "AutoMapper"  
**When** the user views version "12.0.1" of "AutoMapper"  
**Then** a separate API call is made for the new version (different cache key)

### Scenario: Different Package Sources Create Separate Cache Entries
**Given** a user has viewed "Logging" package details from nuget.org  
**When** the user views "Logging" package from a private feed  
**Then** a separate API call is made (source-aware cache key)

### Additional Criteria
- [ ] Cache stores package indexes (all versions) with key: `index:${sourceUrl}:${packageId}`
- [ ] Cache stores version details with key: `version:${sourceUrl}:${packageId}:${version}`
- [ ] Cache stores README content with key: `readme:${sourceUrl}:${packageId}:${version}`
- [ ] All cache entries expire after 10 minutes (600,000ms) from creation timestamp
- [ ] Cache implements LRU eviction when total entries exceed 100 (shared across all cache types)
- [ ] Cache supports manual invalidation for specific package ID or version
- [ ] README cache enforces size limit (500KB per entry) to prevent memory bloat
- [ ] Cache tracks hit/miss/eviction metrics separately for index, version, and README caches

## Technical Implementation

### Implementation Plan
Reuses `CacheManager<T>` from STORY-001-01-011 with separate cache instances for each data type.

### Key Components
- **File/Module**: `src/domain/cache/cacheManager.ts` - Generic TTL-based cache (shared with search cache)
- **File/Module**: `src/env/node/nugetApiClient.ts` - Integration of cache into Registration API calls
- **File/Module**: `src/domain/cache/__tests__/detailsCache.test.ts` - Unit tests for package details caching

### Technical Approach

**Multi-Tiered Cache Strategy:**
```typescript
class PackageDetailsCache {
  private indexCache: CacheManager<PackageIndex>;
  private versionCache: CacheManager<PackageVersionDetails>;
  private readmeCache: CacheManager<string>;
  
  constructor(maxSize: number = 100, ttl: number = 600000) {
    // Shared maxSize across all caches for memory control
    this.indexCache = new CacheManager<PackageIndex>(maxSize / 3, ttl);
    this.versionCache = new CacheManager<PackageVersionDetails>(maxSize / 3, ttl);
    this.readmeCache = new CacheManager<string>(maxSize / 3, ttl);
  }
}
```

**Cache Key Patterns:**
- **Package Index**: `index:https://api.nuget.org:newtonsoft.json`
- **Version Details**: `version:https://api.nuget.org:newtonsoft.json:13.0.3`
- **README**: `readme:https://api.nuget.org:newtonsoft.json:13.0.3`

**Integration Points:**
- `NuGetApiClient.getPackageIndex()` → Check `indexCache` before fetch
- `NuGetApiClient.getPackageVersion()` → Check `versionCache` before fetch
- `NuGetApiClient.getPackageReadme()` → Check `readmeCache` before fetch

**Cache Invalidation Strategy:**
- **Time-based**: All entries expire after 10 minutes (automatic)
- **Manual**: Package-level invalidation `invalidatePackage(packageId)` clears all related entries (index + all versions + all READMEs)
- **Version-level**: `invalidateVersion(packageId, version)` clears specific version + README only

**Memory Management:**
- README size limit enforced before caching (500KB max, already implemented in `getPackageReadme()`)
- LRU eviction at 100 total entries (split 33/33/34 across three cache types)
- Shared pruning interval (60s background task) removes expired entries across all caches

### API/Integration Points
- `INuGetApiClient.getPackageIndex()` - Wrapped with index cache layer
- `INuGetApiClient.getPackageVersion()` - Wrapped with version cache layer
- `INuGetApiClient.getPackageReadme()` - Wrapped with README cache layer
- No VS Code API dependencies (pure domain logic)

## Testing Strategy

### Unit Tests
- [ ] **Package index cache hit**: Get returns cached PackageIndex when entry exists and is not expired
- [ ] **Package index cache miss**: Get returns null and triggers API call for missing/expired entry
- [ ] **Version details cache hit**: Get returns cached PackageVersionDetails for specific version
- [ ] **Version details cache miss**: Get returns null for different version of same package
- [ ] **README cache hit**: Get returns cached README string for specific version
- [ ] **README size limit**: READMEs exceeding 500KB are truncated before caching
- [ ] **TTL expiration (10 min)**: All cache types expire after 10 minutes
- [ ] **Package-level invalidation**: Clearing package removes index + all versions + all READMEs
- [ ] **Version-level invalidation**: Clearing version removes only that version + README
- [ ] **Multi-source caching**: Same package on different sources creates separate cache entries
- [ ] **LRU eviction across caches**: Oldest entry removed from combined pool when maxSize exceeded
- [ ] **Metrics per cache type**: Hit/miss counters tracked separately for index, version, README

### Integration Tests
- [ ] **Package index integration**: NuGetApiClient uses index cache before Registration API call
- [ ] **Version details integration**: NuGetApiClient uses version cache before leaf URL fetch
- [ ] **README integration**: NuGetApiClient uses README cache before flat container fetch
- [ ] **Cache hit performance**: Cached package details return in <50ms
- [ ] **Cascade invalidation**: Invalidating package clears all related cached data
- [ ] **Cross-version independence**: Caching version 1.0.0 doesn't affect cache miss for 2.0.0

### Manual Testing
- [ ] **View package twice**: Click "Newtonsoft.Json" in search, view details, close panel, click again within 10 min → verify instant load (no spinner)
- [ ] **Switch versions**: View version 13.0.1, switch to 13.0.3, switch back to 13.0.1 → verify 13.0.1 is cached
- [ ] **README caching**: View package README, switch to different package, return to original → verify README loads instantly
- [ ] **Wait for expiration**: View package, wait 11 minutes, view again → verify API call (spinner appears)
- [ ] **Check logs**: Verify cache hit/miss events appear in output channel with separate metrics for index/version/README

## Dependencies

### Blocked By
- STORY-001-01-008 (Package Details API) - Requires `getPackageIndex()` and `getPackageVersion()` implementations
- STORY-001-01-011 (Search Cache) - Reuses `CacheManager<T>` class

### Blocks
- None - Independent optimization layer

### External Dependencies
- None - Pure TypeScript/Node.js implementation

## INVEST Check

- [x] **I**ndependent - Can be developed independently (reuses cache manager from STORY-001-01-011)
- [x] **N**egotiable - Details can be adjusted (TTL, cache split ratios, invalidation granularity)
- [x] **V**aluable - Delivers value to users (faster package browsing, reduced API calls)
- [x] **E**stimable - Can be estimated (2 story points for multi-tiered cache + integration)
- [x] **S**mall - Can be completed in one iteration (~1-2 days for implementation + tests)
- [x] **T**estable - Has clear acceptance criteria (cache behavior is deterministic)

## Notes

### Design Decisions

**Why 10-Minute TTL vs. 5-Minute for Search?**
- Package metadata changes less frequently than search result rankings
- Users spend more time reading package details (README, dependencies, versions) than browsing search results
- Longer TTL reduces API calls for "deep dive" workflows (comparing multiple versions, reading full documentation)
- 10 minutes balances freshness (new versions appear reasonably fast) with performance

**Why Three Separate Cache Instances vs. One Unified Cache?**
- **Selective invalidation**: Can clear version cache without affecting package index
- **Size-based eviction**: READMEs are larger (text content) than metadata (JSON), separate LRU prevents README from dominating cache
- **Metrics granularity**: Track hit rates per data type to identify optimization opportunities
- **Memory control**: README size limit (500KB) only applies to README cache, not metadata

**Why Cache Package Index Separately from Version Details?**
- **Access patterns**: Package index (all versions list) fetched once, then individual versions fetched on demand
- **Data size**: Index can be large for packages with 100+ versions (e.g., NuGet.Core), caching reduces repeated fetches
- **Version switching**: User clicking through versions (13.0.1 → 13.0.2 → 13.0.3) should cache each version independently
- **Partial invalidation**: New version published only invalidates index, not existing version details

**Why Cache READMEs Separately?**
- **Size**: READMEs can be 50-500KB (vs. 5-20KB for version metadata), separate cache allows different eviction strategies
- **Lazy loading**: README fetched only when user clicks "README" tab, not with initial package details
- **Fallback handling**: Missing README (404) shouldn't prevent version metadata from being cached
- **Future enhancement**: README compression could be applied only to README cache

**Cache Key Hierarchy Rationale:**
```
index:${source}:${package}           ← Package-level (all versions)
  └─ version:${source}:${package}:${version}  ← Version-level (metadata)
       └─ readme:${source}:${package}:${version}  ← Version-level (content)
```

Invalidating package clears all descendants; invalidating version clears only version + README.

### Edge Cases

**Scenario: Package published new version during cache window**
- **Problem**: User views package, sees v1.0.0 as latest; v1.0.1 published; user refreshes within 10 min, still sees v1.0.0
- **Solution**: Manual refresh action explicitly clears cache for that package
- **Acceptable**: 10-minute staleness is reasonable for package discovery (not mission-critical)

**Scenario: README updated without version change (e.g., documentation fix)**
- **Problem**: README cached for 10 minutes, documentation improvements not visible
- **Solution**: README cache shares same TTL as version cache; both expire together
- **Acceptable**: Documentation updates are rare; users can manually refresh

**Scenario: Memory pressure with large packages**
- **Problem**: Package with 200 versions × 20KB metadata = 4MB for one package index
- **Solution**: Package index size NOT limited (only README has 500KB limit); LRU eviction at 100 total entries prevents runaway growth
- **Monitoring**: Track cache memory usage via metrics; adjust maxSize if needed

**Scenario: User switches package sources mid-session**
- **Effect**: Cache key includes source URL, so switching sources creates separate cache entries
- **Benefit**: Private feed packages don't collide with nuget.org packages of same name
- **Memory**: Doubles cache usage if user actively uses two sources; acceptable tradeoff

**Scenario: Version details fetch fails but index succeeds**
- **Problem**: Index cached, but version leaf URL returns 404 or network error
- **Solution**: Version cache miss triggers fresh API call; error not cached (only successful responses)
- **Recovery**: User retry immediately hits API, not cached error

### Cache Splitting Strategy

**Option A: Equal Split (33/33/34 entries)**
- Simple, predictable memory usage
- May waste space if one cache underutilized

**Option B: Dynamic Split (adaptive based on usage)**
- Complex implementation, requires rebalancing logic
- Overkill for initial implementation

**Decision**: Start with Option A (equal split), monitor metrics, adjust if needed.

### Future Enhancements

**Hierarchical Cache Invalidation:**
```typescript
invalidatePackage(packageId) {
  indexCache.invalidate(`index:*:${packageId}`);
  versionCache.invalidate(`version:*:${packageId}:*`);
  readmeCache.invalidate(`readme:*:${packageId}:*`);
}
```
Support wildcard patterns for bulk invalidation.

**Compression for Large READMEs:**
- Apply gzip compression to READMEs >50KB before caching
- Decompress on retrieval
- Reduces memory usage by 60-80% for Markdown content

**Persistent Cache for Package Indexes:**
- Store package indexes in `ExtensionContext.globalState` (persists across sessions)
- Reduces initial load time on extension activation
- Requires cache versioning to handle schema changes

**Smart Prefetching:**
- When package index fetched, prefetch top 3 most downloaded versions in background
- Improves perceived performance (version details instantly available when user clicks)
- Risk: Wasted API calls if user doesn't view versions

**Cache Warming on Activation:**
- Pre-populate cache with popular packages on extension activation
- User's first search for "newtonsoft" instantly cached
- Requires curated list of "most popular" packages

## Changelog

| Date | Change | Author |
|---|---|---|
| 2025-11-16 | Story created | AI Assistant |
| 2025-12-31 | Completed story details: description, acceptance criteria, technical implementation, testing strategy, dependencies, and comprehensive design notes | AI Assistant |

---
**Story ID**: STORY-001-01-012-details-cache  
**Feature**: [FEAT-001-01-browse-search](../features/FEAT-001-01-browse-search.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)
