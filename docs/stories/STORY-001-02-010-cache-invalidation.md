# STORY-001-02-010-cache-invalidation

**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Not Started  
**Priority**: Medium  
**Estimate**: 1 Story Points  
**Created**: 2025-11-16  
**Last Updated**: 2026-01-11

## User Story

**As a** developer using the NuGet Package Management extension  
**I want** the UI to automatically refresh and show updated installation state after installing packages  
**So that** I can immediately see which projects now have the package installed without manually reloading the view

## Description

This story implements the cache invalidation and UI refresh mechanism that updates the package browser webview and installed packages tree view after successful package installation operations. When a user installs a package to one or more projects, the extension must invalidate cached project metadata, trigger a refresh of the project list, and update the UI to reflect the new installation state.

The implementation follows the request-response flow documented in `request-response.md`, where the install command invalidates the project metadata cache (`invalidate('installed:*')`) and sends an IPC notification to the webview to refresh its project list. This ensures the UI accurately reflects which projects have the package installed, transforming checkboxes into ✓ icons with installed version labels and updating the "✓ Installed (X)" badge count.

This story is critical for maintaining UI consistency and providing immediate visual feedback to users after package operations. Without cache invalidation, users would see stale data showing packages as "not installed" even after successful installation, creating confusion and requiring manual view refreshes. The implementation coordinates between the domain layer's project parser cache (which stores parsed .csproj metadata), the webview's project list state, and the tree view's installed packages representation.

The cache invalidation strategy uses selective invalidation patterns: invalidate only project-related caches (`installed:*`) while preserving search and package details caches that remain valid. This balances freshness with performance, avoiding unnecessary re-fetching of NuGet API data that hasn't changed.

## Acceptance Criteria

### Scenario: Refresh UI After Single-Project Installation
**Given** I have installed "Newtonsoft.Json v13.0.3" to "MyApp.Web" project  
**When** the installation completes successfully  
**Then** the project list refreshes automatically, "MyApp.Web" shows ✓ icon with "v13.0.3", the checkbox is removed, and the header shows "✓ Installed (1)"

### Scenario: Refresh UI After Multi-Project Installation
**Given** I have selected and installed "Newtonsoft.Json v13.0.3" to 3 projects  
**When** all installations complete successfully  
**Then** the project list refreshes automatically, all 3 projects show ✓ icons with "v13.0.3", their checkboxes are removed, and the header shows "✓ Installed (3)"

### Scenario: Handle Partial Installation Failure
**Given** I have installed a package to 3 projects and 1 installation fails  
**When** the operation completes  
**Then** the project list refreshes, 2 projects show ✓ icons with installed versions, 1 project shows ❌ error icon, and the header shows "✓ Installed (2)"

### Scenario: Invalidate Cache Without Refreshing Webview
**Given** the package browser webview is closed  
**When** I install a package via a tree view command  
**Then** the project metadata cache is invalidated, the tree view refreshes to show the new package, and the next time I open the browser webview it shows current installation state

### Scenario: Preserve Search and Details Caches
**Given** I have search results cached for "Newtonsoft" and package details cached for "Newtonsoft.Json"  
**When** I install "Newtonsoft.Json" to a project  
**Then** only the project metadata cache is invalidated, search and details caches remain valid, and re-opening package details doesn't trigger an API call

### Additional Criteria
- [ ] Project metadata cache is invalidated immediately after successful `dotnet add package` execution
- [ ] IPC notification `projectsChanged` is sent to webview after cache invalidation
- [ ] Webview responds to `projectsChanged` notification by re-requesting project list via `getProjects` IPC call
- [ ] Webview updates UI state transforming checkboxes to ✓ icons for newly installed packages
- [ ] "✓ Installed (X)" badge count updates based on fresh project metadata
- [ ] Installed packages tree view receives `refresh()` call to update tree nodes
- [ ] Cache invalidation uses selective pattern `invalidate('installed:*')` to preserve search/details caches
- [ ] File watcher integration detects external .csproj changes and invalidates cache
- [ ] Multi-project installations trigger single cache invalidation after all operations complete (not per-project)
- [ ] Failed installations do not invalidate cache (preserve current state)
- [ ] Cache invalidation works correctly when webview is not visible/active
- [ ] No race conditions between concurrent install operations and cache invalidation

## Technical Implementation

### Implementation Plan
The implementation extends the existing `DotnetProjectParser` cache with invalidation hooks and adds IPC notification handlers in the webview and install command.

### Key Components
- **File/Module**: `src/services/cli/dotnetProjectParser.ts` - Add `invalidateCache(pattern: string)` method to existing cache implementation
- **File/Module**: `src/commands/installPackageCommand.ts` - Call cache invalidation after successful install, send IPC notification
- **File/Module**: `src/webviews/apps/package-browser/state/project-state.ts` - Handle `projectsChanged` IPC notification and refresh project list
- **File/Module**: `src/views/installedPackagesTreeView.ts` - Subscribe to cache invalidation events and refresh tree nodes

### Technical Approach

The cache invalidation mechanism uses an event-driven pattern coordinated by the install command handler. After all `dotnet add package` operations complete successfully, the command calls `projectParser.invalidateCache('installed:*')` which clears all cached `ProjectMetadata` entries. The command then sends an IPC notification `{ type: 'notification', name: 'projectsChanged' }` to active webviews.

The webview's project state manager listens for `projectsChanged` notifications and responds by re-requesting project metadata via `request('getProjects', { workspacePath })`. Since the cache is now invalidated, the project parser re-executes `dotnet list package` to fetch fresh package references, returning updated `ProjectMetadata[]` with the newly installed packages.

The webview's `<project-selector>` component receives the updated project list and re-renders, comparing the new installation state to its current selection state. Projects that now have the package installed are transformed from checkbox rows to installed rows with ✓ icons and version labels.

For the installed packages tree view, the command calls `treeView.refresh()` which triggers `getChildren()` re-execution, fetching fresh data from the now-invalidated cache.

File watcher integration (already implemented in `dotnetProjectParser`) automatically invalidates cache when .csproj files change externally, ensuring consistency even when packages are installed via dotnet CLI outside the extension.

### API/Integration Points
- **Cache API**: `DotnetProjectParser.invalidateCache(pattern: string)` - Clears cached entries matching glob pattern
- **IPC Notification**: `notification('projectsChanged', {})` - Signals webview to refresh project list
- **IPC Request**: `request('getProjects', { workspacePath })` - Webview fetches fresh project metadata
- **VS Code API**: `TreeView.refresh()` - Triggers installed packages tree view refresh
- **File Watcher**: `FileSystemWatcher.onDidChange` - Auto-invalidates cache on .csproj changes

## Testing Strategy

### Unit Tests
- [ ] Test case 1: `invalidateCache('installed:*')` removes all cached `ProjectMetadata` entries matching pattern
- [ ] Test case 2: `invalidateCache('installed:*')` does not affect search or details cache entries
- [ ] Test case 3: Install command calls `invalidateCache` after successful multi-project install
- [ ] Test case 4: Install command does NOT call `invalidateCache` when all installations fail
- [ ] Test case 5: Install command sends `projectsChanged` IPC notification after cache invalidation
- [ ] Test case 6: Webview state manager handles `projectsChanged` notification and calls `getProjects`
- [ ] Test case 7: `<project-selector>` component transforms checkboxes to ✓ icons when project list updates with installed packages
- [ ] Test case 8: "✓ Installed (X)" badge count updates correctly when project list refreshes with new installations

### Integration Tests
- [ ] Integration scenario 1: Install package, verify cache invalidation triggers, verify re-parsing .csproj returns updated PackageReference list
- [ ] Integration scenario 2: Install package with webview closed, verify cache invalidates and tree view refreshes
- [ ] Integration scenario 3: Install package to 3 projects, verify single cache invalidation after all complete (not per-project)
- [ ] Integration scenario 4: Modify .csproj externally, verify file watcher invalidates cache and UI refreshes on next getProjects

### Manual Testing
- [ ] Manual test 1: Install package to 1 project, verify checkbox → ✓ icon transition happens immediately without manual refresh
- [ ] Manual test 2: Install package to 3 projects, verify all 3 transform to installed state and badge shows "✓ Installed (3)"
- [ ] Manual test 3: Install package with 1 failure, verify successful projects show ✓ icons, failed project shows ❌ error
- [ ] Manual test 4: Install package, close and re-open webview, verify installed state persists (cache was invalidated and fresh data loads)
- [ ] Manual test 5: Install package via dotnet CLI in terminal, verify webview auto-refreshes when .csproj changes detected
- [ ] Manual test 6: Rapidly install multiple different packages, verify no race conditions cause stale cache data to appear

## Dependencies

### Blocked By
- [STORY-001-02-001b-cli-project-parsing](./STORY-001-02-001b-cli-project-parsing.md) - Requires `DotnetProjectParser` with cache implementation
- [STORY-001-02-006-install-command](./STORY-001-02-006-install-command.md) - Requires install command to trigger invalidation
- [STORY-001-02-002-project-selection-ui](./STORY-001-02-002-project-selection-ui.md) - Requires webview UI to refresh after invalidation

### Blocks
- None - This story completes the install workflow end-to-end

### External Dependencies
- File system watcher API for detecting .csproj changes
- IPC protocol for webview-host communication

## INVEST Check

- [x] **I**ndependent - Can be developed independently (extends existing cache and IPC infrastructure)
- [x] **N**egotiable - Details can be adjusted (invalidation pattern, notification timing are flexible)
- [x] **V**aluable - Delivers value to users (critical for UI consistency after package operations)
- [x] **E**stimable - Can be estimated (1 story point - straightforward cache coordination)
- [x] **S**mall - Can be completed in one iteration (focused on invalidation and refresh hooks)
- [x] **T**estable - Has clear acceptance criteria (unit tests for cache, integration tests for refresh flow, manual tests for UI transitions)

## Notes

**Why Selective Invalidation?**  
Using pattern-based invalidation (`invalidate('installed:*')`) preserves search and package details caches that remain valid after installation. This avoids unnecessary re-fetching of NuGet API data, maintaining performance while ensuring project metadata freshness.

**Why Single Invalidation After Multi-Project Install?**  
Invalidating once after all projects complete (rather than per-project) reduces thrashing and ensures the webview receives a single `projectsChanged` notification triggering one refresh cycle instead of multiple.

**Race Condition Mitigation**  
If two concurrent install operations execute, both will invalidate the cache, but this is safe since cache invalidation is idempotent. The webview will receive multiple `projectsChanged` notifications but de-duplicates via debouncing (300ms) to trigger only one refresh.

**File Watcher Edge Case**  
If the user installs a package via the extension and also manually edits .csproj in parallel, the file watcher may trigger redundant invalidation. This is acceptable since invalidation is cheap (clears in-memory Map entries) and ensures consistency.

**Alternative Approach Considered: Push Updates**  
Instead of full cache invalidation + re-fetch, considered pushing delta updates (just the newly installed packages) to the webview. Rejected due to complexity of merging partial state and risk of inconsistency. Full refresh is simpler and more robust.

**Future Enhancement: Optimistic UI Updates**  
Currently the UI waits for cache invalidation + re-fetch to update. Future optimization could show optimistic updates (transform checkbox → ✓ icon immediately) then reconcile with fresh data. This would reduce perceived latency but adds complexity for error rollback.

## Changelog

| Date | Change | Author |
|---|---|---|
| 2026-01-11 | Story detailed with acceptance criteria, technical implementation, and testing strategy | AI Assistant |
| 2025-11-16 | Story created | AI Assistant |

---
**Story ID**: STORY-001-02-010-cache-invalidation  
**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)
