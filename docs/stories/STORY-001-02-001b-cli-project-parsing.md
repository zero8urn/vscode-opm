# STORY-001-02-001b-cli-project-parsing

**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Done  
**Priority**: High  
**Estimate**: 3 Story Points  
**Created**: 2026-01-02  
**Completed**: 2026-01-03  

## User Story

**As a** developer using the extension  
**I want** project metadata to be extracted using the authoritative .NET CLI  
**So that** target frameworks, PackageReference entries, and installed packages are accurate and consistent with MSBuild evaluation

## Description

Implement a CLI-based parser that extracts project metadata using `dotnet` commands rather than ad-hoc XML parsing. This ensures MSBuild conditions, imports and SDK evaluation are respected.

Core behaviors:
- For solution-scoped discovery, call `dotnet sln <solution> list` to enumerate project paths
- For each project, run `dotnet msbuild <project> -getProperty:TargetFramework -getProperty:TargetFrameworks -noLogo` to get TFMs
- Use `dotnet list <project> package --format json` to enumerate installed packages
- Normalize single and multi-target TFMs into `string | string[]`

## Acceptance Criteria

- ✅ Uses `dotnet sln` to list projects when a solution is active (implemented in dotnetSolutionParser)
- ✅ Uses `dotnet msbuild -getProperty` to obtain `TargetFramework` and `TargetFrameworks`
- ✅ Uses `dotnet list package --format json` to obtain installed PackageReference entries
- ✅ Returns a `ProjectMetadata` model with `name`, `path`, `targetFrameworks`, and `packageReferences`
- ✅ Detects and rejects legacy `packages.config` projects with a clear error
- ✅ Unit tests mock `dotnet` calls and validate metadata extraction
- ✅ Integration tests use real dotnet CLI against test fixtures

## Implementation Summary

**Files Created:**
- `src/services/cli/types/projectMetadata.ts` - Type definitions for project metadata
- `src/services/cli/dotnetCliExecutor.ts` - Low-level CLI command execution with timeout/streaming
- `src/services/cli/parsers/targetFrameworkParser.ts` - TFM extraction from msbuild output
- `src/services/cli/parsers/packageReferenceParser.ts` - Package enumeration from JSON output
- `src/services/cli/dotnetProjectParser.ts` - High-level orchestration with caching and file watching
- `src/services/cli/__tests__/dotnetCliExecutor.test.ts` - Unit tests for CLI executor
- `src/services/cli/parsers/__tests__/targetFrameworkParser.test.ts` - Unit tests for TFM parser
- `src/services/cli/parsers/__tests__/packageReferenceParser.test.ts` - Unit tests for package parser
- `test/integration/cliProjectParsing.integration.test.ts` - Integration tests with real dotnet CLI
- `docs/technical/cli-project-parsing.md` - Usage guide and technical documentation

**Test Results:**
- Unit Tests: 29 pass, 0 fail (>90% coverage)
- Integration Tests: 8 pass, 0 fail (real dotnet CLI execution)

**Key Features:**
- JSON output parsing from modern MSBuild (handles both JSON and legacy text formats)
- Multi-targeting support (returns `string | string[]` based on framework count)
- In-memory caching with 1-minute TTL
- File watcher integration for automatic cache invalidation
- Batch parsing with parallel execution (5 concurrent projects)
- Comprehensive error handling with typed error codes
- Graceful handling of projects with no packages (empty array instead of error)

## Notes

This story implements the authoritative parsing layer used by the SolutionContextService (`001a`) and by workspace fallback discovery (`001c`). The CLI approach ensures full MSBuild evaluation including conditions, imports, and SDK defaults.

**Technical Documentation**: [cli-project-parsing.md](../technical/cli-project-parsing.md)  
**Implementation Plan**: [IMPL-001-02-001b-cli-project-parsing.md](../technical/IMPL-001-02-001b-cli-project-parsing.md)

---
**Story ID**: STORY-001-02-001b  
**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)
