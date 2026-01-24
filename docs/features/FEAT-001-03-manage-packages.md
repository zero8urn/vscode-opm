# FEAT-001-03-manage-packages

**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Not Started  
**Progress**: 0/7 stories completed (0%)  
**Created**: 2026-01-19  
**Last Updated**: 2026-01-19

## Description

This feature enables developers to manage the complete lifecycle of installed NuGet packages through intuitive UI controls that support uninstalling, updating, and downgrading packages across one or more projects. Users can select installed packages from the package details view, choose target projects via checkboxes, and execute management operations with clear visual feedback on success or failure.

The implementation extends the existing package details UI (from FEAT-001-02) with enhanced project selection controls that show installed package states with version indicators (✓ installed, ↑ upgrade available, ↓ downgrade available). When users select a different version than what's currently installed, the UI dynamically transforms to show appropriate actions: **Update** for newer versions, **Downgrade** for older versions, and **Uninstall** when removing packages entirely.

This feature leverages the same `dotnet remove package` and `dotnet add package` CLI commands used in the install workflow, ensuring consistency with .NET SDK tooling. The domain layer abstracts CLI execution, allowing the command layer to orchestrate multi-project operations with per-project result tracking and proper error handling.

The management experience prioritizes safety and transparency, showing users exactly which projects will be affected, what versions will be installed/removed, and providing confirmation prompts for potentially destructive operations (especially uninstall). Multi-project operations execute sequentially with real-time progress updates and consolidated result reporting.

## User Stories

| ID               | Story                                    | Status      | Link                                                        |
| ---------------- | ---------------------------------------- | ----------- | ----------------------------------------------------------- |
| STORY-001-03-001 | Uninstall Package from Single Project    | Not Started | [Link](../stories/STORY-001-03-001-uninstall-single.md)     |
| STORY-001-03-002 | Uninstall Package from Multiple Projects | Not Started | [Link](../stories/STORY-001-03-002-uninstall-multi.md)      |
| STORY-001-03-003 | Update Package to Newer Version          | Not Started | [Link](../stories/STORY-001-03-003-update-package.md)       |
| STORY-001-03-004 | Downgrade Package to Older Version       | Not Started | [Link](../stories/STORY-001-03-004-downgrade-package.md)    |
| STORY-001-03-005 | Show Update Indicators in Details Pane   | Not Started | [Link](../stories/STORY-001-03-005-update-indicators.md)    |
| STORY-001-03-006 | Handle Dependency Warnings on Uninstall  | Not Started | [Link](../stories/STORY-001-03-006-dependency-warnings.md)  |
| STORY-001-03-007 | Multi-Project Update/Downgrade           | Not Started | [Link](../stories/STORY-001-03-007-multi-project-update.md) |

## Acceptance Criteria

### Functional Requirements

- [ ] Users can uninstall packages from one or more projects via checkbox selection
- [ ] Uninstall button appears in project selector when all selected projects have the package installed
- [ ] Update button appears when selected version is newer than installed version
- [ ] Downgrade button appears when selected version is older than installed version
- [ ] Version indicators (↑ upgrade, ↓ downgrade) show next to installed versions in project list
- [ ] `dotnet remove package` command executes with correct package ID and project path
- [ ] `dotnet add package` command executes for update/downgrade with new version
- [ ] CLI stdout/stderr is parsed to extract success/failure status for each operation
- [ ] Multi-project operations execute sequentially with per-project result tracking
- [ ] VS Code progress notification shows current operation with cancel button
- [ ] Success toast shows "Package uninstalled from X projects" or "Package updated in X projects"
- [ ] Error toast shows detailed failure reason with "View Logs" action
- [ ] Installed package cache is invalidated after successful operations
- [ ] Dependency warnings are shown when uninstalling packages with dependents
- [ ] Confirmation prompt appears before destructive uninstall operations (configurable)

### Non-Functional Requirements

- [ ] Performance: Single-project uninstall completes in <5s (excluding package restore)
- [ ] Performance: Multi-project operations show progress within 500ms of starting
- [ ] UX: Button labels update dynamically based on selection and version state
- [ ] UX: Users can cancel in-progress operations without corrupting project files
- [ ] Accessibility: All buttons support keyboard navigation and screen reader announcements
- [ ] Error Handling: Partial failures in multi-project operations report per-project status
- [ ] Error Handling: Dependency conflicts provide actionable guidance on resolution

### Definition of Done

- [ ] All 7 user stories completed and tested
- [ ] Unit tests written for uninstall/update command handlers (>80% coverage)
- [ ] Integration tests validate dotnet CLI integration for remove/update operations
- [ ] E2E tests cover single-project, multi-project, and error scenarios
- [ ] Documentation updated with package management workflows
- [ ] Code reviewed for error handling and state management edge cases
- [ ] Manually tested with .NET 6, 7, and 8 projects on Windows, macOS, and Linux

## Best Practices & Recommendations

### Industry Standards

- Always validate package dependencies before uninstalling to prevent broken references
- Provide clear visual feedback for destructive operations (uninstall)
- Show version comparison indicators to help users understand upgrade/downgrade impact
- Preserve user selections when switching between install/update/uninstall modes
- Use confirmation dialogs for batch uninstall operations affecting multiple projects

### VS Code Extension Guidelines

- Use `vscode.window.withProgress` for cancellable uninstall/update operations
- Show warning messages for dependency conflicts, error for uninstall failures
- Provide "View Logs" action in all error notifications
- Use consistent button styling: primary for install/update, secondary for uninstall
- Respect workspace trust settings for all CLI operations

### Technical Considerations

- `dotnet remove package` syntax: `dotnet remove <PROJECT> package <PACKAGE_ID>`
- CLI returns exit code 0 for success, non-zero for failures
- Uninstall may fail if other packages depend on the target package
- Update/downgrade uses same `dotnet add package --version` command as install
- Version indicators compare selected version to installed version per project
- Project selector should remember selection state when switching versions
- Handle edge case: package installed in some projects, user selects uninstalled projects (show install button)
- Handle edge case: mixed selection (some installed, some not) → disable all action buttons, show guidance

## Supporting Documentation

### Technical Implementation

- [Install to Projects UI](../discovery/install-to-projects-ui.md) - UI design patterns for project selection
- [Package Management Discovery](../discovery/package-management.md) - Feature breakdown and terminology

### API References

- [dotnet remove package](https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-remove-package)
- [dotnet add package](https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-add-package)
- [VS Code Progress API](https://code.visualstudio.com/api/references/vscode-api#Progress)

### Related Features

- [FEAT-001-02-install-packages](./FEAT-001-02-install-packages.md) - Provides project selection UI and CLI execution infrastructure
- [FEAT-001-01-browse-search](./FEAT-001-01-browse-search.md) - Provides package metadata and version information

## Dependencies

### Technical Dependencies

- .NET SDK 6.0+ installed on user's machine
- dotnet CLI available on system PATH
- Workspace with at least one .csproj using PackageReference format
- LoggerService (from FEAT-001-00-002) for operation logging
- Project parser (from FEAT-001-02-001b) for installed package detection

### Feature Dependencies

- Blocked by FEAT-001-02-install-packages (project selection UI, CLI executor, cache invalidation)
- Blocks future "Consolidate Packages" feature which requires update/downgrade capabilities

## Risks & Mitigations

| Risk                                           | Impact | Likelihood | Mitigation                                                                             |
| ---------------------------------------------- | ------ | ---------- | -------------------------------------------------------------------------------------- |
| Uninstalling package breaks dependent packages | High   | Medium     | Detect dependencies before uninstall, show warning with list of affected packages      |
| User uninstalls critical SDK packages          | High   | Low        | Detect implicit/SDK packages, show prominent warning, require explicit confirmation    |
| Multi-project uninstall timeout (>5min)        | Medium | Low        | Execute in background with cancel button, show per-project progress                    |
| Version downgrade causes runtime errors        | Medium | High       | Show clear downgrade indicator (↓), warn about potential compatibility issues          |
| Mixed selection state confuses users           | Medium | Medium     | Disable action buttons when selection includes both installed and uninstalled projects |
| Cache invalidation doesn't refresh UI          | Medium | Low        | Reuse existing cache invalidation from FEAT-001-02-010, test thoroughly                |

## Notes

This feature completes the core package lifecycle management workflow: **Install → Update → Downgrade → Uninstall**. Users should be able to manage packages entirely through the extension UI without manually editing .csproj files.

The UI dynamically adapts based on installation state and version selection:

- **Not installed** → Show Install button
- **Installed (same version)** → Show Uninstall button
- **Installed (older version)** → Show Update button + version indicator ↑
- **Installed (newer version)** → Show Downgrade button + version indicator ↓

Multi-project selections follow the same sequential execution pattern as install operations to avoid race conditions and ensure accurate progress reporting.

Dependency detection is critical for uninstall safety. The implementation should parse CLI error output for dependency conflicts and present them in a user-friendly format with actionable guidance (e.g., "Remove dependent packages first: PackageA, PackageB").

Consider implementing a "Dry Run" mode that shows what would happen without executing the operation, especially useful for complex multi-project uninstalls.

Future enhancement: Add "Uninstall Unused Dependencies" feature that analyzes projects and removes packages no longer referenced by code.

---

**Feature ID**: FEAT-001-03-manage-packages  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)
