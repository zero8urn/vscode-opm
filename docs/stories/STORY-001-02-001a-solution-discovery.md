# STORY-001-02-001a-solution-discovery

**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Done
**Priority**: High  
**Estimate**: 3 Story Points  
**Created**: 2026-01-02  
**Completed**: 2026-01-03  

## User Story

**As a** developer browsing NuGet packages in the package browser  
**I want** the extension to discover solution and project files in the background  
**So that** the package details card can show relevant installation targets without blocking search functionality

## Description

Implement asynchronous solution discovery that runs when the package browser opens. The `SolutionContextService` discovers solution files and projects in the background, making this data available to the package details card for displaying installation target options.

Key responsibilities:
- Detect `.sln` and `.slnx` files at workspace folder root (configurable scan depth)
- Run discovery asynchronously when package browser launches (non-blocking)
- Auto-select the single solution when found
- Parse solution files using `dotnet sln list` to enumerate projects
- Expose discovered solutions and projects via `SolutionContextService`
- Fall back to workspace-wide project discovery when no solution file exists or multiple solutions are found

## Acceptance Criteria

- Solution discovery initiates when `opm.openPackageBrowser` command is executed
- Discovery runs asynchronously without blocking package search functionality
- Finds solution files at workspace root using `vscode.workspace.findFiles('*.{sln,slnx}')` with configurable depth
- Auto-selects single root solution when exactly one is found
- Parses solution files to enumerate contained projects
- `SolutionContextService` exposes `getContext()` method returning discovered solutions and projects
- Package browser can access solution/project data for package details card display
- Workspace setting `opm.discovery.solutionScanDepth` influences root-only vs recursive scan
- Unit tests for `SolutionContextService`, discovery service, and CLI parser

## Notes

- **Architecture Change**: Solution discovery is now integrated into the package browser workflow, not a standalone activation feature
- **No Status Bar**: Status bar integration has been removed; solution/project info displays in the package details card instead
- **No Commands**: Removed `opm.selectSolution` and `opm.openDocumentation` commands; only `opm.openPackageBrowser` is used
- **Async Discovery**: Discovery runs in parallel with package search to avoid blocking the UI
- **Data Availability**: Focus is on making solution/project data ready for consumption by the package details card
- This story does NOT implement the UI for displaying solutions in the package details card; it only provides the data layer
- Project parsing and metadata extraction are implemented in `STORY-001-02-001b`
- Multi-project selection UI in the package details card is implemented in `STORY-001-02-002`

---
**Story ID**: STORY-001-02-001a  
**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)
