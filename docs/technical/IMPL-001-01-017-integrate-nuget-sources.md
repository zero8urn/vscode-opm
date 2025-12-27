# IMPL-001-01-017-integrate-nuget-sources

**Story**: [STORY-001-01-017-integrate-nuget-sources](../stories/STORY-001-01-017-integrate-nuget-sources.md)  
**Feature**: [FEAT-001-01-browse-search](../features/FEAT-001-01-browse-search.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Ready for Implementation  
**Created**: 2025-12-27  
**Last Updated**: 2025-12-27

## Overview

This implementation plan integrates the NuGet configuration parser with the API client initialization to automatically load package sources from the developer's machine. The implementation wires together existing components (config discovery, config parsing, client initialization) without introducing new domain logic.

The core change is in `extension.ts` activation, where we replace hardcoded default sources with sources discovered from nuget.config files. The configured client instance is then shared with commands via constructor injection, ensuring all package operations use the developer's configured feeds.

## Architecture Decisions

### 1. Single Shared Client Instance

**Decision**: Create one NuGet API client instance at extension activation and inject it into commands.

**Rationale**:
- Ensures consistent source configuration across all commands
- Service index URL caching shared across the extension lifecycle
- Simplifies testing (mock one client instance instead of multiple)
- Matches domain service pattern (single logger, single domain provider service)

**Implementation**:
```typescript
// extension.ts
const nugetClient = createNuGetApiClient(logger, apiOptions);

// Inject into commands
const packageBrowserCommand = new PackageBrowserCommand(context, logger, nugetClient);
```

### 2. nuget.config Takes Precedence Over VS Code Settings

**Decision**: Merge discovered nuget.config sources with VS Code settings sources, with nuget.config taking precedence.

**Rationale**:
- Matches dotnet CLI behavior (nuget.config is source of truth)
- Allows workspace-specific overrides without modifying user settings
- VS Code settings provide fallback when no nuget.config exists
- Clear hierarchy: workspace config > user config > VS Code settings > hardcoded defaults

**Merge Strategy**:
```typescript
// 1. Get VS Code settings sources (may include user-defined sources)
const settingsSources = getNuGetApiOptions().sources;

// 2. Discover and parse nuget.config sources
const configSources = discoverAndMergeSources(workspaceRoot);

// 3. Merge: nuget.config sources override settings sources by name
const mergedSources = mergeSources(configSources, settingsSources);

// 4. Use merged sources in client options
const apiOptions = { ...getNuGetApiOptions(), sources: mergedSources };
```

### 3. Graceful Fallback for Missing Workspace

**Decision**: Use default nuget.org source when workspace root is unavailable (no open folders, untrusted workspace).

**Rationale**:
- Extension should remain functional without workspace (search nuget.org)
- Prevents errors in multi-root or remote workspace scenarios
- Simple conditional: if no workspace, skip config discovery

**Implementation**:
```typescript
const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

const sources = workspaceRoot
  ? discoverAndMergeSources(workspaceRoot)
  : []; // Empty array = client uses default sources
```

### 4. Log Discovered Sources Without Credentials

**Decision**: Log source names and URLs at activation for debugging, but never log credentials.

**Rationale**:
- Helps developers verify correct sources loaded
- Enables troubleshooting ("Why can't I see packages from my private feed?")
- Security: credentials must never appear in logs
- Use `logger.info()` so visible in default log level

**Implementation**:
```typescript
logger.info('Discovered NuGet sources', {
  sources: sources.map(s => ({ name: s.name, url: s.indexUrl, provider: s.provider }))
});
// ⚠️ DO NOT log s.auth - contains credentials
```

## Implementation Context

### <context id="current-extension-activation">
```typescript
// src/extension.ts (current state)
export function activate(context: vscode.ExtensionContext) {
  const logger = createLogger(context);
  context.subscriptions.push(logger);
  logger.debug('Extension activated');
  const domainService = new DomainProviderService();

  // Initialize NuGet API client with configuration
  const apiOptions = getNuGetApiOptions();
  const nugetClient = createNuGetApiClient(logger, apiOptions);
  logger.debug('NuGet API client initialized', apiOptions);

  // ... commands registered but nugetClient not passed to them
  
  // Package Browser command creates its own client
  const packageBrowserCommand = new PackageBrowserCommand(context, logger);
  context.subscriptions.push(
    vscode.commands.registerCommand(PackageBrowserCommand.id, () => packageBrowserCommand.execute()),
  );
}
```

**Issue**: Client created but not used. Commands create their own clients.
</context>

### <context id="packagebrowser-command-constructor">
```typescript
// src/commands/packageBrowserCommand.ts (current state)
export class PackageBrowserCommand {
  static id = 'opm.openPackageBrowser';

  constructor(private context: vscode.ExtensionContext, private logger: ILogger) {}

  async execute(): Promise<void> {
    try {
      this.logger.info('Opening NuGet Package Browser');

      // Creates its own client with defaults (PROBLEM)
      const nugetClient = createNuGetApiClient(this.logger);

      const panel = createPackageBrowserWebview(this.context, this.logger, nugetClient);
      // ...
    }
  }
}
```

**Issue**: Creates new client on every execution with default sources.
</context>

### <context id="configuration-service">
```typescript
// src/services/configurationService.ts (current implementation)
export function getNuGetApiOptions(): NuGetApiOptions {
  const config = vscode.workspace.getConfiguration('opm.nuget');
  
  return {
    sources: [
      {
        id: 'nuget.org',
        name: 'nuget.org',
        indexUrl: 'https://api.nuget.org/v3/index.json',
        enabled: true,
        provider: 'nuget.org',
        auth: { type: 'none' }
      }
    ],
    searchTimeout: config.get('searchTimeout', 30000),
    serviceIndexTimeout: config.get('serviceIndexTimeout', 10000),
    semVerLevel: config.get('semVerLevel', '2.0.0')
  };
}
```

**Usage**: Returns default options. Will be extended to merge with discovered sources.
</context>

### <context id="config-parser-api">
```typescript
// src/env/node/nugetConfigParser.ts (existing API)

/**
 * Discovers all NuGet config files following NuGet's hierarchy.
 * Returns array of config file paths in priority order (highest priority first).
 */
export function discoverNuGetConfigs(workspaceRoot: string): string[];

/**
 * Merges package sources from multiple NuGet config files.
 * Applies NuGet's merge rules (earlier configs override later).
 */
export function mergeNuGetConfigs(configPaths: string[]): PackageSource[];
```

**Usage**: Already implemented in STORY-001-01-016. Ready to use.
</context>

### <context id="package-source-model">
```typescript
// src/domain/models/nugetApiOptions.ts
export interface PackageSource {
  /** Unique identifier for the source */
  id: string;
  /** Display name */
  name: string;
  /** URL to service index (index.json) */
  indexUrl: string;
  /** Whether source is enabled for searches */
  enabled: boolean;
  /** Package source provider type */
  provider: PackageSourceProvider;
  /** Authentication configuration (may include credentials from nuget.config) */
  auth: PackageSourceAuth;
}
```

**Usage**: Returned by `mergeNuGetConfigs()`, accepted by `createNuGetApiClient(logger, options)`.
</context>

## Implementation Steps

### Phase 1: Create Source Discovery Helper

**File**: `src/services/configurationService.ts`

**Add new function** to discover and merge sources:

```typescript
import { discoverNuGetConfigs, mergeNuGetConfigs } from '../env/node/nugetConfigParser';
import type { PackageSource } from '../domain/models/nugetApiOptions';

/**
 * Discovers and merges NuGet package sources from nuget.config files.
 * 
 * Searches for nuget.config files in the standard NuGet hierarchy:
 * 1. Workspace folder → parent directories → drive root
 * 2. User-level config (~/.nuget/NuGet/NuGet.Config)
 * 3. Additional user configs (~/.nuget/config/*.config)
 * 4. Computer-level config
 * 
 * @param workspaceRoot - Workspace root path (from vscode.workspace.workspaceFolders)
 * @returns Merged array of package sources with credentials
 */
export function discoverNuGetSources(workspaceRoot: string): PackageSource[] {
  try {
    const configPaths = discoverNuGetConfigs(workspaceRoot);
    
    if (configPaths.length === 0) {
      return []; // No configs found, caller will use defaults
    }

    return mergeNuGetConfigs(configPaths);
  } catch (error) {
    // Log error but don't throw - extension should remain functional
    console.error('Failed to discover NuGet sources:', error);
    return [];
  }
}

/**
 * Merges discovered NuGet sources with VS Code settings sources.
 * 
 * Priority order (highest to lowest):
 * 1. nuget.config sources (workspace, user, computer hierarchy)
 * 2. VS Code settings sources (user/workspace settings.json)
 * 3. Hardcoded default (nuget.org)
 * 
 * @param discoveredSources - Sources from nuget.config files
 * @param settingsSources - Sources from VS Code settings
 * @returns Merged sources (discoveredSources override settingsSources by ID)
 */
export function mergePackageSources(
  discoveredSources: PackageSource[],
  settingsSources: PackageSource[]
): PackageSource[] {
  if (discoveredSources.length === 0) {
    return settingsSources; // No discovered sources, use settings
  }

  // Create map of discovered sources by ID for O(1) lookup
  const discoveredMap = new Map(discoveredSources.map(s => [s.id, s]));

  // Filter out settings sources that are overridden by discovered sources
  const nonOverriddenSettings = settingsSources.filter(s => !discoveredMap.has(s.id));

  // Combine: discovered sources first (higher priority), then non-overridden settings
  return [...discoveredSources, ...nonOverriddenSettings];
}
```

**Tests to Add**: `src/services/__tests__/configurationService.test.ts`

```typescript
import { describe, test, expect, mock } from 'bun:test';
import { discoverNuGetSources, mergePackageSources } from '../configurationService';

describe('discoverNuGetSources', () => {
  test('returns empty array when no configs found', () => {
    // Mock discoverNuGetConfigs to return empty array
    const sources = discoverNuGetSources('/nonexistent/path');
    expect(sources).toEqual([]);
  });

  test('returns merged sources when configs exist', () => {
    // Mock discoverNuGetConfigs and mergeNuGetConfigs
    // Verify sources returned
  });

  test('returns empty array on error and logs error', () => {
    // Mock discoverNuGetConfigs to throw
    // Verify error caught and empty array returned
  });
});

describe('mergePackageSources', () => {
  test('returns settings sources when no discovered sources', () => {
    const settings = [{ id: 'nuget.org', name: 'nuget.org', /* ... */ }];
    const result = mergePackageSources([], settings);
    expect(result).toEqual(settings);
  });

  test('discovered sources override settings sources by ID', () => {
    const discovered = [{ id: 'nuget.org', name: 'Custom NuGet', /* ... */ }];
    const settings = [{ id: 'nuget.org', name: 'Default NuGet', /* ... */ }];
    const result = mergePackageSources(discovered, settings);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Custom NuGet');
  });

  test('combines discovered and non-overridden settings sources', () => {
    const discovered = [{ id: 'company-feed', /* ... */ }];
    const settings = [{ id: 'nuget.org', /* ... */ }];
    const result = mergePackageSources(discovered, settings);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('company-feed');
    expect(result[1].id).toBe('nuget.org');
  });
});
```

### Phase 2: Update Extension Activation

**File**: `src/extension.ts`

**Update imports**:
```typescript
import { getNuGetApiOptions, discoverNuGetSources, mergePackageSources } from './services/configurationService';
```

**Update activation function**:
```typescript
export function activate(context: vscode.ExtensionContext) {
  // Initialize logger and register for disposal
  const logger = createLogger(context);
  context.subscriptions.push(logger);
  logger.debug('Extension activated');
  
  const domainService = new DomainProviderService();

  // Discover NuGet sources from nuget.config files
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const discoveredSources = workspaceRoot ? discoverNuGetSources(workspaceRoot) : [];
  
  // Get base options from VS Code settings
  const baseOptions = getNuGetApiOptions();
  
  // Merge discovered sources with settings sources
  const mergedSources = mergePackageSources(discoveredSources, baseOptions.sources);
  
  // Create API options with merged sources
  const apiOptions = {
    ...baseOptions,
    sources: mergedSources
  };
  
  // Initialize NuGet API client with discovered sources
  const nugetClient = createNuGetApiClient(logger, apiOptions);
  
  // Log discovered sources (URLs only, no credentials)
  logger.info('NuGet API client initialized', {
    sourceCount: apiOptions.sources.length,
    sources: apiOptions.sources.map(s => ({
      name: s.name,
      url: s.indexUrl,
      provider: s.provider,
      enabled: s.enabled,
      hasAuth: s.auth.type !== 'none'
    }))
  });

  // Register commands (existing)
  context.subscriptions.push(
    vscode.commands.registerCommand(HelloCommand.id, arg => new HelloCommand(domainService).execute(arg)),
  );

  // Register tree view (existing)
  const view = new SimpleViewProvider(domainService);
  context.subscriptions.push(vscode.window.registerTreeDataProvider('dpm.simpleView', view));

  // Register webview command (existing)
  context.subscriptions.push(
    vscode.commands.registerCommand('opm.openWebview', () => {
      createSampleWebview(context, logger);
    }),
  );

  // Register Package Browser command with injected NuGet client
  const packageBrowserCommand = new PackageBrowserCommand(context, logger, nugetClient);
  context.subscriptions.push(
    vscode.commands.registerCommand(PackageBrowserCommand.id, () => packageBrowserCommand.execute()),
  );
}
```

### Phase 3: Update PackageBrowserCommand

**File**: `src/commands/packageBrowserCommand.ts`

**Update constructor to accept NuGet client**:
```typescript
import type { INuGetApiClient } from '../domain/clients/nugetApiClient';

export class PackageBrowserCommand {
  static id = 'opm.openPackageBrowser';

  constructor(
    private context: vscode.ExtensionContext,
    private logger: ILogger,
    private nugetClient: INuGetApiClient  // Inject configured client
  ) {}

  async execute(): Promise<void> {
    try {
      this.logger.info('Opening NuGet Package Browser');

      // Use injected client instead of creating new one
      const panel = createPackageBrowserWebview(this.context, this.logger, this.nugetClient);

      this.logger.debug('Package Browser webview created', { viewType: panel.viewType });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to open Package Browser', error instanceof Error ? error : new Error(errorMessage));
      vscode.window.showErrorMessage(`Failed to open Package Browser: ${errorMessage}`);
    }
  }
}
```

### Phase 4: Add Integration Test

**File**: `test/integration/nugetSourceIntegration.integration.test.ts`

```typescript
import { describe, test, expect, beforeAll } from 'bun:test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { discoverNuGetSources, mergePackageSources } from '../../src/services/configurationService';
import { createNuGetApiClient } from '../../src/env/node/nugetApiClient';
import { createMockLogger } from '../helpers/mockLogger';

describe('NuGet Source Integration', () => {
  let tempWorkspace: string;

  beforeAll(() => {
    // Create temporary workspace with nuget.config
    tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opm-test-'));
    
    const nugetConfig = `<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <add key="TestFeed" value="https://example.com/v3/index.json" />
    <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />
  </packageSources>
</configuration>`;
    
    fs.writeFileSync(path.join(tempWorkspace, 'nuget.config'), nugetConfig);
  });

  test('discovers sources from workspace nuget.config', () => {
    const sources = discoverNuGetSources(tempWorkspace);
    
    expect(sources.length).toBeGreaterThanOrEqual(1);
    expect(sources.some(s => s.name === 'TestFeed')).toBe(true);
  });

  test('merged sources can initialize NuGet client', () => {
    const discovered = discoverNuGetSources(tempWorkspace);
    const defaultSources = [
      {
        id: 'nuget.org',
        name: 'nuget.org',
        indexUrl: 'https://api.nuget.org/v3/index.json',
        enabled: true,
        provider: 'nuget.org' as const,
        auth: { type: 'none' as const }
      }
    ];
    
    const merged = mergePackageSources(discovered, defaultSources);
    const logger = createMockLogger();
    
    const client = createNuGetApiClient(logger, { sources: merged });
    
    expect(client).toBeDefined();
    expect(merged.length).toBeGreaterThanOrEqual(1);
  });

  test('client uses workspace source for search', async () => {
    const discovered = discoverNuGetSources(tempWorkspace);
    const merged = mergePackageSources(discovered, []);
    const logger = createMockLogger();
    
    const client = createNuGetApiClient(logger, { sources: merged });
    
    // This should use TestFeed source (will fail to connect but proves source is used)
    const result = await client.searchPackages({ query: 'test' });
    
    // Expect network error (TestFeed doesn't exist), not "no sources" error
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(['Network', 'ApiError']).toContain(result.error.code);
    }
  });
});
```

## Testing Strategy

### Unit Tests

**File**: `src/services/__tests__/configurationService.test.ts`
- [ ] Test `discoverNuGetSources()` returns empty array when no configs found
- [ ] Test `discoverNuGetSources()` returns merged sources when configs exist
- [ ] Test `discoverNuGetSources()` catches errors and returns empty array
- [ ] Test `mergePackageSources()` returns settings sources when no discovered sources
- [ ] Test `mergePackageSources()` discovered sources override settings by ID
- [ ] Test `mergePackageSources()` combines discovered and non-overridden settings

**File**: `src/extension.test.ts` (if activation testing framework exists)
- [ ] Test activation creates client with discovered sources
- [ ] Test activation uses default sources when workspace unavailable
- [ ] Test activation logs source count and names (no credentials)

### Integration Tests

**File**: `test/integration/nugetSourceIntegration.integration.test.ts`
- [ ] Test discovers sources from temporary workspace nuget.config
- [ ] Test merged sources initialize NuGet client successfully
- [ ] Test client uses workspace source for search operations
- [ ] Test authenticated source includes credentials in requests

### Manual Testing

- [ ] Create nuget.config in workspace root with custom feed
- [ ] Activate extension and check Output channel for discovered sources
- [ ] Open Package Browser and verify search uses custom feed
- [ ] Remove nuget.config and verify extension falls back to nuget.org
- [ ] Configure user-level nuget.config and verify merging with workspace config
- [ ] Add credentials to nuget.config and verify authenticated searches work

## Migration Notes

### Breaking Changes
None. This is an enhancement that maintains backward compatibility.

### Deprecations
None.

### Configuration Changes
No new VS Code settings required. Extension automatically discovers nuget.config files.

## Security Considerations

1. **Credential Logging Prevention**
   - Never log `source.auth` object or credential fields
   - Log only source names, URLs, provider types, and `hasAuth` boolean
   - Review all `logger.info()` and `logger.debug()` calls in activation

2. **Workspace Trust** (Future Enhancement)
   - Current implementation: Parse configs unconditionally (matches dotnet CLI)
   - Future: Only parse configs in trusted workspaces
   - Add workspace trust check before `discoverNuGetSources()` call

3. **Credential Exposure**
   - Credentials stored in memory (extension process)
   - Never transmitted except in auth headers to configured sources
   - Extension host isolation prevents webview access to credentials

## Performance Considerations

1. **Activation Time**: Config discovery adds ~10-50ms to activation (acceptable)
2. **File I/O**: Reads nuget.config files synchronously (typically <10 files, <1KB each)
3. **Caching**: Service index URLs cached per source (no re-fetch on repeated searches)

## Rollout Plan

1. Implement and test in development environment
2. Manual testing with real workspace nuget.config files
3. Integration test with Azure Artifacts and GitHub Packages feeds
4. Merge and release in next minor version (no breaking changes)

## Follow-Up Stories

- **Workspace Trust Integration**: Only parse nuget.config in trusted workspaces
- **Multi-Root Workspace Support**: Discover sources from all workspace folders
- **Source Selection UI**: Allow users to enable/disable discovered sources in settings UI
- **Credential Provider Integration**: Support dotnet credential providers for OAuth/interactive auth

---

**Implementation Status**: Ready for Development  
**Estimated Effort**: 2 story points (1 day)  
**Risk Level**: Low (wiring existing components, no new domain logic)
