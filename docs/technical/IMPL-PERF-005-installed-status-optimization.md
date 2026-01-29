# IMPL-PERF-005-installed-status-optimization

**Plan**: [Performance Optimization Plan](../plans/performance-project-loading-optimization.md)  
**Created**: 2026-01-28  
**Status**: Not Started  
**Priority**: Low  
**Effort**: 1-2 hours

## Overview

Optimize the installed status checking logic to avoid redundant lookups when the user revisits the same package. This is a **fine-tuning optimization** that builds on the earlier phases.

**Current Behavior**:
```
User clicks Package A → fetch installed status → show projects
User clicks Package B → fetch installed status → show projects  
User clicks Package A again → fetch installed status AGAIN → show projects (redundant!)
```

**Optimized Behavior**:
```
User clicks Package A → fetch installed status → cache result
User clicks Package B → fetch installed status → cache result
User clicks Package A again → use cached result → instant!
```

## Key Insight

After implementing IMPL-PERF-002 (early fetch), the project list is cached at the root component. However, the **installed status** (which version of each package is installed in each project) still requires a backend check per `packageId`.

This optimization caches the installed status per `packageId` in the details panel, avoiding redundant checks when the user navigates back to a previously viewed package.

## Implementation Checklist

### Phase 1: Track Last Checked Package
- [ ] 1. Add `lastCheckedPackageId` state to `PackageDetailsPanel` ([§1](#1-track-last-checked))
- [ ] 2. Add `installedStatusCache` Map to store per-package results ([§1](#1-track-last-checked))

### Phase 2: Skip Redundant Fetches
- [ ] 3. Check cache before fetching installed status ([§2](#2-skip-redundant-fetch))
- [ ] 4. Return cached results immediately if available ([§2](#2-skip-redundant-fetch))
- [ ] 5. Update cache after successful fetch ([§2](#2-skip-redundant-fetch))

### Phase 3: Cache Invalidation
- [ ] 6. Clear cache entry on install success ([§3](#3-cache-invalidation))
- [ ] 7. Clear cache entry on uninstall success ([§3](#3-cache-invalidation))
- [ ] 8. Clear entire cache on `projectsChanged` notification ([§3](#3-cache-invalidation))

### Phase 4: Testing
- [ ] 9. Unit test: cache hit on revisited package ([§4](#4-testing))
- [ ] 10. Unit test: cache invalidation on install/uninstall ([§4](#4-testing))
- [ ] 11. Unit test: cache cleared on projectsChanged ([§4](#4-testing))

---

## Detailed Implementation Sections

### §1. Track Last Checked Package

**File**: `src/webviews/apps/packageBrowser/components/packageDetailsPanel.ts`

Add state for caching installed status:

```typescript
@customElement(PACKAGE_DETAILS_PANEL_TAG)
export class PackageDetailsPanel extends LitElement {
  // ... existing properties ...

  /**
   * Tracks which package we last checked installed status for.
   * Used to skip redundant fetches when revisiting the same package.
   */
  private lastCheckedPackageId: string | null = null;

  /**
   * Cache of installed status per packageId.
   * Key: packageId (lowercase)
   * Value: Map<projectPath, installedVersion | undefined>
   */
  private installedStatusCache = new Map<string, Map<string, string | undefined>>();

  // ... rest of class ...
}
```

---

### §2. Skip Redundant Fetch

**File**: `src/webviews/apps/packageBrowser/components/packageDetailsPanel.ts`

Modify `fetchProjects()` or the installed status fetch logic:

```typescript
private async fetchProjects(): Promise<void> {
  if (!this.packageData?.id) {
    this.projects = [];
    return;
  }

  const packageIdLower = this.packageData.id.toLowerCase();

  // Check if we have cached installed status for this package
  if (this.installedStatusCache.has(packageIdLower) && this.cachedProjects.length > 0) {
    console.log('Using cached installed status for:', this.packageData.id);
    
    const cachedStatus = this.installedStatusCache.get(packageIdLower)!;
    this.projects = this.cachedProjects.map(project => ({
      ...project,
      installedVersion: cachedStatus.get(project.path),
    }));
    
    this.lastCheckedPackageId = this.packageData.id;
    return;
  }

  // Need to fetch installed status from backend
  console.log('Fetching installed status for:', this.packageData.id);
  this.projectsLoading = true;

  // ... existing fetch logic ...

  // After successful fetch, update cache
  try {
    const response = await this.fetchInstalledStatusFromBackend();
    
    // Cache the results
    const statusMap = new Map<string, string | undefined>();
    for (const project of response) {
      statusMap.set(project.path, project.installedVersion);
    }
    this.installedStatusCache.set(packageIdLower, statusMap);
    
    // Merge with cached projects
    if (this.cachedProjects.length > 0) {
      this.projects = this.cachedProjects.map(project => ({
        ...project,
        installedVersion: statusMap.get(project.path),
      }));
    } else {
      this.projects = response;
    }
    
    this.lastCheckedPackageId = this.packageData.id;
  } catch (error) {
    console.error('Failed to fetch installed status:', error);
    // Use cached projects without installed status
    this.projects = this.cachedProjects;
  } finally {
    this.projectsLoading = false;
  }
}

/**
 * Fetch installed status from backend.
 * Separated from main logic for clarity.
 */
private async fetchInstalledStatusFromBackend(): Promise<ProjectInfo[]> {
  const requestId = Math.random().toString(36).substring(2, 15);
  this.currentProjectsRequestId = requestId;

  return new Promise<ProjectInfo[]>((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error('Timeout'));
    }, 10000);

    const handler = (event: MessageEvent) => {
      const message = event.data;
      if (
        message?.type === 'notification' &&
        message?.name === 'getProjectsResponse' &&
        message?.args?.requestId === requestId
      ) {
        clearTimeout(timeout);
        window.removeEventListener('message', handler);

        if (this.currentProjectsRequestId !== requestId) {
          reject(new Error('Request superseded'));
          return;
        }

        if (message.args.error) {
          reject(new Error(message.args.error.message));
        } else {
          resolve(message.args.projects || []);
        }
      }
    };

    window.addEventListener('message', handler);

    vscode.postMessage({
      type: 'getProjects',
      payload: {
        requestId,
        packageId: this.packageData?.id,
      },
    });
  });
}
```

---

### §3. Cache Invalidation

**File**: `src/webviews/apps/packageBrowser/components/packageDetailsPanel.ts`

Invalidate cache when packages are installed or uninstalled:

```typescript
/**
 * Handle install package response from extension host.
 */
public handleInstallResponse(response: {
  packageId: string;
  version: string;
  success: boolean;
  results: Array<{ projectPath: string; success: boolean }>;
}): void {
  // ... existing handling ...

  // Invalidate cache for installed package
  const packageIdLower = response.packageId.toLowerCase();
  this.installedStatusCache.delete(packageIdLower);
  this.lastCheckedPackageId = null;
  
  console.log('Invalidated installed status cache for:', response.packageId);

  // Re-fetch to show updated status
  void this.fetchProjects();
}

/**
 * Handle uninstall package response from extension host.
 */
public handleUninstallResponse(response: {
  packageId: string;
  success: boolean;
  results: Array<{ projectPath: string; success: boolean }>;
}): void {
  // ... existing handling ...

  // Invalidate cache for uninstalled package
  const packageIdLower = response.packageId.toLowerCase();
  this.installedStatusCache.delete(packageIdLower);
  this.lastCheckedPackageId = null;
  
  console.log('Invalidated installed status cache for:', response.packageId);

  // Re-fetch to show updated status
  void this.fetchProjects();
}
```

**Clear entire cache on `projectsChanged`**:

This should happen at the root component level (in `PackageBrowserApp`), but we also expose a method for the details panel:

```typescript
/**
 * Clear all cached installed status.
 * Called when projects change (external .csproj modification).
 */
public clearInstalledStatusCache(): void {
  this.installedStatusCache.clear();
  this.lastCheckedPackageId = null;
  console.log('Cleared all installed status cache');
}
```

In the root component's `projectsChanged` handler:

```typescript
else if (isProjectsChangedNotification(msg)) {
  // Clear frontend cache
  this.cachedProjects = [];
  this.projectsFetched = false;
  
  // Clear details panel's installed status cache
  const detailsPanel = this.shadowRoot?.querySelector('package-details-panel');
  if (detailsPanel) {
    (detailsPanel as PackageDetailsPanel).clearInstalledStatusCache();
  }
  
  // Re-fetch
  this.fetchProjectsEarly();
}
```

---

### §4. Testing

**Unit Tests**: `src/webviews/apps/packageBrowser/components/__tests__/packageDetailsPanel.test.ts`

```typescript
describe('Installed Status Cache', () => {
  test('uses cached status on revisited package', async () => {
    const postMessageSpy = vi.spyOn(vscode, 'postMessage');
    
    const el = await fixture(html`
      <package-details-panel
        ?open=${true}
        .cachedProjects=${[
          { name: 'Project1', path: '/path/Project1.csproj' },
        ]}
      ></package-details-panel>
    `);

    // First visit to PackageA
    el.packageData = { id: 'PackageA', version: '1.0.0' };
    await sleep(200);
    
    // Respond with installed status
    const firstRequestId = postMessageSpy.mock.calls
      .find(c => c[0]?.type === 'getProjects')?.[0]?.payload?.requestId;
    
    window.dispatchEvent(new MessageEvent('message', {
      data: {
        type: 'notification',
        name: 'getProjectsResponse',
        args: {
          requestId: firstRequestId,
          projects: [{ name: 'Project1', path: '/path/Project1.csproj', installedVersion: '1.0.0' }],
        },
      },
    }));
    
    await el.updateComplete;
    postMessageSpy.mockClear();

    // Visit PackageB
    el.packageData = { id: 'PackageB', version: '2.0.0' };
    await sleep(200);
    
    // Respond
    const secondRequestId = postMessageSpy.mock.calls
      .find(c => c[0]?.type === 'getProjects')?.[0]?.payload?.requestId;
    window.dispatchEvent(new MessageEvent('message', {
      data: {
        type: 'notification',
        name: 'getProjectsResponse',
        args: { requestId: secondRequestId, projects: [] },
      },
    }));
    await el.updateComplete;
    postMessageSpy.mockClear();

    // Revisit PackageA
    el.packageData = { id: 'PackageA', version: '1.0.0' };
    await sleep(200);
    
    // Should NOT call backend (cached)
    const getProjectsCalls = postMessageSpy.mock.calls.filter(
      c => c[0]?.type === 'getProjects'
    );
    expect(getProjectsCalls).toHaveLength(0);
    
    // Should have cached installed status
    expect(el.projects[0]?.installedVersion).toBe('1.0.0');
  });

  test('invalidates cache on install response', async () => {
    const el = await fixture(html`
      <package-details-panel ?open=${true}></package-details-panel>
    `);
    
    // Prime the cache
    el.installedStatusCache.set('packagea', new Map([
      ['/path/Project1.csproj', '1.0.0'],
    ]));
    el.lastCheckedPackageId = 'PackageA';
    
    // Simulate install response
    el.handleInstallResponse({
      packageId: 'PackageA',
      version: '2.0.0',
      success: true,
      results: [{ projectPath: '/path/Project1.csproj', success: true }],
    });
    
    // Cache should be cleared
    expect(el.installedStatusCache.has('packagea')).toBe(false);
    expect(el.lastCheckedPackageId).toBeNull();
  });

  test('clears all cache on clearInstalledStatusCache', () => {
    const el = document.createElement('package-details-panel') as PackageDetailsPanel;
    
    // Add some cache entries
    el.installedStatusCache.set('pkg1', new Map());
    el.installedStatusCache.set('pkg2', new Map());
    el.lastCheckedPackageId = 'pkg1';
    
    // Clear
    el.clearInstalledStatusCache();
    
    expect(el.installedStatusCache.size).toBe(0);
    expect(el.lastCheckedPackageId).toBeNull();
  });
});
```

---

## Success Criteria

| Metric | Before | After |
|--------|--------|-------|
| Backend calls when revisiting package | 1 per visit | 0 (cached) |
| Time to show installed status on revisit | 500-2000ms | <10ms |
| Memory usage | Minimal | +1-5KB per cached package |

---

## Dependencies

- **IMPL-PERF-002**: Provides `cachedProjects` from root component
- **IMPL-PERF-004**: Request cancellation prevents stale cache updates

## Blocks

- None - This is a final optimization

---

## Notes

**Cache Size Limits**
In practice, users don't browse hundreds of unique packages in a session. The cache naturally stays small. If needed, could add LRU eviction when cache exceeds 50 entries.

**Case Sensitivity**
Package IDs are stored lowercase in cache keys for consistent lookups, matching NuGet's case-insensitive ID handling.

**Cache Coherence**
The cache must be invalidated when:
1. Package installed (affects that package's entry)
2. Package uninstalled (affects that package's entry)
3. `.csproj` file changes externally (affects all entries)
4. Workspace changes (clear everything)

**Future Enhancement: Cross-Package Cache**
Could cache installed status globally: `Map<projectPath, Map<packageId, version>>`. This would allow instant status for ANY package after the first full scan. Defer until profiling shows need.

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-01-28 | Implementation plan created | AI Assistant |
