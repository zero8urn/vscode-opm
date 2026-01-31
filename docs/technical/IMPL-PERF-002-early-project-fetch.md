# IMPL-PERF-002-early-project-fetch

**Plan**: [Performance Optimization Plan](../plans/performance-project-loading-optimization.md)  
**Created**: 2026-01-28  
**Status**: Implemented  
**Priority**: High  
**Effort**: 2-3 hours

## Overview

Implement early project fetching in the Package Browser root component to eliminate the delay users experience when clicking on packages. Currently, projects are fetched when the details panel opens — this moves that fetch to when the webview first loads.

**Current Flow** (slow):
```
Webview loads → User searches → User clicks package → Details panel opens → fetchProjects() → 2-5s wait → Projects appear
```

**Optimized Flow** (fast):
```
Webview loads → fetchProjectsEarly() starts → User searches → User clicks package → Details panel opens → Projects appear instantly (from cache)
```

**Key Insight**: The backend already has a 60-second TTL cache in `DotnetProjectParser`. The problem is the frontend calls `fetchProjects()` on EVERY package click, triggering IPC even when backend cache is valid. By caching projects at the root component level, we eliminate redundant IPC calls entirely.

## Implementation Checklist

### Phase 1: Root Component State
- [x] 1. Add `cachedProjects: ProjectInfo[]` state to `PackageBrowserApp` ([§1](#1-root-component-state))
- [x] 2. Add `projectsLoading: boolean` state ([§1](#1-root-component-state))
- [x] 3. Add `projectsFetched: boolean` flag to prevent duplicate fetches ([§1](#1-root-component-state))

### Phase 2: Early Fetch Implementation
- [x] 4. Implement `fetchProjectsEarly()` method in `PackageBrowserApp` ([§2](#2-early-fetch-method))
- [x] 5. Call `fetchProjectsEarly()` in `connectedCallback()` ([§2](#2-early-fetch-method))
- [x] 6. Handle `getProjectsResponse` in root component's `handleHostMessage` ([§2](#2-early-fetch-method))
- [x] 7. Add `isGetProjectsResponseMessage` type guard if not exists ([§2](#2-early-fetch-method))

### Phase 3: Pass Cached Projects Down
- [x] 8. Add `.cachedProjects` property to `<package-details-panel>` template ([§3](#3-pass-cached-projects))
- [x] 9. Update `PackageDetailsPanel` to accept `cachedProjects` prop ([§3](#3-pass-cached-projects))
- [x] 10. Modify `fetchProjects()` to use cached projects when available ([§3](#3-pass-cached-projects))

### Phase 4: Separate Project List from Installed Status
- [x] 11. Create new `fetchInstalledStatus()` method ([§4](#4-separate-concerns))
- [x] 12. Update `fetchProjects()` to call `fetchInstalledStatus()` when cache available ([§4](#4-separate-concerns))
- [x] 13. Keep existing `getProjects` with packageId for installed status checks ([§4](#4-separate-concerns))

### Phase 5: Cache Invalidation Integration
- [x] 14. Listen for `projectsChanged` notification in root component ([§5](#5-cache-invalidation))
- [x] 15. Clear cached projects and re-fetch when `projectsChanged` received ([§5](#5-cache-invalidation))
- [ ] 16. Integrate with STORY-001-02-011 file watcher when implemented ([§5](#5-cache-invalidation))

### Phase 6: Testing
- [ ] 17. Unit tests for `fetchProjectsEarly()` behavior ([§6](#6-testing))
- [ ] 18. Unit tests for cache invalidation on `projectsChanged` ([§6](#6-testing))
- [ ] 19. E2E test: verify single `getProjects` call for multiple package clicks ([§6](#6-testing))

---

## Detailed Implementation Sections

### §1. Root Component State

**File**: `src/webviews/apps/packageBrowser/packageBrowser.ts`

Add state properties after existing `@state()` declarations (around line 50):

```typescript
@customElement('package-browser-app')
export class PackageBrowserApp extends LitElement {
  // ... existing state ...

  @state()
  private detailsLoading = false;

  // NEW: Cached projects state
  @state()
  private cachedProjects: ProjectInfo[] = [];

  @state()
  private projectsLoading = false;

  @state()
  private projectsFetched = false;

  // ... rest of class ...
}
```

**Import `ProjectInfo` type**:

```typescript
import type { ProjectInfo } from './types';
```

---

### §2. Early Fetch Method

**File**: `src/webviews/apps/packageBrowser/packageBrowser.ts`

**Add method after `handleHostMessage`** (around line 220):

```typescript
/**
 * Fetch projects immediately when webview loads.
 * Results are cached in state and passed to child components.
 * Does NOT include packageId — just gets the project list structure.
 */
private fetchProjectsEarly(): void {
  // Guard: Already fetched or in progress
  if (this.projectsFetched || this.projectsLoading) {
    console.log('Projects already fetched or loading, skipping early fetch');
    return;
  }

  console.log('Early fetching projects...');
  this.projectsLoading = true;

  const requestId = Math.random().toString(36).substring(2, 15);
  vscode.postMessage({
    type: 'getProjects',
    payload: {
      requestId,
      packageId: null, // No packageId = just get project list (fast)
    },
  });
}
```

**Call in `connectedCallback()`**:

```typescript
override connectedCallback() {
  super.connectedCallback();
  window.addEventListener('message', this.handleHostMessage);

  // Prefetch projects immediately when webview loads
  this.fetchProjectsEarly();
}
```

**Handle response in `handleHostMessage`**:

```typescript
private handleHostMessage = (event: MessageEvent): void => {
  const msg = event.data;

  if (isSearchResponseMessage(msg)) {
    // ... existing search handling ...
  } else if (isGetProjectsResponseMessage(msg)) {
    // Handle early fetch response
    console.log('Projects response received:', {
      count: msg.args.projects?.length ?? 0,
      error: msg.args.error,
    });
    
    if (!msg.args.error) {
      this.cachedProjects = msg.args.projects || [];
      this.projectsFetched = true;
    }
    this.projectsLoading = false;
  } else if (isProjectsChangedNotification(msg)) {
    // Cache invalidation: clear and re-fetch
    console.log('Projects changed notification received, clearing cache');
    this.cachedProjects = [];
    this.projectsFetched = false;
    this.fetchProjectsEarly();
  }
  // ... rest of handlers ...
};
```

**Add type guard** (check if exists in `types.ts` first):

```typescript
// In types.ts
export interface GetProjectsResponseMessage {
  type: 'notification';
  name: 'getProjectsResponse';
  args: {
    requestId: string;
    projects?: ProjectInfo[];
    error?: { message: string; code: string };
  };
}

export function isGetProjectsResponseMessage(msg: unknown): msg is GetProjectsResponseMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: string }).type === 'notification' &&
    (msg as { name?: string }).name === 'getProjectsResponse'
  );
}
```

---

### §3. Pass Cached Projects

**File**: `src/webviews/apps/packageBrowser/packageBrowser.ts`

**Update `render()` template** (around line 160):

```typescript
<package-details-panel
  .packageData=${this.packageDetailsData}
  .includePrerelease=${this.includePrerelease}
  .cachedProjects=${this.cachedProjects}
  .projectsLoading=${this.projectsLoading}
  ?open=${this.detailsPanelOpen}
  @close=${this.handlePanelClose}
  @version-selected=${this.handleVersionSelected}
  @install-package=${this.handleInstallPackage}
  @uninstall-package=${this.handleUninstallPackage}
  @package-selected=${this.handlePackageSelected}
></package-details-panel>
```

**File**: `src/webviews/apps/packageBrowser/components/packageDetailsPanel.ts`

**Add property** (around line 25):

```typescript
@property({ type: Array })
cachedProjects: ProjectInfo[] = [];

@property({ type: Boolean })
projectsLoading = false;
```

**Modify `fetchProjects()` method** (line ~499):

```typescript
private async fetchProjects(): Promise<void> {
  // Guard: Don't fetch without package context
  if (!this.packageData?.id) {
    this.projects = [];
    return;
  }

  // Use cached projects as base, just need to check installed status
  if (this.cachedProjects.length > 0) {
    console.log('Using cached projects, checking installed status for:', this.packageData.id);
    
    // Set projects immediately from cache (with loading indicator for installed status)
    this.projects = this.cachedProjects.map(p => ({
      ...p,
      installedVersion: undefined, // Will be updated by installed status check
    }));
    
    // Now fetch just the installed status
    await this.fetchInstalledStatus();
    return;
  }

  // Fallback: Full fetch if no cache (backward compatibility)
  console.log('No cached projects, doing full fetch');
  this.projectsLoading = true;
  
  // ... existing full fetch logic ...
}

/**
 * Fetch only installed status for current package.
 * Uses existing getProjects IPC with packageId.
 */
private async fetchInstalledStatus(): Promise<void> {
  const requestId = Math.random().toString(36).substring(2, 15);
  
  vscode.postMessage({
    type: 'getProjects',
    payload: {
      requestId,
      packageId: this.packageData?.id,
    },
  });

  // ... existing promise-based response handling ...
}
```

---

### §4. Separate Concerns

**File**: `src/webviews/packageBrowserWebview.ts`

The existing `handleGetProjectsRequest` already supports `packageId: null`. When `packageId` is null, it skips the parsing step:

```typescript
async function handleGetProjectsRequest(
  message: GetProjectsRequestMessage,
  panel: vscode.WebviewPanel,
  logger: ILogger,
  solutionContext: SolutionContextService,
  projectParser: DotnetProjectParser,
): Promise<void> {
  const { requestId, packageId } = message.payload;

  // ...

  // Parse all projects in parallel if packageId provided
  const projectPaths = context.projects.map(p => p.path);
  const parseResults = packageId 
    ? await projectParser.parseProjects(projectPaths)  // Full parse for installed status
    : new Map();  // Skip parsing if no packageId (fast path!)

  // ...
}
```

**This is already implemented correctly!** When `packageId` is null:
- No `.csproj` parsing happens
- Just returns project list from `SolutionContextService`
- Response is near-instant (<10ms)

---

### §5. Cache Invalidation

**File**: `src/webviews/apps/packageBrowser/packageBrowser.ts`

The root component should listen for `projectsChanged` notification and invalidate its cache:

```typescript
// In handleHostMessage
else if (isProjectsChangedNotification(msg)) {
  console.log('Projects changed notification received');
  
  // Clear frontend cache
  this.cachedProjects = [];
  this.projectsFetched = false;
  
  // Re-fetch project list
  this.fetchProjectsEarly();
  
  // If details panel is open, trigger installed status refresh
  if (this.detailsPanelOpen && this.packageDetailsData) {
    const detailsPanel = this.shadowRoot?.querySelector('package-details-panel');
    if (detailsPanel) {
      (detailsPanel as PackageDetailsPanel).refreshProjects?.();
    }
  }
}
```

**Integration with STORY-001-02-011**:
- File watcher detects `.csproj` change
- Triggers `CacheInvalidator.invalidateOnFileChange()`
- Backend cache cleared
- IPC notification `projectsChanged` sent to webview
- Frontend cache cleared
- UI refreshes

---

### §6. Testing

**Unit Tests**: `src/webviews/apps/packageBrowser/__tests__/packageBrowser.test.ts`

```typescript
describe('Early Project Fetch', () => {
  test('fetchProjectsEarly called on connectedCallback', async () => {
    const postMessageSpy = vi.spyOn(vscode, 'postMessage');
    
    const el = await fixture(html`<package-browser-app></package-browser-app>`);
    
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'getProjects',
        payload: expect.objectContaining({ packageId: null }),
      })
    );
  });

  test('projects cached after response', async () => {
    const el = await fixture(html`<package-browser-app></package-browser-app>`);
    
    // Simulate response
    window.dispatchEvent(new MessageEvent('message', {
      data: {
        type: 'notification',
        name: 'getProjectsResponse',
        args: {
          requestId: 'test',
          projects: [{ name: 'Project1', path: '/path/Project1.csproj' }],
        },
      },
    }));
    
    await el.updateComplete;
    
    expect(el.cachedProjects).toHaveLength(1);
    expect(el.projectsFetched).toBe(true);
  });

  test('does not re-fetch if already fetched', async () => {
    const postMessageSpy = vi.spyOn(vscode, 'postMessage');
    
    const el = await fixture(html`<package-browser-app></package-browser-app>`);
    
    // Mark as already fetched
    el.projectsFetched = true;
    
    // Try to fetch again
    el.fetchProjectsEarly();
    
    // Should only have initial call, not second
    expect(postMessageSpy).toHaveBeenCalledTimes(1);
  });

  test('clears cache on projectsChanged notification', async () => {
    const el = await fixture(html`<package-browser-app></package-browser-app>`);
    
    // Set up cached state
    el.cachedProjects = [{ name: 'OldProject', path: '/path' }];
    el.projectsFetched = true;
    
    // Simulate projectsChanged
    window.dispatchEvent(new MessageEvent('message', {
      data: {
        type: 'notification',
        name: 'projectsChanged',
        args: {},
      },
    }));
    
    await el.updateComplete;
    
    expect(el.cachedProjects).toHaveLength(0);
    expect(el.projectsFetched).toBe(false);
  });
});
```

**E2E Test**: `test/e2e/packageBrowser.e2e.ts`

```typescript
test('single getProjects call for multiple package selections', async function() {
  this.timeout(15000);
  
  // Open browser
  await vscode.commands.executeCommand('opm.openPackageBrowser');
  await sleep(1000);
  
  // Count getProjects calls in logs
  // ... test implementation ...
});
```

---

## Success Criteria

| Metric | Before | After |
|--------|--------|-------|
| `getProjects` calls per session | 10+ (1 per package click) | 1-2 (initial + rare invalidation) |
| Time to show projects (subsequent clicks) | 2-5 seconds | <50ms (from cache) |
| IPC messages during browsing | High volume | Minimal |

---

## Dependencies

- **IMPL-PERF-001-skeleton-loading**: Shows loading state while early fetch runs

## Blocks

- **IMPL-PERF-003**: Backend cache optimization can proceed independently
- **IMPL-PERF-005**: Installed status optimization builds on this caching

---

## Notes

**Why Cache at Root Component?**
- Single source of truth for project list
- Prevents duplicate fetches across component re-renders
- Easy to invalidate from one place
- Matches React/Lit "lift state up" pattern

**Why `packageId: null` for Early Fetch?**
- Skips expensive `.csproj` parsing
- Just returns project list from solution discovery (already cached)
- Response time: <10ms vs 2-5 seconds

**Backward Compatibility**
- `packageDetailsPanel.fetchProjects()` still works if no cached projects
- Graceful fallback to full fetch behavior
- No breaking changes to existing IPC protocol

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-01-29 | Implementation completed: early fetch, cached projects, cache invalidation | AI Assistant |
| 2026-01-28 | Implementation plan created | AI Assistant |
