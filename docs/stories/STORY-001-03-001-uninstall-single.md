# STORY-001-03-001-uninstall-single

**Feature**: [FEAT-001-03-manage-packages](../features/FEAT-001-03-manage-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Not Started  
**Priority**: High  
**Estimate**: 2 Story Points  
**Created**: 2026-01-19  
**Last Updated**: 2026-01-19

## User Story

**As a** developer using the NuGet Package Management extension  
**I want** to uninstall a package from a single project through the package details UI  
**So that** I can remove unused or unwanted packages without manually editing .csproj files

## Description

This story implements single-project package uninstallation through the existing package details webview. When viewing a package that is already installed in one or more projects, users can select a project with the package installed and click an "Uninstall" button to remove it. The extension executes `dotnet remove package` and provides real-time feedback on success or failure.

The UI adapts based on installation state: when all selected projects have the package installed, the action button changes from "Install" to "Uninstall". After successful uninstallation, the project list refreshes to show the package is no longer installed, and the button returns to "Install" state.

This story focuses on the single-project happy path to establish the core uninstall command infrastructure. Multi-project uninstall, dependency warnings, and edge cases are handled in subsequent stories.

## Acceptance Criteria

### Scenario: Uninstall Package from Single Project

**Given** I am viewing "Newtonsoft.Json" package details  
**And** the package is installed in "MyApp.Web" project at version 13.0.3  
**When** I select "MyApp.Web" project checkbox  
**Then** the action button shows "Uninstall"  
**And** clicking "Uninstall" executes `dotnet remove MyApp.Web.csproj package Newtonsoft.Json`  
**And** a progress notification shows "Uninstalling Newtonsoft.Json..."  
**And** on success, a toast shows "Package uninstalled from MyApp.Web"  
**And** the project list refreshes showing "MyApp.Web" no longer has the package installed  
**And** the action button changes back to "Install"

### Scenario: Uninstall Button Only Appears for Installed Projects

**Given** I am viewing a package installed in "MyApp.Core" but not in "MyApp.Web"  
**When** I select only "MyApp.Web" project (not installed)  
**Then** the action button shows "Install"  
**When** I select only "MyApp.Core" project (installed)  
**Then** the action button shows "Uninstall"

### Scenario: Uninstall Failure Handling

**Given** I am viewing an installed package  
**When** I click "Uninstall" and the CLI operation fails (e.g., package not found)  
**Then** an error toast shows "Failed to uninstall package from MyApp.Web. View Logs for details."  
**And** clicking "View Logs" opens the OPM output channel with detailed error messages  
**And** the project list still shows the package as installed (state unchanged)

### Additional Criteria

- [ ] Uninstall button uses secondary styling (not primary) to indicate destructive action
- [ ] Progress notification includes cancel button to abort in-progress operation
- [ ] CLI command logs to OutputChannel with full command and output
- [ ] Success uninstall invalidates project metadata cache (triggers refresh)
- [ ] Uninstall command returns structured result: `{ success: boolean, error?: DomainError }`
- [ ] Error result includes actionable error code (NotFound, PermissionDenied, DependencyConflict, etc.)
- [ ] Button disables during uninstall operation to prevent duplicate clicks
- [ ] Package details remain visible during uninstall (no navigation away)

## Technical Implementation

### Implementation Plan

Extend the existing `InstallPackageCommand` infrastructure with a new `UninstallPackageCommand` that mirrors the install pattern but calls `dotnet remove package` instead of `dotnet add package`.

### Key Components

- **File/Module**: `src/commands/uninstallPackageCommand.ts` - New command handler for uninstall operations
- **File/Module**: `src/services/cli/packageCliService.ts` - Add `removePackage(packageId, projectPath)` method
- **File/Module**: `src/webviews/apps/packageBrowser/components/project-selector.ts` - Update button logic to show "Uninstall" when all selected projects have package installed
- **File/Module**: `src/webviews/apps/packageBrowser/types.ts` - Add `UninstallPackageRequest` and `UninstallPackageResponse` IPC message types

### Technical Approach

The uninstall flow follows the same request-response pattern as install:

1. **UI Button State**: The `<project-selector>` component computes button state by checking if all selected projects have the package installed. If true, render "Uninstall" button; otherwise render "Install" button.

2. **IPC Request**: When user clicks "Uninstall", webview sends `{ type: 'uninstallPackageRequest', payload: { packageId, projectPaths } }` to extension host.

3. **Command Execution**: `UninstallPackageCommand` receives request, calls `packageCliService.removePackage()` for the project, which executes `dotnet remove <project> package <packageId>`.

4. **CLI Parsing**: `PackageCliService.removePackage()` captures stdout/stderr, parses exit code and output to determine success/failure, returns `DomainResult<void>`.

5. **Progress Feedback**: Command uses `vscode.window.withProgress()` to show cancellable progress notification.

6. **Cache Invalidation**: On success, command calls `projectParser.clearAllCaches()` to invalidate cached project metadata.

7. **IPC Response**: Command sends response `{ type: 'notification', name: 'uninstallPackageResponse', args: { success, error? } }` back to webview.

8. **IPC Notification**: On success, command sends `projectsChanged` notification to trigger webview project list refresh (reusing existing pattern from STORY-001-02-010).

9. **UI Update**: Webview handles response, shows success/error toast, and refreshes project list to reflect new installation state.

### API/Integration Points

- **CLI Command**: `dotnet remove <PROJECT> package <PACKAGE_ID>`
- **CLI Exit Codes**: 0 = success, non-zero = failure
- **CLI Error Patterns**: "error NU1103: Unable to find package" → `NotFound` error code
- **IPC Messages**: `uninstallPackageRequest`, `uninstallPackageResponse`, `projectsChanged` notification
- **Cache API**: `projectParser.clearAllCaches()` (reuse from install feature)
- **VS Code API**: `vscode.window.withProgress()`, `vscode.window.showInformationMessage()`, `vscode.window.showErrorMessage()`

## Testing Strategy

### Unit Tests

- [ ] Test case 1: `UninstallPackageCommand.execute()` calls `packageCliService.removePackage()` with correct parameters
- [ ] Test case 2: Command returns success result when CLI exit code is 0
- [ ] Test case 3: Command returns error result when CLI exit code is non-zero
- [ ] Test case 4: Command calls `projectParser.clearAllCaches()` after successful uninstall
- [ ] Test case 5: Command does NOT call cache invalidation when uninstall fails
- [ ] Test case 6: `PackageCliService.removePackage()` constructs correct CLI command string
- [ ] Test case 7: CLI service parses "package not found" error and returns `NotFound` error code
- [ ] Test case 8: `<project-selector>` shows "Uninstall" button when all selected projects have package installed
- [ ] Test case 9: `<project-selector>` shows "Install" button when any selected project does not have package installed

### Integration Tests

- [ ] Integration scenario 1: Execute real `dotnet remove package` command against test project, verify package removed from .csproj
- [ ] Integration scenario 2: Attempt to remove non-existent package, verify CLI error is captured and mapped to `NotFound` error
- [ ] Integration scenario 3: Uninstall package, verify cache invalidation triggers, verify next `parseProject()` call returns fresh data without removed package

### Manual Testing

- [ ] Manual test 1: View installed package, select project, verify "Uninstall" button appears
- [ ] Manual test 2: Click uninstall, verify progress notification shows, verify success toast appears
- [ ] Manual test 3: After uninstall, verify project list refreshes and package no longer shows as installed
- [ ] Manual test 4: Verify button changes to "Install" after successful uninstall
- [ ] Manual test 5: Simulate uninstall failure (e.g., make .csproj read-only), verify error toast with "View Logs" action
- [ ] Manual test 6: Click "View Logs", verify OutputChannel shows detailed CLI error

## Dependencies

### Blocked By

- [STORY-001-02-006-install-command](./STORY-001-02-006-install-command.md) - Requires install command infrastructure to mirror
- [STORY-001-02-010-cache-invalidation](./STORY-001-02-010-cache-invalidation.md) - Requires cache invalidation mechanism
- [STORY-001-02-002-project-selection-ui](./STORY-001-02-002-project-selection-ui.md) - Requires project selector component

### Blocks

- [STORY-001-03-002-uninstall-multi](./STORY-001-03-002-uninstall-multi.md) - Multi-project uninstall extends single-project implementation
- [STORY-001-03-006-dependency-warnings](./STORY-001-03-006-dependency-warnings.md) - Dependency warnings hook into uninstall command

### External Dependencies

- dotnet CLI available on system PATH
- Workspace trust enabled for CLI execution

## INVEST Check

- [x] **I**ndependent - Can be developed independently (reuses existing install infrastructure)
- [x] **N**egotiable - Details can be adjusted (button styling, toast messages are flexible)
- [x] **V**aluable - Delivers value to users (core package management operation)
- [x] **E**stimable - Can be estimated (2 story points - similar to install command story)
- [x] **S**mall - Can be completed in one iteration (focused on single-project happy path)
- [x] **T**estable - Has clear acceptance criteria (unit, integration, and manual tests defined)

## Notes

**Design Decision: Uninstall vs. Remove Terminology**
We use "Uninstall" in the UI to match NuGet Package Manager and Visual Studio conventions, even though the CLI command is `dotnet remove package`. This provides consistency with user expectations from other package management tools.

**Button State Logic**
The button shows "Uninstall" only when ALL selected projects have the package installed. If even one selected project doesn't have the package, the button shows "Install" (to add to missing projects). This prevents ambiguous mixed-state operations in the single-button UI.

Mixed selections (some installed, some not) are handled in a later story with more sophisticated UI guidance.

**Reuse Install Infrastructure**
This story heavily reuses patterns from install: same IPC protocol, same progress notifications, same cache invalidation, same error handling. The primary difference is calling `dotnet remove` instead of `dotnet add` and inverting the button visibility logic.

**Future Enhancement: Confirmation Prompt**
A later story may add an optional confirmation dialog for uninstall operations (configurable via settings). This story implements the core uninstall flow without confirmation to establish the baseline behavior.

## Changelog

| Date       | Change                                                              | Author       |
| ---------- | ------------------------------------------------------------------- | ------------ |
| 2026-01-19 | Story created with acceptance criteria and technical implementation | AI Assistant |

---

**Story ID**: STORY-001-03-001-uninstall-single  
**Feature**: [FEAT-001-03-manage-packages](../features/FEAT-001-03-manage-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)
