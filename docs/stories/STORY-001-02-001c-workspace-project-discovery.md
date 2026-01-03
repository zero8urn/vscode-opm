# STORY-001-02-001c-workspace-project-discovery

**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Not Started  
**Priority**: High  
**Estimate**: 3 Story Points  
**Created**: 2026-01-02  

## User Story

**As a** developer in workspaces without a solution file  
**I want** the extension to perform a depth-limited, exclusion-aware scan for `.csproj` files  
**So that** projects are discovered reliably without scanning large build outputs or unrelated folders

## Description

Implement Tier 2 fallback discovery: depth-limited workspace `.csproj` scanning when no active solution is selected. This supports monorepos and simple project folders without solutions.

Core behaviors:
- Perform depth-limited search for `**/*.csproj` (configurable `opm.discovery.projectScanDepth`)
- Exclude `**/bin/**`, `**/obj/**`, `**/node_modules/**`, `.git/`, `artifacts/`
- For each discovered project path, delegate to CLI parsing implemented in `001b` to obtain metadata
- Warn when discovered project count exceeds `opm.discovery.largeWorkspaceThreshold`

## Acceptance Criteria

- Uses `vscode.workspace.findFiles` with configurable depth/exclusion patterns
- Applies exclusion patterns to avoid `bin/` and `obj/` directories
- Delegates metadata extraction to CLI parsing (`001b`) for each discovered project
- Emits a performance warning when project count > `opm.discovery.largeWorkspaceThreshold`
- Unit/integration tests for depth-limited scanning and exclusion patterns

## Notes

- This story is explicitly a fallback; if a solution is active (managed by `001a`), this scan should not run unless explicitly requested by the user.

---
**Story ID**: STORY-001-02-001c  
**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)
