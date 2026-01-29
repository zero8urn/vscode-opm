# IMPL-PERF-004-request-cancellation

**Plan**: [Performance Optimization Plan](../plans/performance-project-loading-optimization.md)  
**Created**: 2026-01-28  
**Status**: Implemented (Phase 1, 2, 4 complete; Phase 3 optional, Phase 5 pending tests)  
**Priority**: Medium  
**Effort**: 2-3 hours

## Overview

Implement request cancellation and debouncing in the Package Details Panel to prevent race conditions when users rapidly switch between packages. Currently, clicking multiple packages quickly results in:

1. Multiple concurrent `fetchProjects()` calls
2. Race conditions where older responses override newer data
3. Log flooding with redundant IPC messages
4. Wasted backend resources parsing the same projects multiple times

**Goal**: Only one active request at a time, with proper cancellation of stale requests.

## Current Problem

**Scenario**: User clicks Package A, then Package B, then Package C within 500ms

**Current Behavior** (bad):
```
Click A → fetchProjects(A) starts
Click B → fetchProjects(B) starts (A still running)
Click C → fetchProjects(C) starts (A, B still running)
A responds → UI shows A's data ❌
B responds → UI shows B's data ❌
C responds → UI shows C's data ✅ (correct but user saw flicker)
```

**Desired Behavior** (good):
```
Click A → fetchProjects(A) starts
Click B → A cancelled, fetchProjects(B) starts
Click C → B cancelled, fetchProjects(C) starts
C responds → UI shows C's data ✅ (no flicker)
```

## Implementation Checklist

### Phase 1: Request ID Tracking
- [x] 1. Add `currentRequestId` state to `PackageDetailsPanel` ([§1](#1-request-id-tracking))
- [x] 2. Generate unique request ID for each `fetchProjects()` call ([§1](#1-request-id-tracking))
- [x] 3. Compare request ID in response handler to ignore stale responses ([§1](#1-request-id-tracking))

### Phase 2: Package Selection Debounce
- [x] 4. Add debounce timer to `updated()` lifecycle ([§2](#2-debounce-package-selection))
- [x] 5. Clear existing timer when package changes rapidly ([§2](#2-debounce-package-selection))
- [x] 6. Only trigger `fetchProjects()` after 150ms of no changes ([§2](#2-debounce-package-selection))

### Phase 3: AbortController Integration (Optional)
- [ ] 7. Add `AbortController` for request cancellation signals ([§3](#3-abort-controller))
- [ ] 8. Pass abort signal to promise handlers ([§3](#3-abort-controller))
- [ ] 9. Clean up message listeners on abort ([§3](#3-abort-controller))

### Phase 4: Cleanup on Disconnect
- [x] 10. Clear debounce timer in `disconnectedCallback()` ([§4](#4-cleanup))
- [x] 11. Remove message listeners when component unmounts ([§4](#4-cleanup))
- [x] 12. Abort pending requests on panel close ([§4](#4-cleanup))

### Phase 5: Testing
- [ ] 13. Unit test: rapid package switching cancels stale requests ([§5](#5-testing))
- [ ] 14. Unit test: debounce prevents immediate fetch on each click ([§5](#5-testing))
- [ ] 15. Unit test: correct data shown for final package selection ([§5](#5-testing))

---

## Detailed Implementation Sections

### §1. Request ID Tracking

**File**: `src/webviews/apps/packageBrowser/components/packageDetailsPanel.ts`

Add state to track the current active request:

```typescript
@customElement(PACKAGE_DETAILS_PANEL_TAG)
export class PackageDetailsPanel extends LitElement {
  // ... existing properties ...

  /**
   * Tracks the ID of the currently active projects request.
   * Used to ignore stale responses from cancelled requests.
   */
  private currentProjectsRequestId: string | null = null;

  // ... rest of class ...
}
```

**Modify `fetchProjects()` method** (line ~499):

```typescript
private async fetchProjects(): Promise<void> {
  // Guard: Don't fetch without package context
  if (!this.packageData?.id) {
    this.projects = [];
    return;
  }

  // Generate unique request ID
  const requestId = Math.random().toString(36).substring(2, 15);
  this.currentProjectsRequestId = requestId;
  
  this.projectsLoading = true;

  console.log('Fetching projects for:', this.packageData.id, 'requestId:', requestId);

  try {
    vscode.postMessage({
      type: 'getProjects',
      payload: {
        requestId,
        packageId: this.packageData.id,
      },
    });

    // Wait for response
    const response = await new Promise<ProjectInfo[]>((resolve, reject) => {
      const timeout = setTimeout(() => {
        window.removeEventListener('message', handler);
        reject(new Error('Project fetch timeout'));
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

          // *** KEY CHECK: Ignore if this request was superseded ***
          if (this.currentProjectsRequestId !== requestId) {
            console.log('Ignoring stale response for requestId:', requestId);
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
    });

    // Only update state if this request is still current
    if (this.currentProjectsRequestId === requestId) {
      this.projects = response;
      console.log('Projects fetched:', {
        total: response.length,
        installed: response.filter(p => p.installedVersion).length,
        requestId,
      });
    }
  } catch (error) {
    // Don't log "Request superseded" as error
    if ((error as Error).message !== 'Request superseded') {
      console.error('Failed to fetch projects:', error);
    }
    
    // Only clear projects if this request is still current
    if (this.currentProjectsRequestId === requestId) {
      this.projects = [];
    }
  } finally {
    // Only clear loading state if this request is still current
    if (this.currentProjectsRequestId === requestId) {
      this.projectsLoading = false;
    }
  }
}
```

---

### §2. Debounce Package Selection

**File**: `src/webviews/apps/packageBrowser/components/packageDetailsPanel.ts`

Add debounce timer management:

```typescript
@customElement(PACKAGE_DETAILS_PANEL_TAG)
export class PackageDetailsPanel extends LitElement {
  // ... existing properties ...

  /**
   * Debounce timer for package selection changes.
   * Prevents rapid-fire fetches when user clicks through packages quickly.
   */
  private packageChangeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  
  private static readonly DEBOUNCE_MS = 150;

  // ... rest of class ...
}
```

**Modify `updated()` lifecycle** (line ~699):

```typescript
override updated(changedProperties: Map<string, unknown>): void {
  super.updated(changedProperties);

  // Reset selected version when package changes
  if (changedProperties.has('packageData') && this.packageData) {
    this.selectedVersion = this.packageData.version;

    // Clear any previous install results when switching packages
    const projectSelector = this.shadowRoot?.querySelector('project-selector');
    if (projectSelector) {
      (projectSelector as any).setResults([]);
    }

    // *** DEBOUNCED PROJECT FETCH ***
    // Clear existing debounce timer
    if (this.packageChangeDebounceTimer) {
      clearTimeout(this.packageChangeDebounceTimer);
      console.log('Debounce timer cleared for previous package');
    }

    // Debounce fetch by 150ms to handle rapid clicking
    this.packageChangeDebounceTimer = setTimeout(() => {
      if (this.open && this.packageData) {
        console.log('Debounce complete, fetching projects for:', this.packageData.id);
        void this.fetchProjects();
      }
      this.packageChangeDebounceTimer = null;
    }, PackageDetailsPanel.DEBOUNCE_MS);
  }

  // Fetch projects when panel opens (not debounced - user explicitly opened)
  if (changedProperties.has('open') && this.open && this.packageData) {
    // Only fetch if not already debounced from package change
    if (!this.packageChangeDebounceTimer) {
      void this.fetchProjects();
    }
  }
}
```

---

### §3. AbortController Integration (Optional)

For more robust cancellation (allows cleanup of event listeners immediately):

```typescript
private currentAbortController: AbortController | null = null;

private async fetchProjects(): Promise<void> {
  // Cancel previous request
  if (this.currentAbortController) {
    this.currentAbortController.abort();
  }
  this.currentAbortController = new AbortController();
  const { signal } = this.currentAbortController;

  // ... rest of fetch logic ...

  // In the promise:
  const handler = (event: MessageEvent) => {
    // Check abort signal
    if (signal.aborted) {
      window.removeEventListener('message', handler);
      return;
    }
    // ... handle message ...
  };

  // Also listen for abort
  signal.addEventListener('abort', () => {
    window.removeEventListener('message', handler);
    clearTimeout(timeout);
  });
}
```

**Note**: AbortController is optional since requestId tracking already handles stale responses. It provides cleaner cleanup but adds complexity.

---

### §4. Cleanup

**File**: `src/webviews/apps/packageBrowser/components/packageDetailsPanel.ts`

Clean up resources when component unmounts:

```typescript
override disconnectedCallback(): void {
  super.disconnectedCallback();
  
  // Clear debounce timer
  if (this.packageChangeDebounceTimer) {
    clearTimeout(this.packageChangeDebounceTimer);
    this.packageChangeDebounceTimer = null;
  }
  
  // Invalidate current request (any pending response will be ignored)
  this.currentProjectsRequestId = null;
  
  // Abort any pending request (if using AbortController)
  if (this.currentAbortController) {
    this.currentAbortController.abort();
    this.currentAbortController = null;
  }
  
  console.log('PackageDetailsPanel disconnected, resources cleaned up');
}
```

---

### §5. Testing

**Unit Tests**: `src/webviews/apps/packageBrowser/components/__tests__/packageDetailsPanel.test.ts`

```typescript
describe('Request Cancellation', () => {
  test('ignores stale responses when package changes rapidly', async () => {
    const postMessageSpy = vi.spyOn(vscode, 'postMessage');
    
    const el = await fixture(html`
      <package-details-panel
        ?open=${true}
        .packageData=${{ id: 'PackageA', version: '1.0.0' }}
      ></package-details-panel>
    `);
    
    // Wait for debounce
    await sleep(200);
    
    // Change package rapidly
    el.packageData = { id: 'PackageB', version: '2.0.0' };
    await el.updateComplete;
    
    // Respond with PackageA's data (stale)
    const staleRequestId = postMessageSpy.mock.calls[0]?.[0]?.payload?.requestId;
    window.dispatchEvent(new MessageEvent('message', {
      data: {
        type: 'notification',
        name: 'getProjectsResponse',
        args: {
          requestId: staleRequestId,
          projects: [{ name: 'StaleProject', path: '/stale' }],
        },
      },
    }));
    
    await el.updateComplete;
    
    // Stale response should be ignored
    expect(el.projects).not.toContainEqual(
      expect.objectContaining({ name: 'StaleProject' })
    );
  });

  test('debounces rapid package changes', async () => {
    const postMessageSpy = vi.spyOn(vscode, 'postMessage');
    
    const el = await fixture(html`
      <package-details-panel ?open=${true}></package-details-panel>
    `);
    
    // Rapid package changes
    el.packageData = { id: 'A', version: '1.0.0' };
    await sleep(50);
    el.packageData = { id: 'B', version: '1.0.0' };
    await sleep(50);
    el.packageData = { id: 'C', version: '1.0.0' };
    
    // No fetch should happen yet (within debounce window)
    expect(postMessageSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'getProjects' })
    );
    
    // Wait for debounce to complete
    await sleep(200);
    
    // Only one fetch for final package
    const getProjectsCalls = postMessageSpy.mock.calls.filter(
      call => call[0]?.type === 'getProjects'
    );
    expect(getProjectsCalls).toHaveLength(1);
    expect(getProjectsCalls[0][0].payload.packageId).toBe('C');
  });

  test('shows correct data for final selection after rapid clicks', async () => {
    const el = await fixture(html`
      <package-details-panel ?open=${true}></package-details-panel>
    `);
    
    // Rapid changes
    el.packageData = { id: 'A', version: '1.0.0' };
    el.packageData = { id: 'B', version: '2.0.0' };
    el.packageData = { id: 'C', version: '3.0.0' };
    
    // Wait for debounce
    await sleep(200);
    
    // Get the requestId of the actual request
    const requestId = el.currentProjectsRequestId;
    
    // Respond with correct data
    window.dispatchEvent(new MessageEvent('message', {
      data: {
        type: 'notification',
        name: 'getProjectsResponse',
        args: {
          requestId,
          projects: [{ name: 'FinalProject', path: '/final', installedVersion: '3.0.0' }],
        },
      },
    }));
    
    await el.updateComplete;
    
    expect(el.projects).toContainEqual(
      expect.objectContaining({ name: 'FinalProject', installedVersion: '3.0.0' })
    );
  });

  test('cleans up on disconnect', async () => {
    const el = await fixture(html`
      <package-details-panel
        ?open=${true}
        .packageData=${{ id: 'Test', version: '1.0.0' }}
      ></package-details-panel>
    `);
    
    // Start a fetch
    await sleep(200);
    const requestId = el.currentProjectsRequestId;
    
    // Disconnect
    el.remove();
    
    // Respond after disconnect
    window.dispatchEvent(new MessageEvent('message', {
      data: {
        type: 'notification',
        name: 'getProjectsResponse',
        args: { requestId, projects: [{ name: 'TooLate' }] },
      },
    }));
    
    // Should not crash, projects should not update
    expect(el.projects).toEqual([]);
  });
});
```

---

## Success Criteria

| Metric | Before | After |
|--------|--------|-------|
| Concurrent requests during rapid clicking | 5+ | 1 |
| Stale response race conditions | Common | Zero |
| Log messages per package selection | 5-10 | 1-2 |
| UI flicker during rapid selection | Yes | No |

---

## Dependencies

- **IMPL-PERF-002**: Early fetch provides baseline projects cache

## Blocks

- **IMPL-PERF-005**: Installed status optimization can use same cancellation patterns

---

## Notes

**Why 150ms Debounce?**
- Fast enough that users don't notice delay
- Slow enough to catch rapid clicks (keyboard navigation, accidental double-click)
- Matches common debounce intervals in VS Code (search, type-ahead)

**Why Not Use RxJS?**
- Additional dependency for simple use case
- Native `setTimeout` + AbortController is sufficient
- Keeps webview bundle small

**Alternative: Queue Pattern**
Could implement a request queue that processes one at a time. However, for this use case, "latest wins" (cancel previous) is simpler and matches user intent.

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-01-28 | Implementation plan created | AI Assistant |
