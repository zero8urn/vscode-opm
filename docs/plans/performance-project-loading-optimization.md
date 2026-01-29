# Performance Optimization Plan: Project Loading in Package Details

**Created**: 2026-01-27  
**Updated**: 2026-01-28  
**Priority**: High  
**Estimated Effort**: 3-4 days  
**Impact**: Significant UX improvement (90%+ reduction in load times)

---

## Executive Summary

The package details panel currently exhibits significant performance issues when displaying project lists:

- **Problem 1**: Projects fetched on EVERY package click (no frontend caching)
- **Problem 2**: Backend parses ALL `.csproj` files on EVERY request (60s TTL exists but separate parse for each packageId)
- **Problem 3**: Multiple concurrent requests create race conditions
- **Problem 4**: No skeleton/loading states for perceived performance
- **Opportunity**: Fetch projects early when search view opens, not when details panel opens

**Expected Impact**: 
- First-load optimization: 90%+ reduction in redundant fetches
- Backend caching: Seconds → milliseconds after initial parse
- Early prefetch: Zero perceived delay when opening details panel
- Perceived performance: Instant visual feedback with skeleton states

**Integration Note**: This plan integrates with [STORY-001-02-011-external-change-detection](../stories/STORY-001-02-011-external-change-detection.md) which provides file watcher infrastructure for cache invalidation. Phase 2 leverages that story's `ProjectFileWatcher` for automatic cache invalidation on external `.csproj` changes.

---

## Problem Analysis

### Current Flow (Slow ❌)
```
User opens Package Browser
  → Search view renders
  → User searches for packages
  → User clicks Package A
    → Details panel opens
    → fetchProjects() called → IPC → Backend parses ALL .csproj files
    → 2-5 seconds delay
    → Projects list appears
  → User clicks Package B
    → fetchProjects() called AGAIN → IPC → Backend parses ALL .csproj files AGAIN
    → 2-5 seconds delay AGAIN
    → Projects list appears
```

### Optimized Flow (Fast ✅)
```
User opens Package Browser
  → packageBrowser.connectedCallback() fires
  → Immediately fetch projects (in background)
  → Show skeleton UI immediately (perceived performance)
  → Projects cached in frontend + backend (60s TTL already exists)
  → Search view renders
  → User searches for packages
  → User clicks Package A
    → Details panel opens
    → Uses cached projects (instant ⚡)
    → Only fetch "installed status" for this packageId
    → Projects list appears immediately
  → User clicks Package B
    → Uses cached projects (instant ⚡)
    → Lightweight installed status check
    → Projects list appears immediately
```

---

## Key Technical Insights

### Existing Infrastructure Analysis

1. **Backend Cache Already Exists**: `DotnetProjectParser` has 60-second TTL cache (`CACHE_TTL_MS = 60_000`). The problem is the frontend calls `fetchProjects()` on EVERY package click, triggering IPC even when backend cache is valid.

2. **File Watcher Already Implemented**: `DotnetProjectParser.startWatching()` accepts a `FileSystemWatcher` and auto-invalidates cache on `.csproj` changes. This integrates with STORY-001-02-011.

3. **Two-Part Problem**: 
   - **Project List** (names, paths, frameworks) — changes rarely, should be cached
   - **Installed Status** (which packages installed in each project) — changes per-packageId, must be checked

4. **Cache Key Issue**: Backend caches by `projectPath`, not by `(projectPath, packageId)`. This means `parseProjects()` returns cached metadata, but `installedVersion` check still runs for each different packageId.

### Perceived Performance Patterns

1. **Skeleton Loading**: Show project list structure immediately with loading shimmer while fetching
2. **Optimistic Updates**: After install, update UI immediately before backend confirms
3. **Progressive Enhancement**: Show project names first, then installed status as it loads
4. **Debounce + Cancel**: Prevent redundant work on rapid package switching

---

## Implementation Plan

### Phase 0: Skeleton Loading (Perceived Performance 👁️) — NEW
**Goal**: Instant visual feedback while data loads  
**Effort**: 1-2 hours  
**Impact**: App feels instant even when backend is slow

#### Actions:

**0.1 Add Skeleton State to `packageDetailsPanel.ts`**
- Show project count skeleton immediately when panel opens
- Replace skeleton with real content when `projects` array arrives
- Pattern: Skeleton → Loading shimmer → Real content

**0.2 Skeleton CSS Component**
```css
.skeleton {
  background: linear-gradient(90deg, 
    var(--vscode-editor-background) 25%,
    var(--vscode-input-background) 50%,
    var(--vscode-editor-background) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

---

### Phase 1: Early Project Fetch (Quick Win 🎯)
**Goal**: Fetch projects when search view opens, cache in root component  
**Effort**: 2-3 hours  
**Impact**: Eliminates perceived delay for all subsequent package clicks

#### Key Change from Original Plan:
The early fetch should get **project list only** (no packageId). When user clicks a package, do a **lightweight check** for installed status only.

#### Actions:

**1.1 Add Projects State to `packageBrowser.ts`**
- **File**: `src/webviews/apps/packageBrowser/packageBrowser.ts`
- **Location**: After existing `@state()` properties (around line 60)
- Add:
  ```typescript
  @state()
  private projects: ProjectInfo[] = [];
  
  @state()
  private projectsLoading = false;
  
  @state()
  private projectsFetched = false;
  ```

**1.2 Implement `fetchProjectsEarly()` Method**
- **File**: `src/webviews/apps/packageBrowser/packageBrowser.ts`
- **Location**: Add after `handleHostMessage` (around line 200)
- Add method:
  ```typescript
  private async fetchProjectsEarly(): Promise<void> {
    if (this.projectsFetched || this.projectsLoading) {
      return; // Already fetched or in progress
    }
    
    this.projectsLoading = true;
    
    const requestId = Math.random().toString(36).substring(2, 15);
    vscode.postMessage({
      type: 'getProjects',
      payload: { requestId, packageId: null }, // No packageId = just get project list
    });
    
    // Wait for response via handleHostMessage
  }
  ```

**1.3 Call Early Fetch in `connectedCallback()`**
- **File**: `src/webviews/apps/packageBrowser/packageBrowser.ts`
- **Location**: Line ~113, in `connectedCallback()`
- Modify:
  ```typescript
  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener('message', this.handleHostMessage);
    
    // Prefetch projects immediately when webview loads
    void this.fetchProjectsEarly();
  }
  ```

**1.4 Handle `getProjectsResponse` in Root Component**
- **File**: `src/webviews/apps/packageBrowser/packageBrowser.ts`
- **Location**: In `handleHostMessage` method (around line 170)
- Add message handler:
  ```typescript
  else if (isGetProjectsResponseMessage(msg)) {
    this.projects = msg.args.projects || [];
    this.projectsLoading = false;
    this.projectsFetched = true;
    console.log('Projects prefetched:', this.projects.length);
  }
  ```

**1.5 Pass Cached Projects to `packageDetailsPanel`**
- **File**: `src/webviews/apps/packageBrowser/packageBrowser.ts`
- **Location**: In `render()` template, around line 165
- Modify `<package-details-panel>`:
  ```typescript
  <package-details-panel
    .packageData=${this.packageDetailsData}
    .includePrerelease=${this.includePrerelease}
    .projects=${this.projects}  <!-- NEW: Pass cached projects -->
    ?open=${this.detailsPanelOpen}
    @close=${this.handlePanelClose}
    ...
  ></package-details-panel>
  ```

**1.6 Update `packageDetailsPanel` to Accept Projects Prop**
- **File**: `src/webviews/apps/packageBrowser/components/packageDetailsPanel.ts`
- **Location**: After existing `@property()` declarations (around line 20)
- Add property:
  ```typescript
  @property({ type: Array })
  projects: ProjectInfo[] = [];  // Passed from parent, no longer @state
  ```

**1.7 Modify `fetchProjects()` to Use Cached Data**
- **File**: `src/webviews/apps/packageBrowser/components/packageDetailsPanel.ts`
- **Location**: `fetchProjects()` method (line ~499)
- Simplify to ONLY update installed status:
  ```typescript
  private async fetchProjects(): Promise<void> {
    // Guard: Don't fetch without package context
    if (!this.packageData?.id) {
      return;
    }
    
    // If projects already provided by parent, just update installed status
    if (this.projects && this.projects.length > 0) {
      console.log('Using cached projects, updating installed status');
      // Send lightweight request to ONLY check installed status for this package
      // Backend should use cached parse results
    }
    
    // Otherwise fallback to full fetch (backward compatibility)
    // ...existing full fetch logic...
  }
  ```

**1.8 Add Type Guard for `GetProjectsResponseMessage`**
- **File**: `src/webviews/apps/packageBrowser/types.ts`
- **Location**: Check if `isGetProjectsResponseMessage` already exists
- Verify it's exported and imported in `packageBrowser.ts`

---

### Phase 2: Backend Project Metadata Cache (Performance 🚀)
**Goal**: Cache parsed `.csproj` data in extension host  
**Effort**: 4-6 hours  
**Impact**: Reduces 2-5 second delays to <100ms

#### Actions:

**2.1 Create `ProjectMetadataCache` Service**
- **File**: `src/services/cache/projectMetadataCache.ts` (NEW)
- **Features**:
  - Cache `Map<projectPath, { metadata, lastModified, installedPackages }>`
  - TTL-based invalidation (e.g., 5 minutes)
  - Invalidate on file system changes (FileSystemWatcher)
  - Invalidate specific project on install/uninstall

**2.2 Integrate Cache into `DotnetProjectParser`**
- **File**: `src/services/cli/dotnetProjectParser.ts`
- **Modifications**:
  - Check cache before parsing
  - Store results in cache after parsing
  - Add `parseProjectsWithCache(paths: string[]): Promise<Map<string, ParseResult>>`

**2.3 Update `handleGetProjectsRequest` to Use Cache**
- **File**: `src/webviews/packageBrowserWebview.ts`
- **Location**: `handleGetProjectsRequest()` (line ~543)
- Modify:
  ```typescript
  // Use cached parser instead of fresh parse
  const parseResults = packageId 
    ? await projectParser.parseProjectsWithCache(projectPaths)  // CACHED
    : new Map();
  ```

**2.4 Invalidate Cache on Install/Uninstall**
- **Files**: 
  - `src/commands/installPackageCommand.ts`
  - `src/commands/uninstallPackageCommand.ts`
- **Action**: Call `projectMetadataCache.invalidate(projectPath)` after successful operations

**2.5 Add File Watcher for `.csproj` Changes**
- **File**: `src/services/cache/projectMetadataCache.ts`
- **Feature**: Watch `**/*.csproj` files, invalidate cache entries on change
- **Lifecycle**: Create in `extension.ts` activation, dispose on deactivation

---

### Phase 3: Request Cancellation & Debouncing (Reliability 🛡️)
**Goal**: Prevent race conditions and redundant work  
**Effort**: 2-3 hours  
**Impact**: Eliminates log flooding, ensures correct data displayed

#### Actions:

**3.1 Add Request Cancellation in `packageDetailsPanel`**
- **File**: `src/webviews/apps/packageBrowser/components/packageDetailsPanel.ts`
- **Location**: `fetchProjects()` method (line ~499)
- Add:
  ```typescript
  private currentProjectsController: AbortController | null = null;
  
  private async fetchProjects(): Promise<void> {
    // Cancel any in-flight request
    if (this.currentProjectsController) {
      this.currentProjectsController.abort();
    }
    
    this.currentProjectsController = new AbortController();
    const requestId = Math.random().toString(36).substring(2, 15);
    
    // Store requestId with controller to match responses
    // ...existing fetch logic...
  }
  ```

**3.2 Debounce Package Selection**
- **File**: `src/webviews/apps/packageBrowser/components/packageDetailsPanel.ts`
- **Location**: `updated()` lifecycle (line ~699)
- Add debounce:
  ```typescript
  private packageChangeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  
  override updated(changedProperties: Map<string, unknown>): void {
    if (changedProperties.has('packageData') && this.packageData) {
      // Clear existing timer
      if (this.packageChangeDebounceTimer) {
        clearTimeout(this.packageChangeDebounceTimer);
      }
      
      // Debounce fetch by 150ms
      this.packageChangeDebounceTimer = setTimeout(() => {
        if (this.open) {
          void this.fetchProjects();
        }
      }, 150);
    }
  }
  ```

**3.3 Ignore Stale Responses**
- **File**: `src/webviews/apps/packageBrowser/components/packageDetailsPanel.ts`
- **Location**: Response handler in `fetchProjects()` (line ~527)
- Add check:
  ```typescript
  const handler = (event: MessageEvent) => {
    const message = event.data;
    if (
      message?.type === 'notification' &&
      message?.name === 'getProjectsResponse' &&
      message?.args?.requestId === requestId &&
      !this.currentProjectsController?.signal.aborted  // NEW: Ignore if aborted
    ) {
      // ...process response...
    }
  };
  ```

---

### Phase 4: Optimize "Check Installed" Logic (Fine-Tuning ⚙️)
**Goal**: Only fetch installed status when packageId changes  
**Effort**: 1-2 hours  
**Impact**: Further reduces backend load

#### Actions:

**4.1 Track Last Checked Package**
- **File**: `src/webviews/apps/packageBrowser/components/packageDetailsPanel.ts`
- Add state:
  ```typescript
  private lastCheckedPackageId: string | null = null;
  ```

**4.2 Skip Redundant Installed Status Checks**
- **File**: `src/webviews/apps/packageBrowser/components/packageDetailsPanel.ts`
- **Location**: `fetchProjects()` (line ~499)
- Add guard:
  ```typescript
  private async fetchProjects(): Promise<void> {
    if (!this.packageData?.id) return;
    
    // Skip if we already have installed status for this package
    if (this.packageData.id === this.lastCheckedPackageId && this.projects.length > 0) {
      console.log('Reusing installed status for', this.packageData.id);
      return;
    }
    
    this.lastCheckedPackageId = this.packageData.id;
    // ...fetch logic...
  }
  ```

**4.3 Invalidate on Install/Uninstall**
- **File**: `src/webviews/apps/packageBrowser/components/packageDetailsPanel.ts`
- **Location**: `handleInstallResponse()` and `handleUninstallResponse()` (lines ~595, ~635)
- Add:
  ```typescript
  this.lastCheckedPackageId = null;  // Force re-check
  void this.fetchProjects();
  ```

---

## Testing Strategy

### Unit Tests

**Phase 1 Tests**:
- `packageBrowser.test.ts`: 
  - Test `fetchProjectsEarly()` called on `connectedCallback()`
  - Test projects cached and passed to details panel
  - Test `getProjectsResponse` handled correctly

**Phase 2 Tests**:
- `projectMetadataCache.test.ts`:
  - Test cache hit/miss scenarios
  - Test TTL expiration
  - Test file watcher invalidation
- `dotnetProjectParser.test.ts`:
  - Test `parseProjectsWithCache()` returns cached results
  - Test fresh parse on cache miss

**Phase 3 Tests**:
- `packageDetailsPanel.test.ts`:
  - Test request cancellation on rapid package changes
  - Test debounce timer clears correctly
  - Test stale responses ignored

### Integration Tests

**Phase 1**:
- E2E test: Open browser → verify `getProjects` called once → click 3 packages → verify NO additional `getProjects` calls

**Phase 2**:
- E2E test: Open browser → measure first fetch time → close/reopen → measure second fetch (should be <100ms)

**Phase 3**:
- E2E test: Rapidly click 5 packages → verify only 1 active request in logs

---

## Rollout Plan

### Step 1: Phase 1 (Early Fetch) - Day 1
- Implement early fetch in `packageBrowser.ts`
- Pass cached projects to `packageDetailsPanel`
- Test manually with 5+ package clicks
- **Success Criteria**: Zero delays after first load

### Step 2: Phase 2 (Backend Cache) - Day 2
- Implement `ProjectMetadataCache`
- Integrate into `DotnetProjectParser`
- Add file watchers
- Test with large workspace (20+ projects)
- **Success Criteria**: Sub-100ms response times after first parse

### Step 3: Phase 3 (Cancellation) - Day 2-3
- Add request cancellation
- Add debouncing
- Test rapid clicking scenarios
- **Success Criteria**: No duplicate work in logs

### Step 4: Phase 4 (Fine-Tuning) - Day 3
- Optimize installed status checks
- Add skip-redundant-fetch logic
- Performance testing
- **Success Criteria**: Minimal backend calls

### Step 5: Documentation & Release
- Update `CHANGELOG.md`
- Add performance metrics to docs
- Create before/after demo
- Release notes

---

## Success Metrics

| Metric | Before | Target | Measurement |
|--------|--------|--------|-------------|
| Time to show projects (first click) | 2-5 seconds | <500ms | E2E test timer |
| Time to show projects (subsequent) | 2-5 seconds | <50ms (cached) | E2E test timer |
| `getProjects` calls per session | 10+ (1 per package) | 1-2 | Log inspection |
| Backend parsing time | 2-5 seconds | <100ms (cached) | Server logs |
| Race conditions | Common | Zero | E2E stress test |

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Stale cache shows wrong installed status | High | Invalidate on install/uninstall + file watchers |
| Early fetch slows initial load | Medium | Fetch in background (non-blocking) |
| Cache memory usage in large workspaces | Low | TTL expiration + LRU eviction policy |
| Breaking change in IPC protocol | Low | Backward compatibility (fallback to old behavior) |

---

## Future Enhancements

1. **Incremental Updates**: Only re-parse changed projects
2. **Persisted Cache**: Store cache to disk, survive extension restarts
3. **Preload on Workspace Open**: Fetch projects before browser even opens
4. **Parallelized Parsing**: Parse `.csproj` files in worker threads

---

## Related Files

### Modified:
- `src/webviews/apps/packageBrowser/packageBrowser.ts`
- `src/webviews/apps/packageBrowser/components/packageDetailsPanel.ts`
- `src/webviews/packageBrowserWebview.ts`
- `src/services/cli/dotnetProjectParser.ts`

### New:
- `src/services/cache/projectMetadataCache.ts`
- `src/services/cache/__tests__/projectMetadataCache.test.ts`

### Test Files:
- `test/e2e/packageBrowser.e2e.ts`
- `src/webviews/apps/packageBrowser/__tests__/packageBrowser.test.ts`
- `src/webviews/apps/packageBrowser/components/__tests__/packageDetailsPanel.test.ts`

---

## Questions & Decisions

1. **Q**: Should we cache installed package data separately from project metadata?  
   **A**: No — project metadata is already cached in `DotnetProjectParser` with 60s TTL. The frontend just needs to stop re-requesting on every package click.

2. **Q**: What's the optimal TTL for cache entries?  
   **A**: Backend: 60 seconds (already implemented). Frontend: Infinite during session (invalidated by file watchers/install events).

3. **Q**: Should early fetch block webview rendering?  
   **A**: No — fire-and-forget in `connectedCallback()`, show skeleton UI while loading.

4. **Q**: How does this integrate with STORY-001-02-011 external change detection?  
   **A**: File watcher from that story triggers `CacheInvalidator.invalidateOnFileChange()` → clears backend cache → sends `projectsChanged` IPC notification → frontend clears cached projects → UI refreshes.

---

## Implementation Plans (IMPL-* Documents)

| Phase | Document | Status |
|-------|----------|--------|
| Phase 0 | [IMPL-PERF-001-skeleton-loading](../technical/IMPL-PERF-001-skeleton-loading.md) | ✅ Implemented |
| Phase 1 | [IMPL-PERF-002-early-project-fetch](../technical/IMPL-PERF-002-early-project-fetch.md) | ✅ Implemented |
| Phase 2 | [IMPL-PERF-003-backend-cache-optimization](../technical/IMPL-PERF-003-backend-cache-optimization.md) | Not Started |
| Phase 3 | [IMPL-PERF-004-request-cancellation](../technical/IMPL-PERF-004-request-cancellation.md) | Not Started |
| Phase 4 | [IMPL-PERF-005-installed-status-optimization](../technical/IMPL-PERF-005-installed-status-optimization.md) | Not Started |

---

**Next Steps**: ~~Review plan with team → Approve Phase 0+1 → Begin implementation~~ Phase 0+1 implemented. Review Phase 2-4 for backend optimizations.
