# STORY-001-02-006-install-command

**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Not Started | In Progress | Done  
**Priority**: High  
**Estimate**: 5 Story Points  
**Created**: 2025-11-16  
**Last Updated**: 2025-11-16

## User Story

**As a** developer using the NuGet Package Management extension  
**I want** implement install command handler  
**So that** I can efficiently manage NuGet packages in my VS Code workspace

## Description

This story implements the `opm.installPackage` **internal command** handler that orchestrates the complete package installation workflow from webview action to completion feedback. This is **not a user-facing command**—it is only invoked programmatically by the Package Browser webview and is **not registered in package.json**. Users access installation functionality exclusively through the "Browse NuGet Packages" webview UI.

The install command handler receives package installation requests from the Package Browser webview via IPC messages, validates the input parameters (package ID, version, target project paths), delegates the actual installation to the domain provider, and coordinates UI updates including progress notifications, cache invalidation, and success/error toast messages. It implements the request-response pattern documented in `request-response.md`, providing a clean separation between presentation and business logic.

This command is critical to the installation workflow as it orchestrates the transition from user action (button click in webview) to domain execution (dotnet CLI operations). It must handle both single-project and multi-project installations, provide real-time progress feedback, gracefully handle partial failures, and ensure the UI state (tree view, webview) accurately reflects the installation results. The implementation follows the established command pattern in `src/commands/` and integrates with the LoggerService for detailed operation logging.

## Acceptance Criteria

### Scenario: Install package to single project
**Given** the Package Browser webview is open showing "Newtonsoft.Json" details  
**And** version "13.0.3" is selected in the version dropdown  
**And** one project "MyApp.Web" is checked in the project selection list  
**When** the user clicks the "Install" button  
**Then** the command validates package ID, version, and project path  
**And** delegates installation to the domain provider  
**And** shows VS Code progress notification "Installing Newtonsoft.Json to MyApp.Web..."  
**And** invalidates installed package cache on success  
**And** refreshes the Installed Packages tree view  
**And** sends success response to webview with installation result  
**And** displays success toast "Package installed to 1 project"

### Scenario: Install package to multiple projects
**Given** the Package Browser webview is open showing "Serilog" details  
**And** version "Latest Stable" (resolves to "3.1.1") is selected  
**And** three projects are checked: "MyApp.Api", "MyApp.Core", "MyApp.Tests"  
**When** the user clicks "Install to 3 projects" button  
**Then** the command validates all project paths exist  
**And** executes installations sequentially with per-project progress updates  
**And** shows progress "Installing to MyApp.Api (1/3)...", "Installing to MyApp.Core (2/3)...", etc.  
**And** collects results for all projects (success/failure per project)  
**And** invalidates cache only if at least one installation succeeded  
**And** refreshes tree view on completion  
**And** displays toast "Package installed to 3 projects" or "Package installed to 2 of 3 projects (1 failed)"

### Scenario: Handle installation failure
**Given** the user attempts to install "NonExistent.Package" version "1.0.0"  
**When** the domain provider returns error result with code "PackageNotFound"  
**Then** the command does not invalidate cache  
**And** does not refresh tree view  
**And** sends error response to webview  
**And** displays error toast "Failed to install package: Package 'NonExistent.Package' version '1.0.0' not found"  
**And** provides "View Logs" action linking to OutputChannel with detailed error

### Scenario: Handle partial failure in multi-project install
**Given** the user installs "AutoMapper" to projects ["App.Core", "App.InvalidPath", "App.Tests"]  
**When** installation succeeds for App.Core and App.Tests but fails for App.InvalidPath  
**Then** the command collects individual results for each project  
**And** invalidates cache (since at least one succeeded)  
**And** refreshes tree view to show newly installed packages  
**And** displays warning toast "Package installed to 2 of 3 projects (1 failed)"  
**And** logs detailed per-project results to OutputChannel

### Scenario: User cancels installation in progress
**Given** an installation is running for 5 projects  
**And** the VS Code progress notification shows "Installing to MyApp.Core (2/5)..."  
**When** the user clicks the "Cancel" button in the progress notification  
**Then** the command aborts remaining installations  
**And** preserves already-completed installations (does not rollback)  
**And** invalidates cache for completed installations  
**And** displays info toast "Installation cancelled (2 of 5 projects completed)"

### Additional Criteria
- [ ] Command is registered with ID `opm.installPackage` **only in `extension.ts`** via `registerCommand` (NOT in package.json)
- [ ] Command is **internal-only** and only invoked programmatically by the Package Browser webview
- [ ] Command accepts parameters: `{ packageId: string, version: string, projectPaths: string[] }`
- [ ] Validation rejects empty/undefined package ID or version
- [ ] Validation rejects empty projectPaths array
- [ ] Validation checks that all project paths are .csproj files (existence validated by domain provider)
- [ ] Progress notification is cancellable via CancellationToken
- [ ] Logger writes detailed operation log entry with timestamp, package ID, version, projects, and result
- [ ] Cache invalidation uses pattern `installed:*` to clear all installed package caches
- [ ] Tree view refresh is triggered via `InstalledPackagesProvider.refresh()` method
- [ ] Webview response includes per-project results with `{ projectPath, success, error? }` structure
- [ ] Toast notifications use appropriate severity: info (success), warning (partial), error (total failure)
- [ ] Error messages follow pattern "Failed to install package: [specific reason]"
- [ ] All async operations use proper error handling with try/catch
- [ ] Command is testable with mocked domain provider, logger, and tree view

## Technical Implementation

### Implementation Plan
- [Link to technical implementation document](../technical/IMPL-###-##-###-{implementation-doc}.md)

### Key Components
- **File/Module**: `src/commands/installPackageCommand.ts` - Implementation component

### Technical Approach
[Brief overview of the technical approach or architecture pattern being used]

### API/Integration Points
- [VS Code API method or interface]
- [External API or service]

## Testing Strategy

### Unit Tests
- [ ] Test case 1: Command validates required parameters (package ID, version, projectPaths) and rejects invalid inputs
- [ ] Test case 2: Command invokes domain provider with correct parameters for single-project install
- [ ] Test case 3: Command invokes domain provider sequentially for multi-project install
- [ ] Test case 4: Command invalidates cache on successful installation
- [ ] Test case 5: Command does not invalidate cache on failed installation
- [ ] Test case 6: Command triggers tree view refresh on successful installation
- [ ] Test case 7: Command logs installation start, progress, and completion to LoggerService
- [ ] Test case 8: Command sends correct success response to webview with per-project results
- [ ] Test case 9: Command sends correct error response to webview on failure
- [ ] Test case 10: Command handles cancellation token and aborts remaining installations
- [ ] Test case 11: Command handles partial failures (some projects succeed, some fail)
- [ ] Test case 12: Command rejects installation to non-existent project paths

### Integration Tests
- [ ] Integration scenario 1: End-to-end install flow with real domain provider (mocked CLI) verifies correct parameter passing and result handling
- [ ] Integration scenario 2: Multi-project install with mixed success/failure results produces correct cache invalidation and UI updates
- [ ] Integration scenario 3: Cancelled installation preserves completed installs and reports partial completion accurately

### Manual Testing
- [ ] Manual test 1: Install package to single project from webview, verify progress notification shows, toast appears, tree view updates
- [ ] Manual test 2: Install package to 3+ projects, verify sequential progress updates (1/3, 2/3, 3/3) and final toast shows correct count
- [ ] Manual test 3: Install non-existent package, verify error toast shows with "View Logs" action, OutputChannel contains detailed error
- [ ] Manual test 4: Cancel installation mid-progress (2 of 5 projects), verify partial completion message and tree view shows completed installs
- [ ] Manual test 5: Install to project with invalid path, verify error handling without crashing extension
- [ ] Manual test 6: Install same package to multiple projects where one already has it installed, verify duplicate detection and graceful handling

## Dependencies

### Blocked By
- [STORY-001-02-001a] Solution Discovery & Context Service - Required for validating project paths
- [STORY-001-02-004] Execute dotnet add package Command - Domain provider must implement installPackage method
- [STORY-001-02-005] Parse CLI Install Output - Command relies on domain provider to parse CLI results
- [STORY-001-00-002] LoggerService - Required for operation logging

### Blocks
- [STORY-001-02-007] Handle Multi-Project Install - Depends on basic command handler for single-project installs
- [STORY-001-02-008] Show Install Progress Indicator - Command must expose progress reporting hooks
- [STORY-001-02-009] Display Install Success/Error Toast - Command must trigger toast notifications
- [STORY-001-02-010] Invalidate Installed Package Cache - Command must call cache invalidation on success

### External Dependencies
- VS Code Extension API: `vscode.window.withProgress` for progress notifications
- VS Code Extension API: `vscode.window.showInformationMessage` / `showErrorMessage` for toast notifications
- DomainProviderService: Must expose `installPackage(packageId, version, projectPaths)` method
- InstalledPackagesProvider (tree view): Must expose `refresh()` method for UI updates
- PromiseCache (or equivalent): Must expose `invalidate(pattern)` method for cache clearing

## INVEST Check

- [x] **I**ndependent - Can be developed independently once blocked dependencies are complete
- [x] **N**egotiable - Progress notification style and toast message format can be adjusted based on UX feedback
- [x] **V**aluable - Delivers core user value by enabling package installation through intuitive command
- [x] **E**stimable - Clear scope focused on command orchestration without complex business logic
- [x] **S**mall - Can be completed in one iteration (5 story points, ~2-3 days)
- [x] **T**estable - Has clear acceptance criteria with unit, integration, and E2E test scenarios

## Notes

### Design Decisions

**Command Registration**: The command should be registered in both `package.json` (contributes.commands) and `extension.ts` activation. Since this command is invoked programmatically from the webview (not via Command Palette), the title can be generic: "Install NuGet Package".

**Parameter Validation**: The command must validate inputs defensively since they come from webview IPC messages. Validate package ID format (non-empty, valid NuGet ID pattern), version string (non-empty), and project paths (exist, end with .csproj). Return structured errors to webview for user-friendly messaging.

**Multi-Project Execution**: Execute installations sequentially (not in parallel) to avoid race conditions in NuGet package cache and ensure accurate progress reporting. Use `vscode.window.withProgress` with `location: ProgressLocation.Notification` to show cancellable progress bar.

**Cache Invalidation Strategy**: Invalidate cache using pattern `installed:*` to clear all installed package caches across projects. This ensures tree view and any other installed package queries refresh correctly. Only invalidate on at least one successful installation to avoid unnecessary cache thrashing.

**Error Handling Patterns**: Distinguish between validation errors (bad input), domain errors (dotnet CLI failures), and system errors (file not found). Map domain error codes to user-friendly messages following the pattern "Failed to install package: [specific reason]". Always provide "View Logs" action in error toasts linking to the OutputChannel.

### Edge Cases to Handle

1. **Empty project selection**: Webview should prevent this, but command should validate and reject with error "No projects selected"
2. **Duplicate project paths**: De-duplicate array before processing to avoid installing to same project twice
3. **Already installed package**: Domain provider should handle gracefully (CLI may report "already installed" or silently succeed)
4. **Version "Latest Stable" resolution**: Command should delegate version resolution to domain provider, passing literal string "latest" or resolved version
5. **Network failures**: Domain provider handles retries, command should surface final error with actionable message
6. **License acceptance required**: This is handled by STORY-001-02-011, command should pass through domain provider's license prompt handling

### Questions to Resolve

- Should the command support dry-run mode for validation before actual installation? (Answer: No, keep scope focused. Validation is separate concern.)
- Should partial failures invalidate cache for successful installs? (Answer: Yes, cache invalidation should happen for any successful install.)
- Should the command remember last-selected projects per package for convenience? (Answer: Defer to webview UI state management, not command responsibility.)

### Future Enhancements

- Add telemetry events for install success/failure rates
- Support batch install of multiple packages (different feature)
- Add "Install and Open README" variant that opens package README after install
- Implement optimistic UI updates (show installing state immediately, rollback on failure)

## Changelog

| Date | Change | Author |
|---|---|---|
| 2025-11-16 | Story created | AI Assistant |
| 2026-01-11 | Product details filled out (description, acceptance criteria, testing, dependencies, notes) | AI Assistant |

---
**Story ID**: STORY-001-02-006-install-command  
**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)
