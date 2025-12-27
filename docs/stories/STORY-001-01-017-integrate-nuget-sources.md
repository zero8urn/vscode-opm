# STORY-001-01-017-integrate-nuget-sources

**Feature**: [FEAT-001-01-browse-search](../features/FEAT-001-01-browse-search.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Done  
**Priority**: High  
**Estimate**: 2 Story Points  
**Created**: 2025-12-27  
**Last Updated**: 2025-12-27

## User Story

**As a** developer with configured NuGet sources on my machine  
**I want** the extension to automatically discover and use my nuget.config package sources  
**So that** I can search packages from all my configured feeds (public and private) without additional configuration

## Description

This story integrates the NuGet configuration parser (STORY-001-01-016) with the API client initialization (STORY-001-01-001) to automatically load package sources from the developer's machine at extension activation.

Currently, the extension creates NuGet API clients with hardcoded default options (nuget.org only), even though the configuration parser can discover and merge sources from multiple nuget.config files following NuGet's standard hierarchy (workspace → user → computer level).

This integration ensures the extension respects the developer's existing NuGet configuration, matching the behavior of the dotnet CLI and Visual Studio. When the extension activates, it will:

1. **Discover nuget.config files** using the standard NuGet hierarchy (workspace root → parent directories → user config → computer config)
2. **Parse and merge sources** from all discovered configs, applying NuGet's merge rules (higher-priority configs override lower-priority)
3. **Initialize API client** with merged sources, including authentication credentials from `<packageSourceCredentials>` sections
4. **Share client instance** across all commands via dependency injection

The implementation addresses the current issue where `packageBrowserCommand.ts` creates its own client with defaults instead of using the configured instance from `extension.ts`. After this story, all commands will use a shared, properly configured client that includes the developer's private feeds and authentication.

## Acceptance Criteria

### Scenario: Load Sources from Workspace nuget.config
**Given** a nuget.config exists in the workspace root with package sources:
```xml
<packageSources>
  <add key="CompanyFeed" value="https://company.nuget.org/v3/index.json" />
  <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />
</packageSources>
```
**When** the extension activates  
**Then** the NuGet API client should be initialized with both sources  
**And** search operations should be able to query packages from CompanyFeed

### Scenario: Merge User and Workspace Configs
**Given** user-level config at `~/.nuget/NuGet/NuGet.Config` defines a private feed  
**And** workspace config defines a project-specific feed  
**When** the extension activates  
**Then** the API client should include sources from both configs  
**And** workspace sources should override user sources with duplicate names

### Scenario: Include Authentication from Credentials Section
**Given** nuget.config contains credentials:
```xml
<packageSourceCredentials>
  <CompanyFeed>
    <add key="Username" value="user" />
    <add key="ClearTextPassword" value="token123" />
  </CompanyFeed>
</packageSourceCredentials>
```
**When** the extension activates  
**Then** the CompanyFeed source should include auth configuration  
**And** requests to CompanyFeed should include authentication headers

### Scenario: Fallback to Default When No Config Found
**Given** no nuget.config files exist in workspace or user directories  
**When** the extension activates  
**Then** the API client should initialize with default nuget.org source only  
**And** search operations should work normally against nuget.org

### Additional Criteria
- [ ] `extension.ts` activation calls `discoverNuGetConfigs()` to find all config files
- [ ] `extension.ts` activation calls `mergeNuGetConfigs()` to merge sources with credentials
- [ ] Merged sources passed to `createNuGetApiClient()` via `options.sources` parameter
- [ ] Shared NuGet client instance passed to commands via constructor injection
- [ ] `packageBrowserCommand.ts` uses injected client instead of creating new instance
- [ ] Client instance logged at activation (source names and URLs only, no credentials)
- [ ] Graceful handling when workspace root is unavailable (multi-root workspaces)

## Technical Implementation

### Implementation Plan
- [Link to technical implementation document](../technical/IMPL-001-01-017-integrate-nuget-sources.md)

### Key Components
- **File/Module**: `src/extension.ts` - Add config discovery and client initialization with merged sources
- **File/Module**: `src/commands/packageBrowserCommand.ts` - Update constructor to accept injected NuGet client
- **File/Module**: `src/services/configurationService.ts` - Add helper to merge VS Code settings with nuget.config sources

### Technical Approach

The integration follows a three-phase initialization:

**Phase 1: Config Discovery** (extension activation)
```typescript
// extension.ts
const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
const configPaths = workspaceRoot 
  ? discoverNuGetConfigs(workspaceRoot)
  : [];
```

**Phase 2: Source Merging** (parse and merge all configs)
```typescript
const sources = configPaths.length > 0
  ? mergeNuGetConfigs(configPaths)
  : []; // Empty = use default nuget.org
```

**Phase 3: Client Initialization** (inject sources into options)
```typescript
const apiOptions = getNuGetApiOptions();
apiOptions.sources = sources.length > 0 ? sources : apiOptions.sources; // Keep defaults if no configs
const nugetClient = createNuGetApiClient(logger, apiOptions);
```

**Phase 4: Dependency Injection** (pass to commands)
```typescript
const packageBrowserCommand = new PackageBrowserCommand(context, logger, nugetClient);
```

### API/Integration Points
- `discoverNuGetConfigs(workspaceRoot)` - Finds config files in hierarchy
- `mergeNuGetConfigs(configPaths)` - Parses and merges package sources
- `createNuGetApiClient(logger, options)` - Factory with source configuration
- VS Code Workspace API - `vscode.workspace.workspaceFolders`

## Testing Strategy

### Unit Tests
- [ ] Test extension activation creates client with workspace sources when nuget.config exists
- [ ] Test extension activation uses default sources when no nuget.config found
- [ ] Test merged sources include credentials from `<packageSourceCredentials>`
- [ ] Test source merging follows priority order (workspace > user > computer)
- [ ] Test client instance is shared across commands

### Integration Tests
- [ ] Integration test: Search packages using discovered private feed
- [ ] Integration test: Authenticated requests use credentials from nuget.config
- [ ] Integration test: Multi-root workspace uses first workspace folder for config discovery

### Manual Testing
- [ ] Manual test: Create workspace nuget.config with custom feed, verify search includes that feed
- [ ] Manual test: Configure user-level nuget.config, verify sources merged with workspace config
- [ ] Manual test: Open extension in workspace without nuget.config, verify nuget.org works
- [ ] Manual test: Configure authenticated feed, verify packages discoverable via search
- [ ] Manual test: Check Output channel logs show discovered sources (URLs only, no credentials)

## Dependencies

### Blocked By
- [STORY-001-01-001-nuget-search-api] - Base API client implementation
- [STORY-001-01-016-authenticated-sources] - Config parser with credential support

### Blocks
- Future stories requiring multi-source search aggregation
- Package installation stories needing source resolution

### External Dependencies
None

## INVEST Check

- [x] **I**ndependent - Can be developed independently (depends only on completed stories)
- [x] **N**egotiable - Config discovery strategy can be adjusted
- [x] **V**aluable - Critical for enterprise users with private feeds
- [x] **E**stimable - 2 story points (1 day)
- [x] **S**mall - Focused on wiring existing components together
- [x] **T**estable - Clear acceptance criteria with unit and integration tests

## Notes

**Workspace Trust Consideration**: In future enhancement, only parse nuget.config in trusted workspaces to prevent malicious credential extraction. For this story, parse configs unconditionally to match dotnet CLI behavior.

**Multi-Root Workspace Handling**: For workspaces with multiple folders, use the first workspace folder's path for config discovery. Full multi-root support can be added in future story.

**VS Code Settings Integration**: The `getNuGetApiOptions()` function reads VS Code settings for default sources. This story should merge discovered sources with settings-based sources, with nuget.config taking precedence.

**Logging Security**: When logging discovered sources at activation, log source names and URLs only. Never log credentials, even in debug mode.

**Performance**: Config discovery happens once at activation. No runtime overhead for search operations. Service index resolution already cached per source.

## Changelog

| Date | Change | Author |
|---|---|---|
| 2025-12-27 | Story created | AI Assistant |

---
**Story ID**: STORY-001-01-017-integrate-nuget-sources  
**Feature**: [FEAT-001-01-browse-search](../features/FEAT-001-01-browse-search.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)
