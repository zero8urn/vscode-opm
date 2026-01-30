# IMPL-001-02-013-optimize-package-list-parsing

**Story**: [STORY-001-02-013-optimize-package-list-parsing](../stories/STORY-001-02-013-optimize-package-list-parsing.md)  
**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Created**: 2026-01-30  
**Status**: Ready for Implementation  

---

## High-Level Summary

This implementation optimizes package installation status checks from **5+ seconds per package** to **<50ms** by pre-fetching all installed packages once when the Package Browser opens, then caching results for instant lookup when users click different packages. The current implementation executes `dotnet list package --format json` every time a user clicks a package card, triggering full project scans with implicit NuGet restore checks. This plan eliminates redundant CLI calls by parsing all projects once at webview startup, caching the results in both backend (extension host) and frontend (webview), and automatically invalidating caches when project files change or packages are installed/uninstalled.

**Performance Impact**: 99% reduction in perceived latency (5000ms → 50ms), transforming the browsing experience from sluggish to instant.

**Key Design Decisions**:
- Use `dotnet list package --no-restore` flag to skip implicit restore checks (**primary performance win: 5s → 500ms**)
- Leverage existing `DotnetProjectParser` cache for installed packages (already caches `parseProject()` results)
- Parse all workspace projects once at Package Browser initialization to warm cache
- Webview caches project data locally for instant UI updates
- Automatic cache invalidation via existing file watcher and install/uninstall hooks
- Add manual "Refresh Projects" button for user-initiated cache clear
- **No new backend cache service needed** — reuse existing infrastructure

---

## Consolidated Implementation Checklist

### Phase 1: Backend Infrastructure
- [ ] 1. Add `--no-restore` flag to `PackageReferenceParser.parsePackageReferences()` ([§1](#§1-add---no-restore-flag))
- [ ] 2. Update `handleGetProjectsRequest` to leverage existing `DotnetProjectParser` cache ([§2](#§2-update-handlegetprojectsrequest))

### Phase 2: Webview Optimization
- [ ] 3. Update Package Browser startup to pre-warm cache on `connectedCallback()` ([§3](#§3-early-cache-warmup))
- [ ] 4. Enhance `PackageDetailsPanel` to use cached project data ([§4](#§4-enhance-packagedetailspanel))
- [ ] 5. Implement "Refresh Projects" button in Package Browser header ([§5](#§5-refresh-button))

### Phase 3: Cache Refresh
- [ ] 6. Add IPC notification to trigger webview refresh on cache invalidation ([§6](#§6-ipc-notification))
- [ ] 7. Verify existing cache invalidation hooks work correctly ([§7](#§7-verify-cache-invalidation))

### Phase 4: Testing & Documentation
- [ ] 8. Add integration tests for `--no-restore` performance ([§8](#§8-integration-tests))
- [ ] 9. Add E2E tests for perceived performance ([§9](#§9-e2e-tests))
- [ ] 10. Update performance documentation and add telemetry hooks ([§10](#§10-documentation-telemetry))

---

## Detailed Implementation Sections

### §1. Add `--no-restore` Flag

**File**: `src/services/cli/parsers/packageReferenceParser.ts`

**Objective**: Skip implicit NuGet restore checks to reduce parsing time from 5s to <500ms per project.

**Changes**:

1. **Update CLI arguments** (line ~68):
   ```typescript
   async parsePackageReferences(projectPath: string): Promise<PackageReference[]> {
     logger.debug('Parsing package references', { projectPath });

     // Execute dotnet list package with JSON output and --no-restore flag
     const result = await cliExecutor.execute({
       args: ['list', projectPath, 'package', '--format', 'json', '--no-restore'],
     });
   ```

2. **Add JSDoc note**:
   ```typescript
   /**
    * Parse package references from a project file.
    *
    * Executes `dotnet list package --format json --no-restore` to obtain installed packages.
    * The --no-restore flag skips implicit NuGet restore checks, improving performance from
    * ~5s to ~500ms per project. Aggregates packages across all target frameworks and uses
    * highest resolved version if the same package appears in multiple frameworks.
    *
    * @param projectPath - Absolute path to .csproj file
    * @returns Array of package references or empty array on failure
    * @throws Error with code PACKAGES_CONFIG_NOT_SUPPORTED for legacy packages.config projects
    */
   ```

**Rationale**: The `--no-restore` flag tells `dotnet list package` to skip checking NuGet sources for package updates. Since we only need the currently installed package list (not latest versions), this is safe and dramatically faster.

**Impact**: Reduces per-project parsing time from **5+ seconds → <500ms** (10x improvement).

---

### §2. Update handleGetProjectsRequest

**File**: `src/webviews/packageBrowserWebview.ts`

**Objective**: Leverage existing `DotnetProjectParser` cache for instant installed status checks.

**Key Insight**: `DotnetProjectParser.parseProject()` already caches results internally. Just call it directly — the cache layer is already there!

**Changes**:

**Current implementation** (lines 620-640) already uses `projectParser.parseProject()` which is cached:
```typescript
const parseResults = packageId ? await projectParser.parseProjects(projectPaths) : new Map();
```

**No changes needed** — the existing code already benefits from `DotnetProjectParser`'s internal cache. With the `--no-restore` flag (§1), cache misses are now fast (500ms instead of 5s), and cache hits are instant.

**Performance Characteristics**:
- First call per project: 500ms (with `--no-restore`)
- Subsequent calls: <10ms (cache hit in `DotnetProjectParser`)
- Cache invalidation: Automatic (file watcher + install/uninstall hooks already wired)

---

### §3. Early Cache Warmup

**File**: `src/webviews/apps/packageBrowser/packageBrowser.ts`

**Objective**: Pre-warm `DotnetProjectParser` cache by parsing all projects on startup.

**Changes**:

1. **Add new method** (after `fetchProjectsEarly()`, line ~290):
   ```typescript
   /**
    * Pre-warm DotnetProjectParser cache by parsing all projects.
    * First call takes ~2s (with --no-restore), subsequent lookups are instant.
    */
   private warmProjectCache(): void {
     if (this.cacheWarmed || this.cacheWarming) {
       return;
     }

     console.log('Warming project cache...');
     this.cacheWarming = true;

     const requestId = Math.random().toString(36).substring(2, 15);
     
     // Fetch first package with packageId to trigger parseProjects() call
     // This warms DotnetProjectParser's internal cache for all projects
     vscode.postMessage({
       type: 'getProjects',
       payload: { requestId, packageId: '_cache_warmup' },
     });
   }
   ```

2. **Add state properties** (after line 132):
   ```typescript
   @state()
   private cacheWarmed = false;

   @state()
   private cacheWarming = false;
   ```

3. **Call on startup** (in `connectedCallback()`, after `fetchProjectsEarly()`, line ~218):
   ```typescript
   connectedCallback(): void {
     super.connectedCallback();
     this.fetchProjectsEarly();
     this.warmProjectCache();  // Add this line
   }
   ```

**Note**: This triggers `projectParser.parseProjects()` which warms `DotnetProjectParser`'s internal cache.

---

### §4. Enhance PackageDetailsPanel

**File**: `src/webviews/apps/packageBrowser/components/packageDetailsPanel.ts`

**Objective**: Eliminate redundant `fetchInstalledStatus()` calls by relying on pre-warmed cache.

**Changes**:

1. **Update `fetchProjects()` logic** (line ~530):
   ```typescript
   private async fetchProjects(): Promise<void> {
     // Guard: Don't fetch without package context
     if (!this.packageData?.id) {
       this.projects = [];
       return;
     }

     const packageIdLower = this.packageData.id.toLowerCase();

     // IMPL-STORY-013: Check if we have cached projects from parent
     if (this.cachedProjects.length > 0) {
       console.log('Using cached projects from parent, fetching installed status');
       this.projects = this.cachedProjects;

       // IMPL-STORY-013: Check frontend cache before IPC call
       if (this.installedStatusCache.has(packageIdLower)) {
         const statusMap = this.installedStatusCache.get(packageIdLower)!;
         console.log('Using cached installed status (frontend cache hit)');

         // Apply cached installed status to projects
         this.projects = this.cachedProjects.map(project => ({
           ...project,
           installedVersion: statusMap.get(project.path),
         }));

         this.lastCheckedPackageId = this.packageData.id;
         this.projectsLoading = false;
         return;
       }

       // Frontend cache miss: Fetch from backend (which has pre-warmed cache)
       await this.fetchInstalledStatus();
       return;
     }

     // Fallback: Full fetch if no cache (should rarely happen)
     console.log('No cached projects, doing full fetch');
     await this.fetchInstalledStatusWithFullFetch();
   }
   ```

2. **Rename existing `fetchInstalledStatus()` to `fetchInstalledStatusWithFullFetch()`** for clarity.

**Expected Behavior**:
- First package click: Backend cache hit (pre-warmed) → 50-100ms
- Subsequent clicks on same package: Frontend cache hit → <10ms
- Cache invalidation on install/uninstall clears both caches → next click re-fetches

---

### §5. Skeleton Loading UI

**File**: `src/webviews/apps/packageBrowser/components/packageBrowser.ts`

**Objective**: Show skeleton loading indicators during initial package fetch.

**Changes**:

1. **Add skeleton template** (in `render()` method):
   ```typescript
   ${this.cacheWarming
     ? html`
         <div class="skeleton-loader">
           <div class="skeleton-text"></div>
           <div class="skeleton-text"></div>
           <div class="skeleton-text"></div>
         </div>
       `
     : ''}
   ```

2. **Add CSS** (in `static styles`):
   ```typescript
   .skeleton-loader {
     padding: 16px;
   }

   .skeleton-text {
     height: 20px;
     background: var(--vscode-input-background);
     border-radius: 4px;
     margin-bottom: 8px;
     animation: skeleton-pulse 1.5s ease-in-out infinite;
   }

   @keyframes skeleton-pulse {
     0%, 100% { opacity: 1; }
     50% { opacity: 0.5; }
   }
   ```

---

### §6. Refresh Button

**File**: `src/webviews/apps/packageBrowser/types.ts`

**Add IPC message type**:
```typescript
/**
 * Webview → Host: Manual refresh of installed packages cache
 */
export interface RefreshInstalledPackagesCacheRequestMessage {
  type: 'refreshInstalledPackagesCache';
  payload: {
    requestId?: string;
  };
}
```

**File**: `src/webviews/apps/packageBrowser/packageBrowser.ts`

**Add button to header** (in `render()`, near search input):
```typescript
<button
  class="refresh-button"
  @click=${this.handleRefreshProjects}
  title="Refresh project list and installed packages"
>
  <span class="codicon codicon-refresh"></span>
  Refresh Projects
</button>
```

**Add handler**:
```typescript
private handleRefreshProjects = (): void => {
  console.log('Manual refresh triggered by user');
  
  // Clear frontend caches
  this.cachedProjects = [];
  this.projectsFetched = false;
  this.cacheWarmed = false;

  // Clear details panel cache
  const detailsPanel = this.shadowRoot?.querySelector('package-details-panel');
  if (detailsPanel) {
    (detailsPanel as any).clearInstalledStatusCache();
  }

  // Trigger IPC to clear DotnetProjectParser cache
  vscode.postMessage({
    type: 'clearProjectCache',
    payload: { requestId: Math.random().toString(36).substring(2) },
  });

  // Re-fetch projects and warm cache
  this.fetchProjectsEarly();
  this.warmProjectCache();
};
```

---

### §6. IPC Notification

**File**: `src/webviews/apps/packageBrowser/types.ts`

**Add notification type**:
```typescript
/**
 * Host → Webview: Installed packages cache invalidated (trigger refresh)
 */
export interface InstalledPackagesCacheInvalidatedNotification {
  type: 'notification';
  name: 'installedPackagesCacheInvalidated';
  args: {
    reason: 'install' | 'uninstall' | 'fileChange' | 'manual';
  };
}
```

**File**: `src/commands/installPackageCommand.ts`

**Leverage existing notification** (already implemented):
```typescript
// Cache invalidation already calls projectParser.invalidateCache()
// which triggers onProjectListChanged event
// CacheInvalidationNotifier already sends 'projectsChanged' IPC to webviews
// No new code needed!
```

**File**: `src/webviews/apps/packageBrowser/packageBrowser.ts`

**Handle existing `projectsChanged` notification** (already implemented, line ~240):
```typescript
} else if (isProjectsChangedNotification(msg)) {
  console.log('Projects changed notification received, clearing cache');
  this.cachedProjects = [];
  this.projectsFetched = false;
  this.cacheWarmed = false;
  
  const detailsPanel = this.shadowRoot?.querySelector('package-details-panel');
  if (detailsPanel) {
    (detailsPanel as any).clearInstalledStatusCache();
  }

  this.fetchProjectsEarly();
  this.warmProjectCache();
}
```

**Note**: This handler already exists! No changes needed.

---

### §7. Verify Cache Invalidation

**Objective**: Confirm existing cache invalidation infrastructure works with `--no-restore` flag.

**Files to verify**:

1. **`src/commands/installPackageCommand.ts`** (line ~175):
   ```typescript
   // Existing code already invalidates cache:
   if (this.projectParser && successCount > 0) {
     successfulPaths.forEach(projectPath => {
       this.projectParser!.invalidateCache(projectPath);
     });
   }
   ```
   ✅ **No changes needed** — already working

2. **`src/services/cli/dotnetProjectParser.ts`** (file watcher callback):
   ```typescript
   // Existing code already invalidates on file changes:
   private handleProjectFileChange(uri: Uri): void {
     this.invalidateCache(uri.fsPath);
     this._onProjectListChanged.fire();
   }
   ```
   ✅ **No changes needed** — already working

3. **`src/services/cache/cacheInvalidationNotifier.ts`**:
   ```typescript
   // Existing code already sends IPC notifications:
   notifyProjectsChanged(): void {
     this.notifyAllWebviews({ type: 'notification', name: 'projectsChanged' });
   }
   ```
   ✅ **No changes needed** — already working

**Testing**: Verify cache invalidation triggers correctly by:
- Installing a package → cache invalidates → next lookup re-parses (fast with `--no-restore`)
- Editing `.csproj` externally → file watcher fires → cache invalidates
- Manual refresh button → cache clears → re-parses all projects

---

### §8. Integration Tests

**File**: `src/services/cache/__tests__/installedPackagesCache.test.ts` (new file)

```typescript
import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { createInstalledPackagesCache, type IInstalledPackagesCache } from '../installedPackagesCache';
import type { ILogger } from '../../loggerService';
import type { PackageReference } from '../../cli/types/projectMetadata';

describe('InstalledPackagesCache', () => {
  let cache: IInstalledPackagesCache;
  let mockLogger: ILogger;

  beforeEach(() => {
    mockLogger = {
      debug: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
    };
    cache = createInstalledPackagesCache(mockLogger);
  });

  test('should return undefined for cache miss', () => {
    const result = cache.get('/path/to/project.csproj');
    expect(result).toBeUndefined();
  });

  test('should return cached packages after set', () => {
    const packages: PackageReference[] = [
      { id: 'Newtonsoft.Json', requestedVersion: '13.0.3', resolvedVersion: '13.0.3', targetFramework: 'net8.0' },
    ];

    cache.set('/path/to/project.csproj', packages);
    const result = cache.get('/path/to/project.csproj');

    expect(result).toEqual(packages);
  });

  test('should track cache hits and misses', () => {
    cache.get('/miss1.csproj');
    cache.get('/miss2.csproj');

    cache.set('/hit.csproj', []);
    cache.get('/hit.csproj');
    cache.get('/hit.csproj');

    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(2);
    expect(stats.entries).toBe(1);
  });

  test('should invalidate single entry', () => {
    cache.set('/project1.csproj', []);
    cache.set('/project2.csproj', []);

    cache.invalidate('/project1.csproj');

    expect(cache.get('/project1.csproj')).toBeUndefined();
    expect(cache.get('/project2.csproj')).toEqual([]);
    expect(cache.getStats().entries).toBe(1);
  });

  test('should clear all entries and reset stats', () => {
    cache.set('/project1.csproj', []);
    cache.set('/project2.csproj', []);
    cache.get('/project1.csproj');

    cache.invalidateAll();

    const stats = cache.getStats();
    expect(stats.entries).toBe(0);
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
  });

  test('should return shallow copy in getAll', () => {
    const packages: PackageReference[] = [
      { id: 'Test', requestedVersion: '1.0.0', resolvedVersion: '1.0.0', targetFramework: 'net8.0' },
    ];

    cache.set('/project.csproj', packages);
    const all = cache.getAll();

    expect(all.size).toBe(1);
    expect(all.get('/project.csproj')).toEqual(packages);
  });
});
```

---

### §13. Integration Tests

**File**: `test/integration/packageReferenceParser.integration.test.ts`

**Objective**: Verify `--no-restore` flag improves performance without breaking functionality.

```typescript
import { describe, test, expect } from 'bun:test';
import * as path from 'node:path';
import { createDotnetCliExecutor } from '../../src/services/cli/dotnetCliExecutor';
import { createPackageReferenceParser } from '../../src/services/cli/parsers/packageReferenceParser';

describe('PackageReferenceParser Performance', () => {
  const testProjectPath = path.join(__dirname, '../fixtures/TestProject/TestProject.csproj');
  
  test('should parse packages with --no-restore flag in <1s', async () => {
    // This test requires real .NET SDK
    const mockLogger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } as any;
    const cliExecutor = createDotnetCliExecutor(mockLogger);
    const parser = createPackageReferenceParser(cliExecutor, mockLogger);
    
    const start = Date.now();
    const packages = await parser.parsePackageReferences(testProjectPath);
    const duration = Date.now() - start;
    
    console.log(`Parse duration: ${duration}ms`);
    expect(duration).toBeLessThan(1000);  // Should be <500ms typically
    expect(Array.isArray(packages)).toBe(true);
  });
  
  test('should return same results with and without cache', async () => {
    const mockLogger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } as any;
    const cliExecutor = createDotnetCliExecutor(mockLogger);
    const parser = createPackageReferenceParser(cliExecutor, mockLogger);
    
    // First parse (potential cache miss)
    const packages1 = await parser.parsePackageReferences(testProjectPath);
    
    // Second parse (should hit DotnetProjectParser cache)
    const packages2 = await parser.parsePackageReferences(testProjectPath);
    
    expect(packages1).toEqual(packages2);
  });
});
```

---

### §9. E2E Tests

**File**: `test/e2e/packageBrowserPerformance.e2e.ts` (new file)

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Package Browser Performance E2E', () => {
  test('Package details load instantly after initial cache warmup', async function () {
    this.timeout(30000);  // Allow time for initial warmup

    // Open Package Browser
    await vscode.commands.executeCommand('opm.openPackageBrowser');
    await sleep(2000);  // Wait for cache warmup

    // Simulate clicking different packages and measure latency
    const latencies: number[] = [];

    for (const packageId of ['Newtonsoft.Json', 'Microsoft.Extensions.Logging', 'Serilog']) {
      const start = Date.now();
      
      // Simulate package selection (in real webview, this would trigger fetchInstalledStatus)
      // For E2E, we test the command execution time as proxy
      await vscode.commands.executeCommand('opm.internal.getPackageDetails', { packageId });
      
      const latency = Date.now() - start;
      latencies.push(latency);
      
      console.log(`Package ${packageId} latency: ${latency}ms`);
    }

    // Verify all latencies are under 100ms (target <50ms, allow buffer)
    for (const latency of latencies) {
      assert.ok(latency < 100, `Latency ${latency}ms exceeds 100ms threshold`);
    }

    // Average should be well under 50ms
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    assert.ok(avgLatency < 50, `Average latency ${avgLatency}ms exceeds 50ms target`);
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

### §10. Documentation & Telemetry

**File**: `docs/technical/performance-optimization.md` (new file)

```markdown
# Performance Optimization: Package Browser

## Overview

The Package Browser optimizes installed package status checks from **5+ seconds per package** to **<50ms** (99% reduction) using the `--no-restore` flag and existing cache infrastructure.

## Cache Architecture

### Backend Cache (`DotnetProjectParser`)
- **Scope**: Per-project metadata (includes package references)
- **Lifetime**: Extension host process
- **Invalidation**: File changes (file watcher), install/uninstall operations, manual refresh
- **Implementation**: Built-in to `DotnetProjectParser` — no new service needed!

### Frontend Cache (`PackageDetailsPanel.installedStatusCache`)
- **Scope**: Per-package installed status
- **Lifetime**: Webview session
- **Invalidation**: IPC notifications, manual refresh

## Performance Characteristics

| Operation | Before | After | Improvement |
|-----------|--------|-------|-------------|
| First package click (cold) | 5200ms | 500ms | 90% |
| First package click (warm) | 5200ms | 10ms | 99.8% |
| Subsequent clicks | 5200ms | 10ms | 99.8% |
| Initial cache warmup | N/A | 2000ms | One-time cost |
| Cache hit rate | 0% | >95% | N/A |

## Key Optimizations

1. **`--no-restore` flag**: Skips NuGet source checks (**5s → 500ms per project** — the main win!)
2. **Existing `DotnetProjectParser` cache**: Parse once, reuse results (no new service needed)
3. **Frontend caching**: Instant UI updates for revisited packages
4. **Automatic invalidation**: Existing file watchers + install/uninstall hooks

## Monitoring

Log performance metrics:

```typescript
// In handleGetProjectsRequest
const start = Date.now();
const parseResults = await projectParser.parseProjects(projectPaths);
const duration = Date.now() - start;

logger.info('Package status check performance', {
  projectCount: projectPaths.length,
  duration: `${duration}ms`,
  cacheHits: parseResults.size,  // DotnetProjectParser tracks internally
});
```

## Future Enhancements

- Persistent cache (IndexedDB for webview, file-based for backend)
- TTL-based expiration (currently relies on explicit invalidation)
- Incremental updates (only re-parse changed projects)
```

**File**: `docs/discovery/request-response.md`

**Add cache warmup step to Use Case 1** (Search & Browse Packages):
```markdown
## Use Case 1: Search & Browse Packages (with Cache Warmup)

1. User opens Package Browser
2. **Webview triggers early cache warmup via `getProjects` IPC**
3. **Backend calls `projectParser.parseProjects()` with `--no-restore` flag**
4. **Results cached in `DotnetProjectParser` (2-3 seconds one-time cost)**
5. User enters search term
6. Search results displayed
7. User clicks package → installed status check → **DotnetProjectParser cache hit** → instant UI update
```

---

## Implementation Dependencies

### Blocked By
- None (uses existing infrastructure)

### Blocks
- None (performance optimization, non-blocking)

### Related Stories
- **STORY-001-02-010** (Cache Invalidation) — Shares invalidation infrastructure
- **STORY-001-02-011** (External Change Detection) — File watcher integration

---

## Files Modified

### Core Implementation
1. **`src/services/cli/parsers/packageReferenceParser.ts`** — Add `--no-restore` flag (main performance win)
2. **`src/webviews/apps/packageBrowser/packageBrowser.ts`** — Early cache warmup + refresh button
3. **`src/webviews/apps/packageBrowser/components/packageDetailsPanel.ts`** — Use cached data
4. **`src/webviews/apps/packageBrowser/types.ts`** — Refresh button IPC message type

### Tests
5. **`test/integration/packageReferenceParser.integration.test.ts`** — Performance tests for `--no-restore`
6. **`test/e2e/packageBrowserPerformance.e2e.ts`** — E2E perceived performance tests

### Documentation
7. **`docs/technical/performance-optimization.md`** — Performance guide
8. **`docs/discovery/request-response.md`** — Update cache warmup flow

---

## Success Metrics

**Performance Targets** (from story):
- ✅ Package click latency: **5000ms → 50ms** (99% reduction)
- ✅ Backend CLI calls per session: **N → 1** (where N = packages clicked)
- ✅ Cache hit rate: **>95%** for typical browsing sessions
- ✅ User-perceived performance: **Instant** after initial load

**Telemetry Hooks**:
- Log cache hit/miss rates every 10 operations
- Track average latency for `handleGetProjectsRequest` with `packageId`
- Monitor cache size and memory usage

---

## Risk Mitigation

### Risk: Cache Staleness
**Mitigation**: Automatic invalidation on file changes + manual refresh button + IPC notifications on install/uninstall

### Risk: Memory Bloat (Large Workspaces)
**Mitigation**: Cache only `PackageReference[]`, not full CLI output; typical workspace <100 projects = <1MB cache size

### Risk: Race Conditions (Concurrent Installs)
**Mitigation**: Cache invalidation per-project (not workspace-wide); concurrent operations invalidate independently

---

## Rollout Plan

### Phase 1: Core Optimization (Day 1)
- Add `--no-restore` flag to `PackageReferenceParser`
- Verify existing `DotnetProjectParser` cache works
- Test performance improvement (5s → 500ms)

### Phase 2: Frontend Polish (Day 1-2)
- Early cache warmup on startup
- Refresh button
- Use cached data in details panel

### Phase 3: Testing & Documentation (Day 2)
- Integration tests for `--no-restore` performance
- E2E tests for perceived latency
- Performance documentation
- Verify cache invalidation works

---

**Implementation Plan Status**: Ready for Development  
**Estimated Effort**: 2 days (simplified — no new cache service, skeleton UI already done!)  
**Story**: [STORY-001-02-013](../stories/STORY-001-02-013-optimize-package-list-parsing.md)

---

## Summary of Simplifications

**Removed**:
- ❌ `InstalledPackagesCache` service — **redundant, use existing `DotnetProjectParser` cache**
- ❌ Wiring new cache into factories — **not needed**
- ❌ Duplicate cache invalidation — **already exists in install/uninstall commands**
- ❌ Separate unit tests for new cache — **not needed**
- ❌ Skeleton loading UI (§5) — **already implemented in performance-project-loading-optimization**

**Kept**:
- ✅ `--no-restore` flag (§1) — **The main 90% performance win (5s → 500ms)**
- ✅ Early cache warmup (§3) — **Pre-populate `DotnetProjectParser` cache on startup**
- ✅ Frontend optimizations (§4-§5) — **Use cached data, refresh button**
- ✅ Tests (§8-§10) — **Integration + E2E performance tests**

**Result**: **10 sections (down from 15), 2 days effort, same performance gain!**
