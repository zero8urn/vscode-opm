# FEAT-001-02-install-packages

**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Not Started  
**Progress**: 0/12 stories completed (0%)  
**Created**: 2025-11-16  
**Last Updated**: 2025-11-16

## Description

This feature enables developers to install NuGet packages to one or more .NET projects through an intuitive project selection interface with version targeting and compatibility validation. Users can select specific package versions, choose target projects via checkboxes, monitor installation progress, and receive detailed feedback on success or failure for each project.

The implementation leverages the `dotnet add package` CLI command for all package installations, ensuring full compatibility with .NET SDK tooling and project file management. The domain layer abstracts project discovery and CLI execution, allowing the command layer to orchestrate multi-project installations with per-project result tracking.

This feature is tightly integrated with the Browse & Search feature (FEAT-001-01), consuming package metadata from the NuGet API to populate version selectors and validate framework compatibility before installation. The workflow follows the request-response pattern documented in `request-response.md`, with proper error handling, progress indicators, and cache invalidation.

The installation experience prioritizes transparency and control, giving developers full visibility into which projects will be affected, what version will be installed, and whether any compatibility warnings exist. Multi-project installations are executed sequentially with per-project progress updates and consolidated result reporting.

## User Stories

| ID | Story | Status | Link |
|---|---|---|---|
| STORY-001-02-001 | Implement Project Discovery | Not Started | [Link](../stories/STORY-001-02-001-project-discovery.md) |
| STORY-001-02-002 | Create Project Selection UI | Not Started | [Link](../stories/STORY-001-02-002-project-selection-ui.md) |
| STORY-001-02-003 | Implement Version Selector Dropdown | Not Started | [Link](../stories/STORY-001-02-003-version-selector.md) |
| STORY-001-02-004 | Execute dotnet add package Command | Not Started | [Link](../stories/STORY-001-02-004-dotnet-add-package.md) |
| STORY-001-02-005 | Parse CLI Install Output | Not Started | [Link](../stories/STORY-001-02-005-cli-output-parser.md) |
| STORY-001-02-006 | Implement Install Command Handler | Not Started | [Link](../stories/STORY-001-02-006-install-command.md) |
| STORY-001-02-007 | Handle Multi-Project Install | Not Started | [Link](../stories/STORY-001-02-007-multi-project-install.md) |
| STORY-001-02-008 | Show Install Progress Indicator | Not Started | [Link](../stories/STORY-001-02-008-install-progress.md) |
| STORY-001-02-009 | Display Install Success/Error Toast | Not Started | [Link](../stories/STORY-001-02-009-install-toast.md) |
| STORY-001-02-010 | Invalidate Installed Package Cache | Not Started | [Link](../stories/STORY-001-02-010-cache-invalidation.md) |
| STORY-001-02-011 | Handle License Acceptance Prompt | Not Started | [Link](../stories/STORY-001-02-011-license-acceptance.md) |
| STORY-001-02-012 | Validate Framework Compatibility | Not Started | [Link](../stories/STORY-001-02-012-framework-validation.md) |

## Acceptance Criteria

### Functional Requirements
- [ ] Extension discovers all .csproj files in workspace using PackageReference format
- [ ] Users can select one or more target projects via checkbox UI
- [ ] Version selector dropdown shows all available versions (latest stable, latest prerelease, specific versions)
- [ ] `dotnet add package` command executes with correct package ID, version, and project path
- [ ] CLI stdout/stderr is parsed to extract success/failure status and error messages
- [ ] Install command orchestrates project selection, version resolution, and CLI execution
- [ ] Multi-project installations execute sequentially with per-project result tracking
- [ ] VS Code progress notification shows current project being installed with cancel button
- [ ] Success toast shows "Package installed to X projects" with package icon and version
- [ ] Error toast shows detailed failure reason with "View Logs" action linking to OutputChannel
- [ ] Installed package cache is invalidated on successful install to trigger tree view refresh
- [ ] License acceptance requirements are detected from CLI output and prompt user for confirmation
- [ ] Framework compatibility validation warns users before installing incompatible packages

### Non-Functional Requirements
- [ ] Performance: Project discovery completes in <500ms for workspaces with <100 projects
- [ ] Performance: Single-project install completes in <10s (excluding package download time)
- [ ] UX: Progress indicator shows real-time status (e.g., "Installing to MyApp.csproj (2/5)...")
- [ ] UX: Users can cancel in-progress installations without corrupting project files
- [ ] Accessibility: Project selection UI supports keyboard navigation and screen reader announcements
- [ ] Error Handling: Partial failures in multi-project installs report per-project status
- [ ] Error Handling: Network failures during package restore provide actionable retry guidance

### Definition of Done
- [ ] All 12 user stories completed and tested
- [ ] Unit tests written for project parser, CLI executor, and install orchestrator (>80% coverage)
- [ ] Integration tests validate dotnet CLI integration with mock projects
- [ ] E2E tests cover single-project, multi-project, failure, and cancellation scenarios
- [ ] Documentation updated with install workflow and troubleshooting guide
- [ ] Code reviewed for error handling and progress reporting edge cases
- [ ] Manually tested with .NET 6, 7, and 8 projects on Windows, macOS, and Linux

## Best Practices & Recommendations

### Industry Standards
- Always validate package-to-framework compatibility before installation
- Provide transparent progress feedback for long-running operations
- Handle partial failures gracefully in batch operations
- Never leave project files in corrupted state after failed installs
- Prompt for license acceptance when required by package authors

### VS Code Extension Guidelines
- Use `vscode.window.withProgress` for cancellable install operations
- Show information messages for success, warning for compatibility issues, error for failures
- Provide "View Logs" action in error notifications linking to OutputChannel
- Respect workspace trust settings (require trust for dotnet CLI execution)
- Use `vscode.workspace.fs` for file system operations to support virtual file systems

### Technical Considerations
- `dotnet add package` syntax: `dotnet add <PROJECT> package <PACKAGE_ID> --version <VERSION>`
- CLI returns exit code 0 for success, non-zero for failures
- License acceptance output: "This package requires you to accept a license agreement"
- Framework compatibility: Parse `<TargetFramework>` from .csproj, compare to package `lib/` folder
- Project discovery should exclude `bin/`, `obj/`, `node_modules/` directories
- Handle SDK-style projects (.NET Core 3.1+) with PackageReference, ignore packages.config
- Parse CLI stderr for detailed error messages (e.g., version not found, network failures)

## Supporting Documentation

### Technical Implementation
- [Request-Response Flow](../discovery/request-response.md) - Install package workflow sequence diagram
- [Domain Layer](../technical/domain-layer.md) - Project parser and CLI executor interfaces

### API References
- [dotnet add package](https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-add-package)
- [MSBuild Project SDK](https://learn.microsoft.com/en-us/visualstudio/msbuild/how-to-use-project-sdk)
- [VS Code Progress API](https://code.visualstudio.com/api/references/vscode-api#Progress)

### Related Features
- [FEAT-001-00-foundations](./FEAT-001-00-foundations.md) - Provides LoggerService for install logging
- [FEAT-001-01-browse-search](./FEAT-001-01-browse-search.md) - Provides package metadata for version selection

## Dependencies

### Technical Dependencies
- .NET SDK 6.0+ installed on user's machine
- dotnet CLI available on system PATH
- Workspace with at least one .csproj using PackageReference format
- LoggerService (from FEAT-001-00-002) for detailed operation logging
- Package details cache (from FEAT-001-01-012) for version resolution

### Feature Dependencies
- Blocked by FEAT-001-00-002 (LoggerService) for install operation logging
- Blocked by FEAT-001-00-006 (Operation Logging) for CLI error mapping
- Blocked by FEAT-001-01-008 (Package Details API) for version metadata
- Blocks future update/uninstall features which reuse project selection and CLI execution

## Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| dotnet CLI not installed or outdated | High | Medium | Detect .NET SDK on activation, show error with download link if missing |
| Network failures during package restore | High | High | Implement retry logic, cache packages locally, provide offline guidance |
| Project file corruption on failed install | High | Low | Parse CLI output before marking success, backup .csproj before modification |
| Multi-project install timeout (>5min) | Medium | Low | Execute in background with cancel button, show per-project progress |
| License acceptance blocks automation | Medium | Medium | Detect license prompt in CLI output, show modal with license text |
| Framework incompatibility not detected | Medium | Medium | Parse .csproj TargetFramework, compare to package metadata before install |

## Notes

This feature is the most critical user-facing workflow in the extension. The installation experience must be rock-solid, with comprehensive error handling and clear user feedback.

Multi-project installations should execute sequentially (not in parallel) to avoid race conditions in NuGet package cache and ensure accurate progress reporting.

The project selection UI should remember user's last selection per workspace to streamline repeated installs during development.

Consider implementing an "Install and Open README" action that installs the package and immediately displays the package README in a new editor tab.

The CLI executor should use `child_process.spawn` with streaming stdout/stderr to enable real-time progress updates during long-running package downloads.

Framework validation should use the NuGet API's `catalogEntry.dependencyGroups` to check if the package supports the project's target framework.

---
**Feature ID**: FEAT-001-02-install-packages  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)
