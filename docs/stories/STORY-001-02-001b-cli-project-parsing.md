# STORY-001-02-001b-cli-project-parsing

**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Not Started  
**Priority**: High  
**Estimate**: 3 Story Points  
**Created**: 2026-01-02  

## User Story

**As a** developer using the extension  
**I want** project metadata to be extracted using the authoritative .NET CLI  
**So that** target frameworks, PackageReference entries, and installed packages are accurate and consistent with MSBuild evaluation

## Description

Implement a CLI-based parser that extracts project metadata using `dotnet` commands rather than ad-hoc XML parsing. This ensures MSBuild conditions, imports and SDK evaluation are respected.

Core behaviors:
- For solution-scoped discovery, call `dotnet sln <solution> list` to enumerate project paths
- For each project, run `dotnet msbuild <project> -getProperty:TargetFramework;TargetFrameworks -noLogo` to get TFMs
- Use `dotnet list <project> package --format json` to enumerate installed packages
- Normalize single and multi-target TFMs into `string | string[]`

## Acceptance Criteria

- Uses `dotnet sln` to list projects when a solution is active
- Uses `dotnet msbuild -getProperty` to obtain `TargetFramework` and `TargetFrameworks`
- Uses `dotnet list package --format json` (or equivalent) to obtain installed PackageReference entries
- Returns a `Project` model with `name`, `path`, `targetFramework(s)`, and `packageReferences`
- Detects and rejects legacy `packages.config` projects with a clear error
- Unit/integration tests mock `dotnet` calls and validate metadata extraction

## Notes

- This story implements the authoritative parsing layer used by the SolutionContextService (`001a`) and by workspace fallback discovery (`001c`). Do NOT add XML-only parsing here; the CLI approach is required by the discovery strategy.

---
**Story ID**: STORY-001-02-001b  
**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)
