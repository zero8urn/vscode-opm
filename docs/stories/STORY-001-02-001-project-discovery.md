# STORY-001-02-001-project-discovery

**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Not Started  
**Priority**: High  
**Estimate**: 3 Story Points  
**Created**: 2025-11-16  
**Last Updated**: 2025-11-16

## User Story

**As a** developer installing NuGet packages  
**I want** the extension to automatically discover all .NET projects in my workspace  
**So that** I can select which projects should receive the package

## Description

This story implements project discovery functionality that scans the workspace for .csproj files using the PackageReference format. The parser extracts project metadata including project name, path, target framework, and existing package references.

Project discovery is essential for multi-project workspaces where developers need to install packages to specific projects. The implementation excludes common build output directories (bin/, obj/) and supports nested project structures within solution folders.

The project parser validates that discovered projects use the SDK-style PackageReference format (not legacy packages.config) and extracts the TargetFramework or TargetFrameworks elements for compatibility validation.

## Acceptance Criteria

### Scenario: Discover Projects in Workspace
**Given** the workspace contains 3 .csproj files  
**When** project discovery runs  
**Then** it should return 3 Project objects  
**And** each should include name, path, and targetFramework

### Scenario: Exclude Build Output Directories
**Given** the workspace has projects in bin/ and obj/ folders  
**When** project discovery runs  
**Then** projects in bin/ and obj/ should be excluded  
**And** only source projects should be returned

### Scenario: Parse Target Framework
**Given** a project file with `<TargetFramework>net8.0</TargetFramework>`  
**When** the project is parsed  
**Then** the targetFramework should be "net8.0"  
**And** multi-targeted projects should return array of frameworks

### Additional Criteria
- [ ] Discovers .csproj files using `vscode.workspace.findFiles()`
- [ ] Excludes patterns: `**/bin/**`, `**/obj/**`, `**/node_modules/**`
- [ ] Parses SDK-style projects (Sdk="Microsoft.NET.Sdk")
- [ ] Rejects packages.config format with clear error
- [ ] Extracts existing PackageReference elements

## Technical Implementation

### Key Components
- **File/Module**: `src/env/node/projectDiscovery.ts` - File system scanning
- **File/Module**: `src/domain/parsers/projectParser.ts` - .csproj XML parser
- **File/Module**: `src/domain/models/project.ts` - Project domain model

### Technical Approach
```typescript
export interface Project {
  name: string;
  path: string;
  targetFramework: string | string[];
  packageReferences: PackageReference[];
}

export class ProjectDiscovery {
  async discoverProjects(): Promise<Project[]> {
    // vscode.workspace.findFiles('**/*.csproj', '**/bin/**')
  }
}
```

XML parsing using fast-xml-parser or built-in DOMParser to extract:
- `<TargetFramework>` or `<TargetFrameworks>`
- `<PackageReference Include="..." Version="..." />`
- `Sdk` attribute on `<Project>` element

### API/Integration Points
- `vscode.workspace.findFiles('**/*.csproj', '{**/bin/**,**/obj/**}')`
- `vscode.workspace.fs.readFile()` for reading .csproj contents

## Testing Strategy

### Unit Tests
- [ ] Test projectParser extracts target framework from XML
- [ ] Test projectParser handles multi-targeting (net6.0;net8.0)
- [ ] Test projectParser extracts existing PackageReference elements
- [ ] Test projectParser rejects non-SDK projects

### Integration Tests
- [ ] Integration test: Discover projects in sample workspace
- [ ] Integration test: Exclude projects in bin/obj folders
- [ ] Integration test: Handle workspace with no .csproj files

### Manual Testing
- [ ] Manual test: Open workspace with multiple projects, verify all discovered
- [ ] Manual test: Verify project names match .csproj filename
- [ ] Manual test: Test with multi-targeted project (net6.0;net7.0;net8.0)

## Dependencies

### Blocked By
None

### Blocks
- [STORY-001-02-002-project-selection-ui] displays discovered projects
- [STORY-001-02-004-dotnet-add-package] targets discovered projects

### External Dependencies
- fast-xml-parser for XML parsing (or built-in DOMParser)

## INVEST Check

- [x] **I**ndependent - Can be developed independently
- [x] **N**egotiable - Exclusion patterns can be adjusted
- [x] **V**aluable - Essential for multi-project support
- [x] **E**stimable - 3 story points (1-2 days)
- [x] **S**mall - Focused on project file discovery
- [x] **T**estable - Clear file system and parsing tests

## Notes

Consider caching discovered projects per workspace with file system watcher to invalidate cache when .csproj files are added/removed.

Project name should default to filename without extension (e.g., `MyApp.csproj` → `MyApp`).

For multi-targeted projects, return frameworks as array: `["net6.0", "net7.0", "net8.0"]`.

SDK-style projects are identified by `<Project Sdk="Microsoft.NET.Sdk">` root element. Legacy projects use `<Project>` with `xmlns="..."` and `<packages.config>` reference.

## Changelog

| Date | Change | Author |
|---|---|---|
| 2025-11-16 | Story created | AI Assistant |

---
**Story ID**: STORY-001-02-001-project-discovery  
**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)
