# STORY-001-02-001a-solution-discovery

**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Not Started  
**Priority**: High  
**Estimate**: 5 Story Points  
**Created**: 2026-01-02  

## User Story

**As a** developer installing NuGet packages  
**I want** the extension to discover solution files and manage an active solution context  
**So that** project discovery and package operations are scoped correctly and performantly

## Description

Implement Tier 1 of the discovery strategy: root-level solution discovery and a `SolutionContextService` that manages the active solution context and exposes scoped projects to downstream features.

Key responsibilities:
- Detect `.sln` and `.slnx` files at each workspace folder root (configurable scan depth)
- Auto-select a single solution when found, present a Quick Pick when multiple solutions are present
- Persist the active solution in workspace settings (`opm.activeSolution`)
- Provide events/notifications when the active solution changes
- Expose an API to request solution-scoped project lists (delegates to CLI parsing in `001b`)

## Acceptance Criteria

- Finds solution files at workspace root using `vscode.workspace.findFiles('*.sln')` (or configurable depth)
- Auto-select single root solution and persist to `opm.activeSolution`
- When multiple solutions detected, show Quick Pick with solution names and project counts
- Implement `SolutionContextService` with events for context changes and a method `getScopedProjects()`
- Status bar shows active solution name and project count
- Workspace setting `opm.discovery.solutionScanDepth` influences root-only vs recursive scan
- Unit tests for `SolutionContextService` and Quick Pick behavior

## Notes

- This story does NOT parse `.csproj` contents; it only discovers solutions and manages context. Project parsing and metadata extraction are implemented in `STORY-001-02-001b`.

---
**Story ID**: STORY-001-02-001a  
**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)
