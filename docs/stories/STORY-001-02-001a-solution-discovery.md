# STORY-001-02-001a-solution-discovery

**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Not Started  
**Priority**: High  
**Estimate**: 3 Story Points  
**Created**: 2026-01-02  

## User Story

**As a** developer installing NuGet packages  
**I want** the extension to discover a single solution file and manage the active solution context  
**So that** project discovery and package operations are scoped correctly and performantly

## Description

Implement Tier 1 of the discovery strategy: root-level single solution discovery and a `SolutionContextService` that manages the active solution context and exposes scoped projects to downstream features.

Key responsibilities:
- Detect `.sln` and `.slnx` files at workspace folder root (configurable scan depth)
- Auto-select the single solution when found
- Persist the active solution in workspace settings (`opm.activeSolution`)
- Provide events/notifications when the active solution changes
- Expose an API to request solution-scoped project lists (delegates to CLI parsing in `001b`)
- Fall back to workspace-wide project discovery when no solution file exists or multiple solutions are found

## Acceptance Criteria

- Finds solution files at workspace root using `vscode.workspace.findFiles('*.{sln,slnx}')` with configurable depth
- Auto-selects single root solution and persists to `opm.activeSolution` workspace setting
- Falls back to workspace-wide project discovery when zero or multiple solutions are detected
- Implements `SolutionContextService` with events for context changes and a method `getScopedProjects()`
- Status bar shows active solution name and project count when solution context is active
- Workspace setting `opm.discovery.solutionScanDepth` influences root-only vs recursive scan
- Unit tests for `SolutionContextService`, single solution auto-selection, and fallback behavior

## Notes

- This story focuses on the **single solution happy path** that aligns with standard .NET IDE behavior (Visual Studio, Rider)
- Multi-solution selection UI is intentionally excluded and may be added as a future enhancement if needed
- This story does NOT parse `.csproj` contents; it only discovers solutions and manages context. Project parsing and metadata extraction are implemented in `STORY-001-02-001b`
- When no solution or multiple solutions are found, the service falls back to Tier 2 workspace-wide discovery implemented in `STORY-001-02-001c`

---
**Story ID**: STORY-001-02-001a  
**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)
