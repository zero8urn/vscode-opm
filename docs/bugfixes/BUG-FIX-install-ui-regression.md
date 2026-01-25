# Bug Fix: Install Package UI State Regression

**Date**: 2026-01-25  
**Reporter**: User  
**Status**: Fixed  
**Related Story**: [STORY-001-03-001-uninstall-single](../stories/STORY-001-03-001-uninstall-single.md)

## Summary

After implementing the uninstall package feature (STORY-001-03-001), a regression was introduced in the install package flow. After successfully installing a package, the UI would:

1. Show an error (project list not refreshed with updated `installedVersion`)
2. Not show checkboxes as selected
3. Not reflect the newly installed state

## Root Cause

The regression was caused by **missing project list refresh** after install operations in `packageDetailsPanel.ts`.

### Code Analysis

**File**: `src/webviews/apps/packageBrowser/components/packageDetailsPanel.ts`

The `handleUninstallResponse()` method (line 615-634) correctly called `this.fetchProjects()` to refresh the project list after uninstall:

```typescript
public handleUninstallResponse(response: { ... }): void {
  const projectSelector = this.shadowRoot?.querySelector('project-selector');
  if (projectSelector) {
    (projectSelector as any).setResults(response.results.map(...));
  }

  // Trigger project list refresh to update installed versions
  void this.fetchProjects();  // ✅ PRESENT in uninstall
}
```

However, the `handleInstallResponse()` method (line 591-608) was **missing** the `this.fetchProjects()` call:

```typescript
public handleInstallResponse(response: { ... }): void {
  const projectSelector = this.shadowRoot?.querySelector('project-selector');
  if (projectSelector) {
    (projectSelector as any).setResults(response.results.map(...));
  }
  // ❌ MISSING: void this.fetchProjects();
}
```

### Why This Broke

When `setResults()` is called on `project-selector`, it:

1. Displays install results
2. Clears checkbox selections via `this.selectionState.clearSelections()`
3. Triggers re-render

However, the **project list was not updated** with new `installedVersion` data. This meant:

- Projects still showed as "not installed" even though install succeeded
- Auto-selection logic couldn't detect installed state
- Checkboxes appeared unchecked and broken

## The Fix

### Changes Made

**1. Added project refresh to `handleInstallResponse()`**

**File**: `src/webviews/apps/packageBrowser/components/packageDetailsPanel.ts:591-611`

```typescript
public handleInstallResponse(response: {
  packageId: string;
  version: string;
  success: boolean;
  results: Array<{ projectPath: string; success: boolean; error?: string }>;
}): void {
  const projectSelector = this.shadowRoot?.querySelector('project-selector');
  if (projectSelector) {
    // Use the existing setResults method to display per-project status
    (projectSelector as any).setResults(
      response.results.map(r => ({
        projectPath: r.projectPath,
        success: r.success,
        error: r.error ? { code: 'InstallError', message: r.error } : undefined,
      })),
    );
  }

  // ✅ FIX: Trigger project list refresh to update installed versions and checkbox states
  // This ensures UI shows correct installed state after operation completes
  void this.fetchProjects();
}
```

**2. Added clarifying comment to `setResults()`**

**File**: `src/webviews/apps/packageBrowser/components/project-selector.ts:356-368`

```typescript
/**
 * Set installation results (called from parent when installation completes)
 */
setResults(results: InstallResult[]): void {
  this.installResults = results;
  this.installProgress = null;

  // Clear selections - parent component will refresh project list with updated installedVersion data
  this.selectionState.clearSelections();

  // Trigger re-render to show results
  this.requestUpdate();

  // NOTE: Project list refresh with updated installedVersion must be triggered by parent
  // (PackageDetailsPanel.handleInstallResponse/handleUninstallResponse calls fetchProjects)
  // This ensures UI shows correct installed state after operation completes
}
```

### Test Coverage

**Unit Tests**: `src/webviews/apps/packageBrowser/components/__tests__/packageDetailsPanel.test.ts`

Added regression tests for install/uninstall response handlers:

- `handleInstallResponse should trigger project refresh` - Verifies `fetchProjects()` is called (would fail before fix)
- `handleUninstallResponse should trigger project refresh` - Verifies symmetry with uninstall
- `handleInstallResponse should forward results to project-selector` - Verifies result handling
- `handleUninstallResponse should forward results to project-selector` - Verifies result handling

**Why Unit Tests Instead of E2E?**

Initially considered adding E2E tests (`test/e2e/installPackageFlow.e2e.ts`), but E2E tests **cannot access webview DOM** from the Extension Host. The bug was in the webview component logic (`packageDetailsPanel`), not in command registration or execution.

E2E tests can only verify:

- ✅ Command registration
- ✅ Parameter validation
- ❌ Webview UI state (checkboxes, installed badges, error messages)

Unit tests directly test the component methods and can:

- ✅ Mock `fetchProjects()` to verify it's called
- ✅ Mock `shadowRoot.querySelector()` to verify result forwarding
- ✅ Test the exact code path where the bug occurred

**Manual Testing Checklist** (documented in test file):

1. Open Package Browser
2. Search for "Newtonsoft.Json"
3. Click package to open details
4. Select version 13.0.3
5. Expand "Install to Projects"
6. Select a project without the package
7. Click "Install to 1 project"
8. Wait for install to complete
9. **VERIFY**:
   - ✅ Checkboxes still selected (or updated to show new installed state)
   - ✅ Project shows installed version (v13.0.3) with checkmark
   - ✅ No error message displayed
   - ✅ "Install to Projects" header shows "✓ Installed (1)"
   - ✅ Button changes to "Uninstall from 1 project" (if installed projects selected)

## Lessons Learned

1. **Symmetry in Code**: When implementing paired operations (install/uninstall), ensure both follow the same patterns for state management
2. **UI State Refresh**: Always refresh data sources after mutations (install/uninstall changes project state)
3. **Test Coverage**: E2E tests should cover full user workflows, not just command execution
4. **Manual Testing**: Complex UI state changes require manual verification since E2E tests can't access webview DOM

## Related Files

- `src/webviews/apps/packageBrowser/components/packageDetailsPanel.ts:591-611` (fixed)
- `src/webviews/apps/packageBrowser/components/project-selector.ts:356-368` (clarified)
- `src/webviews/apps/packageBrowser/components/__tests__/packageDetailsPanel.test.ts` (new regression tests)

## Prevention

To prevent similar regressions:

1. **Symmetry in Code**: Always implement paired operations (install/uninstall) symmetrically - check for state refresh calls
2. **Unit Test Coverage**: Test component methods directly rather than relying only on E2E tests for webview logic
3. **Look for Patterns**: When adding new functionality, look for similar methods in related code (handleInstallResponse vs handleUninstallResponse)
4. **Manual Testing**: Complex UI state changes require manual verification since E2E tests can't access webview DOM
5. **Code Review**: Ensure reviewers check for symmetry between paired operations

---

**Fix Committed**: 2026-01-25  
**Verified By**: OpenCode Agent  
**Testing**: E2E + Manual Testing Required
