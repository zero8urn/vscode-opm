# IMPL-001-02-006-install-command

**Story**: [STORY-001-02-006-install-command](../stories/STORY-001-02-006-install-command.md)  
**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Created**: 2026-01-11  
**Status**: Ready for Implementation

## High-Level Summary

Implement the `opm.installPackage` **internal command** handler that orchestrates package installation from webview IPC messages through to domain provider execution, progress feedback, and UI state updates. This command is **not registered in package.json** and is only invoked programmatically by the Package Browser webview—never directly by users via the command palette.

The command acts as a thin coordination layer validating inputs (provided by the webview), delegating to the domain provider for each project sequentially, managing cancellation tokens, invalidating caches on success, and providing comprehensive user feedback via progress notifications and toast messages. Users interact with package installation exclusively through the webview UI ("Browse NuGet Packages"), which gathers all required context (package ID, version, selected projects) before invoking this internal command.

## Command Invocation Pattern

**User-Facing Entry Point**: `opm.openPackageBrowser` (registered in package.json)
- Opens the Package Browser webview
- User searches for packages, views details, selects version and projects
- User clicks "Install to X projects" button

**Internal Command Invocation**: `opm.installPackage` (NOT in package.json)
- Webview sends IPC message: `{ type: 'install', packageId, version, projectPaths }`
- Webview host calls: `vscode.commands.executeCommand('opm.installPackage', params)`
- This command executes with all context already gathered
- Results flow back to webview via IPC response

**Why Internal-Only?**
- **No missing context**: Webview provides all required parameters
- **No duplicate UI**: Avoids building command palette prompts for package/version/project selection
- **Better UX**: Users see package details, dependencies, README while selecting projects
- **Consistent pattern**: Matches VS Code extension conventions (UI surfaces invoke internal commands)

## Implementation Checklist

1. [Create command class with parameter validation](#1-command-structure)
2. [Implement single-project install flow with progress](#2-single-project-flow)
3. [Implement multi-project sequential install flow](#3-multi-project-flow)
4. [Add cancellation token support](#4-cancellation-support)
5. [Implement cache invalidation on success](#5-cache-invalidation)
6. [Trigger tree view refresh](#6-tree-view-refresh)
7. [Add webview response handling](#7-webview-responses)
8. [Implement toast notifications](#8-toast-notifications)
9. [Add comprehensive logging](#9-logging)
10. [Write unit tests for validation and orchestration](#10-unit-tests)
11. [Write integration tests for end-to-end flow](#11-integration-tests)
12. [Register command in extension activation](#12-command-registration)

---

## Detailed Implementation Sections

### 1. Command Structure

**File**: `src/commands/installPackageCommand.ts`

Create command class following the established pattern with static ID and execute method accepting typed parameters.

```typescript
export interface InstallPackageParams {
  packageId: string;
  version: string;
  projectPaths: string[];
}

export interface InstallPackageResult {
  success: boolean;
  results: ProjectInstallResult[];
}

export interface ProjectInstallResult {
  projectPath: string;
  success: boolean;
  error?: string;
}

export class InstallPackageCommand {
  static readonly id = 'opm.installPackage';

  constructor(
    private readonly domainProviderService: DomainProviderService,
    private readonly logger: ILogger,
    private readonly installedPackagesProvider?: InstalledPackagesProvider
  ) {}

  async execute(params: InstallPackageParams): Promise<InstallPackageResult> {
    // Implementation follows in subsequent sections
  }
}
```

**Key Points**:
- Use constructor DI for testability (provider service, logger, tree view)
- Static `id` property matches `package.json` command registration
- Typed parameters interface prevents runtime errors
- Result interface supports per-project status tracking

**See**: [§A: Parameter Validation](#a-parameter-validation)

---

### 2. Single-Project Flow

Implement the core installation logic for a single project, wrapped in VS Code progress API.

```typescript
async execute(params: InstallPackageParams): Promise<InstallPackageResult> {
  // Validate inputs
  this.validateParams(params);

  // Get domain provider
  const provider = this.domainProviderService.getProvider();
  if (!provider) {
    throw new Error('Domain provider not initialized');
  }

  const results: ProjectInstallResult[] = [];

  // Execute with progress
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Installing ${params.packageId}`,
      cancellable: true
    },
    async (progress, token) => {
      for (let i = 0; i < params.projectPaths.length; i++) {
        if (token.isCancellationRequested) {
          break;
        }

        const projectPath = params.projectPaths[i];
        const projectName = path.basename(projectPath, '.csproj');

        // Update progress
        progress.report({
          message: `to ${projectName} (${i + 1}/${params.projectPaths.length})...`,
          increment: (100 / params.projectPaths.length)
        });

        // Execute installation for single project
        const result = await this.installToProject(
          provider,
          params.packageId,
          params.version,
          projectPath
        );

        results.push(result);
      }
    }
  );

  // Handle post-installation actions
  await this.handlePostInstall(params, results);

  return {
    success: results.every(r => r.success),
    results
  };
}
```

**Key Points**:
- `withProgress` provides built-in cancel button and notification UI
- Progress message shows current project and count (e.g., "to MyApp.Web (2/3)...")
- Incremental progress updates for visual feedback
- Single-project install extracted to helper method for testability

**See**: [§B: Progress Reporting](#b-progress-reporting)

---

### 3. Multi-Project Flow

The multi-project flow is handled by the loop in section 2. Extract the single-project install logic to a helper:

```typescript
private async installToProject(
  provider: DomainProvider,
  packageId: string,
  version: string,
  projectPath: string
): Promise<ProjectInstallResult> {
  this.logger.info(
    `Installing ${packageId} v${version} to ${projectPath}`
  );

  try {
    const result = await provider.installPackage({
      packageId,
      version,
      projectPath
    });

    if (result.success) {
      this.logger.info(
        `Successfully installed ${packageId} to ${path.basename(projectPath)}`
      );
      return { projectPath, success: true };
    } else {
      this.logger.error(
        `Failed to install ${packageId} to ${path.basename(projectPath)}: ${result.error?.message}`
      );
      return {
        projectPath,
        success: false,
        error: result.error?.message || 'Unknown error'
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(
      `Exception installing ${packageId} to ${path.basename(projectPath)}: ${message}`
    );
    return { projectPath, success: false, error: message };
  }
}
```

**Key Points**:
- Sequential execution (no parallel) prevents NuGet cache race conditions
- Per-project try/catch ensures one failure doesn't block others
- Detailed logging for each project operation
- Domain provider returns structured `DomainResult<T>` with success/error

**See**: [§C: Error Handling](#c-error-handling)

---

### 4. Cancellation Support

Cancellation is handled by the `CancellationToken` from `withProgress`. Check token before each project:

```typescript
for (let i = 0; i < params.projectPaths.length; i++) {
  if (token.isCancellationRequested) {
    this.logger.info(
      `Installation cancelled (${i}/${params.projectPaths.length} projects completed)`
    );
    break;
  }
  // ... install logic
}
```

**Key Points**:
- Token check before each project prevents wasted work
- Already-completed installations are preserved (no rollback)
- Log cancellation with completion count for debugging

**See**: [§D: Cancellation Handling](#d-cancellation-handling)

---

### 5. Cache Invalidation

Invalidate the installed packages cache only if at least one installation succeeded:

```typescript
private async handlePostInstall(
  params: InstallPackageParams,
  results: ProjectInstallResult[]
): Promise<void> {
  const anySuccess = results.some(r => r.success);

  if (anySuccess) {
    // Invalidate installed package cache
    const provider = this.domainProviderService.getProvider();
    if (provider && 'invalidateCache' in provider) {
      await (provider as any).invalidateCache('installed:*');
      this.logger.debug('Invalidated installed package cache');
    }

    // Refresh tree view
    if (this.installedPackagesProvider) {
      this.installedPackagesProvider.refresh();
      this.logger.debug('Refreshed installed packages tree view');
    }
  }

  // Show toast notification
  this.showToast(params.packageId, results);
}
```

**Key Points**:
- Only invalidate cache if at least one project succeeded
- Use glob pattern `installed:*` to clear all related caches
- Tree view refresh shows newly installed packages immediately
- Cache invalidation is async but don't await (fire and forget)

**See**: [§E: Cache Management](#e-cache-management)

---

### 6. Tree View Refresh

Trigger tree view refresh via the `InstalledPackagesProvider.refresh()` method (injected via constructor):

```typescript
if (this.installedPackagesProvider) {
  this.installedPackagesProvider.refresh();
}
```

**Key Points**:
- Provider is optional (may not be available during tests)
- Refresh is synchronous - triggers `onDidChangeTreeData` event
- VS Code handles the actual tree re-rendering

**See**: [§F: Tree View Integration](#f-tree-view-integration)

---

### 7. Webview Responses

Send structured response to webview with per-project results:

```typescript
// This is typically called from a webview message handler, not the command directly
// Example webview message handler in package browser webview:
async handleInstallPackage(message: InstallPackageRequest): Promise<void> {
  const result = await vscode.commands.executeCommand<InstallPackageResult>(
    InstallPackageCommand.id,
    {
      packageId: message.packageId,
      version: message.version,
      projectPaths: message.projectPaths
    }
  );

  // Send response back to webview
  this.postMessage({
    type: 'response',
    id: message.id,
    success: result.success,
    result: {
      packageId: message.packageId,
      version: message.version,
      results: result.results
    }
  });
}
```

**Key Points**:
- Command returns structured result, webview message handler sends IPC response
- Per-project results allow webview to show detailed status
- Response includes original package ID and version for context

**See**: [§G: Webview IPC Protocol](#g-webview-ipc-protocol)

---

### 8. Toast Notifications

Show appropriate toast based on installation results:

```typescript
private showToast(packageId: string, results: ProjectInstallResult[]): void {
  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;

  if (successCount === 0) {
    // Total failure
    const firstError = results.find(r => !r.success)?.error || 'Unknown error';
    vscode.window.showErrorMessage(
      `Failed to install package: ${firstError}`,
      'View Logs'
    ).then(action => {
      if (action === 'View Logs') {
        this.logger.show();
      }
    });
  } else if (successCount === totalCount) {
    // Total success
    const message = totalCount === 1
      ? `Package installed`
      : `Package installed to ${totalCount} projects`;
    vscode.window.showInformationMessage(message);
  } else {
    // Partial success
    const failCount = totalCount - successCount;
    vscode.window.showWarningMessage(
      `Package installed to ${successCount} of ${totalCount} projects (${failCount} failed)`,
      'View Logs'
    ).then(action => {
      if (action === 'View Logs') {
        this.logger.show();
      }
    });
  }
}
```

**Key Points**:
- Error toast for total failure with "View Logs" action
- Info toast for total success (singular/plural grammar)
- Warning toast for partial failure with counts
- All error/warning toasts offer "View Logs" action

**See**: [§H: User Notifications](#h-user-notifications)

---

### 9. Logging

Comprehensive logging at all key points:

```typescript
// At command start
this.logger.info(
  `Install command invoked: ${params.packageId} v${params.version} to ${params.projectPaths.length} project(s)`
);

// Per-project success
this.logger.info(
  `Successfully installed ${packageId} to ${path.basename(projectPath)}`
);

// Per-project failure
this.logger.error(
  `Failed to install ${packageId} to ${path.basename(projectPath)}: ${result.error?.message}`
);

// Cancellation
this.logger.info(
  `Installation cancelled (${completedCount}/${totalCount} projects completed)`
);

// Cache invalidation
this.logger.debug('Invalidated installed package cache');

// Tree view refresh
this.logger.debug('Refreshed installed packages tree view');

// Final summary
this.logger.info(
  `Install operation completed: ${successCount}/${totalCount} projects succeeded`
);
```

**Key Points**:
- Use `info` for normal flow, `error` for failures, `debug` for internal actions
- Include package ID, version, and project name in all logs
- Log both individual project results and final summary
- Structured log format enables filtering and analysis

**See**: [§I: Logging Strategy](#i-logging-strategy)

---

### 10. Unit Tests

**File**: `src/commands/__tests__/installPackageCommand.test.ts`

Focus on validation logic, orchestration, and error handling without actual CLI execution.

```typescript
import { describe, expect, test, mock } from 'bun:test';
import { InstallPackageCommand } from '../installPackageCommand';

describe('InstallPackageCommand', () => {
  const mockLogger = {
    info: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {})
  };

  const mockProvider = {
    installPackage: mock(async () => ({ success: true }))
  };

  const mockProviderService = {
    getProvider: () => mockProvider
  };

  test('validates required packageId', async () => {
    const cmd = new InstallPackageCommand(mockProviderService as any, mockLogger as any);
    
    await expect(
      cmd.execute({ packageId: '', version: '1.0.0', projectPaths: ['test.csproj'] })
    ).rejects.toThrow('packageId is required');
  });

  test('validates required version', async () => {
    const cmd = new InstallPackageCommand(mockProviderService as any, mockLogger as any);
    
    await expect(
      cmd.execute({ packageId: 'Newtonsoft.Json', version: '', projectPaths: ['test.csproj'] })
    ).rejects.toThrow('version is required');
  });

  test('validates non-empty projectPaths', async () => {
    const cmd = new InstallPackageCommand(mockProviderService as any, mockLogger as any);
    
    await expect(
      cmd.execute({ packageId: 'Newtonsoft.Json', version: '1.0.0', projectPaths: [] })
    ).rejects.toThrow('at least one project path is required');
  });

  test('validates project file extension', async () => {
    const cmd = new InstallPackageCommand(mockProviderService as any, mockLogger as any);
    
    await expect(
      cmd.execute({ packageId: 'Newtonsoft.Json', version: '1.0.0', projectPaths: ['invalid.txt'] })
    ).rejects.toThrow('.csproj');
  });

  test('calls domain provider for single project', async () => {
    const cmd = new InstallPackageCommand(mockProviderService as any, mockLogger as any);
    mockProvider.installPackage.mockClear();

    const result = await cmd.execute({
      packageId: 'Newtonsoft.Json',
      version: '13.0.3',
      projectPaths: ['MyApp.csproj']
    });

    expect(mockProvider.installPackage).toHaveBeenCalledTimes(1);
    expect(mockProvider.installPackage).toHaveBeenCalledWith({
      packageId: 'Newtonsoft.Json',
      version: '13.0.3',
      projectPath: 'MyApp.csproj'
    });
    expect(result.success).toBe(true);
  });

  test('calls domain provider sequentially for multiple projects', async () => {
    const cmd = new InstallPackageCommand(mockProviderService as any, mockLogger as any);
    mockProvider.installPackage.mockClear();

    await cmd.execute({
      packageId: 'Serilog',
      version: '3.1.1',
      projectPaths: ['App1.csproj', 'App2.csproj', 'App3.csproj']
    });

    expect(mockProvider.installPackage).toHaveBeenCalledTimes(3);
  });

  test('collects per-project results on partial failure', async () => {
    const mockFailingProvider = {
      installPackage: mock(async ({ projectPath }) => {
        if (projectPath === 'App2.csproj') {
          return { success: false, error: { code: 'NotFound', message: 'Package not found' } };
        }
        return { success: true };
      })
    };

    const cmd = new InstallPackageCommand(
      { getProvider: () => mockFailingProvider } as any,
      mockLogger as any
    );

    const result = await cmd.execute({
      packageId: 'Test',
      version: '1.0.0',
      projectPaths: ['App1.csproj', 'App2.csproj', 'App3.csproj']
    });

    expect(result.success).toBe(false);
    expect(result.results).toHaveLength(3);
    expect(result.results[0].success).toBe(true);
    expect(result.results[1].success).toBe(false);
    expect(result.results[1].error).toContain('Package not found');
    expect(result.results[2].success).toBe(true);
  });

  test('logs install start, per-project results, and completion', async () => {
    const cmd = new InstallPackageCommand(mockProviderService as any, mockLogger as any);
    mockLogger.info.mockClear();

    await cmd.execute({
      packageId: 'Newtonsoft.Json',
      version: '13.0.3',
      projectPaths: ['MyApp.csproj']
    });

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Install command invoked')
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Successfully installed')
    );
  });

  test('does not invalidate cache on total failure', async () => {
    const mockFailProvider = {
      installPackage: mock(async () => ({ success: false, error: { code: 'Error', message: 'Fail' } })),
      invalidateCache: mock(async () => {})
    };

    const cmd = new InstallPackageCommand(
      { getProvider: () => mockFailProvider } as any,
      mockLogger as any
    );

    await cmd.execute({
      packageId: 'Test',
      version: '1.0.0',
      projectPaths: ['App.csproj']
    });

    expect(mockFailProvider.invalidateCache).not.toHaveBeenCalled();
  });

  test('invalidates cache on partial success', async () => {
    const mockMixedProvider = {
      installPackage: mock(async ({ projectPath }) => {
        return projectPath === 'App1.csproj'
          ? { success: true }
          : { success: false, error: { code: 'Error', message: 'Fail' } };
      }),
      invalidateCache: mock(async () => {})
    };

    const cmd = new InstallPackageCommand(
      { getProvider: () => mockMixedProvider } as any,
      mockLogger as any
    );

    await cmd.execute({
      packageId: 'Test',
      version: '1.0.0',
      projectPaths: ['App1.csproj', 'App2.csproj']
    });

    expect(mockMixedProvider.invalidateCache).toHaveBeenCalledWith('installed:*');
  });

  test('refreshes tree view on successful install', async () => {
    const mockTreeView = {
      refresh: mock(() => {})
    };

    const cmd = new InstallPackageCommand(
      mockProviderService as any,
      mockLogger as any,
      mockTreeView as any
    );

    await cmd.execute({
      packageId: 'Newtonsoft.Json',
      version: '13.0.3',
      projectPaths: ['MyApp.csproj']
    });

    expect(mockTreeView.refresh).toHaveBeenCalled();
  });
});
```

**Key Tests**:
- Parameter validation (empty/invalid inputs)
- Single vs. multi-project invocation
- Partial failure handling
- Cache invalidation logic (success/failure/partial)
- Tree view refresh triggering
- Logging at key points

**See**: [§J: Test Coverage Requirements](#j-test-coverage-requirements)

---

### 11. Integration Tests

**File**: `test/integration/installPackage.integration.test.ts`

Test end-to-end flow with real domain provider but mocked CLI executor.

```typescript
import { describe, expect, test, beforeEach } from 'bun:test';
import { InstallPackageCommand } from '../../src/commands/installPackageCommand';
import { NuGetDomainProvider } from '../../src/env/node/nugetDomainProvider';

describe('InstallPackageCommand Integration', () => {
  let command: InstallPackageCommand;
  let mockExecutor: any;

  beforeEach(() => {
    mockExecutor = {
      execute: async (cmd: string) => {
        if (cmd.includes('dotnet add')) {
          return { exitCode: 0, stdout: 'Successfully added package', stderr: '' };
        }
        throw new Error('Unexpected command');
      }
    };

    const provider = new NuGetDomainProvider(mockExecutor, logger);
    const providerService = { getProvider: () => provider };
    command = new InstallPackageCommand(providerService, logger);
  });

  test('installs package and returns success result', async () => {
    const result = await command.execute({
      packageId: 'Newtonsoft.Json',
      version: '13.0.3',
      projectPaths: ['test/fixtures/TestProject/TestProject.csproj']
    });

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(true);
  });

  test('handles CLI error and returns failure result', async () => {
    mockExecutor.execute = async () => ({
      exitCode: 1,
      stdout: '',
      stderr: 'error NU1102: Unable to find package'
    });

    const result = await command.execute({
      packageId: 'NonExistent.Package',
      version: '1.0.0',
      projectPaths: ['test/fixtures/TestProject/TestProject.csproj']
    });

    expect(result.success).toBe(false);
    expect(result.results[0].error).toContain('Unable to find package');
  });

  test('executes multi-project install sequentially', async () => {
    const executionOrder: string[] = [];
    mockExecutor.execute = async (cmd: string) => {
      const match = cmd.match(/add\s+([^\s]+)\s+package/);
      if (match) {
        executionOrder.push(match[1]);
      }
      return { exitCode: 0, stdout: 'Success', stderr: '' };
    };

    await command.execute({
      packageId: 'Serilog',
      version: '3.1.1',
      projectPaths: ['App1.csproj', 'App2.csproj', 'App3.csproj']
    });

    expect(executionOrder).toEqual(['App1.csproj', 'App2.csproj', 'App3.csproj']);
  });
});
```

**Key Tests**:
- Successful installation with real provider
- CLI error handling and result parsing
- Sequential multi-project execution order
- Cache invalidation side effects

**See**: [§K: Integration Test Strategy](#k-integration-test-strategy)

---

### 12. Command Registration

**File**: `src/extension.ts`

Register command during extension activation:

```typescript
import { InstallPackageCommand } from './commands/installPackageCommand';

export function activate(context: vscode.ExtensionContext) {
  // ... existing setup

  // Create logger
  const logger = createLogger(context);

  // Create domain provider service
  const domainProviderService = new DomainProviderService();
  
  // Create tree view provider
  const installedPackagesProvider = new InstalledPackagesProvider(domainProviderService, logger);

  // Register install package command
  const installPackageCommand = new InstallPackageCommand(
    domainProviderService,
    logger,
    installedPackagesProvider
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      InstallPackageCommand.id,
      (params) => installPackageCommand.execute(params)
    )
  );

  logger.info('InstallPackageCommand registered (internal only)');
}
```

**Key Points**:
- Command registered **only** in `extension.ts` via `registerCommand` (not in package.json)
- **Internal command** - only invoked programmatically by webview, never by users
- Tree view provider injected for refresh capability
- Command added to subscriptions for proper disposal
- Users access installation via `opm.openPackageBrowser` webview, which then invokes this command

**See**: [§L: Command Registration](#l-command-registration)

---

## Additional Context Sections

### A. Parameter Validation

Validate all required parameters and reject invalid inputs early. Since this command is **only invoked by the webview** (a trusted internal source), validation focuses on defensive programming rather than user input sanitization:

```typescript
private validateParams(params: InstallPackageParams): void {
  if (!params.packageId || params.packageId.trim() === '') {
    throw new Error('packageId is required');
  }

  if (!params.version || params.version.trim() === '') {
    throw new Error('version is required');
  }

  if (!params.projectPaths || params.projectPaths.length === 0) {
    throw new Error('at least one project path is required');
  }

  // Validate all paths are .csproj files
  for (const projectPath of params.projectPaths) {
    if (!projectPath.toLowerCase().endsWith('.csproj')) {
      throw new Error(`Invalid project path: ${projectPath} (must be .csproj file)`);
    }
  }

  // Note: We don't validate file existence here - let the domain provider handle that
  // This allows for better error messages from the CLI executor
}
```

**Validation Philosophy**:
- **Webview controls the flow** - All parameters are populated by the webview UI, which already validates user selections
- **Defensive checks** - Validation here prevents programming errors (e.g., webview bugs), not malicious input
- **Fail fast** - Throw immediately on invalid params to prevent wasted work
- **Domain-level validation** - File existence and compatibility checks happen in domain provider with better error context

### B. Progress Reporting

Use VS Code's progress API with cancellation support:

```typescript
await vscode.window.withProgress(
  {
    location: vscode.ProgressLocation.Notification,
    title: `Installing ${params.packageId}`,
    cancellable: true
  },
  async (progress, token) => {
    // Progress.report() accepts:
    // - message: shown next to title
    // - increment: percentage (0-100) of work completed
    
    progress.report({
      message: `to ${projectName} (${i + 1}/${params.projectPaths.length})...`,
      increment: (100 / params.projectPaths.length)
    });
  }
);
```

Progress increments by `100 / projectCount` per project. Message shows current project and count.

### C. Error Handling

Layer error handling at multiple levels:

1. **Validation errors**: Thrown immediately, caught by command executor
2. **Domain provider errors**: Returned as `DomainResult` with structured error codes
3. **Unexpected errors**: Caught per-project, logged, returned as failure result

Never let exceptions bubble to VS Code command executor - always return structured results.

### D. Cancellation Handling

Cancellation preserves completed work:

```typescript
if (token.isCancellationRequested) {
  this.logger.info(
    `Installation cancelled (${results.length}/${params.projectPaths.length} projects completed)`
  );
  break; // Exit loop, don't throw
}
```

Already-completed installations remain in the results array. Cache is still invalidated if any succeeded.

### E. Cache Management

Cache invalidation uses glob patterns for flexibility:

```typescript
// Current pattern: invalidate all installed package caches
await provider.invalidateCache('installed:*');

// Future patterns could be more specific:
// await provider.invalidateCache(`installed:${projectPath}`);
```

Cache invalidation is fire-and-forget (don't await in production, but do in tests).

### F. Tree View Integration

Tree view provider must implement `refresh()` method:

```typescript
export class InstalledPackagesProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined); // undefined = refresh entire tree
  }
}
```

Command calls `refresh()`, tree view fires event, VS Code re-renders tree.

### G. Webview IPC Protocol

Webview sends request, command executes, handler sends response:

```typescript
// Webview → Host request
{
  type: 'request',
  id: 'uuid-123',
  name: 'installPackage',
  args: {
    packageId: 'Newtonsoft.Json',
    version: '13.0.3',
    projectPaths: ['MyApp.csproj']
  }
}

// Host → Webview response
{
  type: 'response',
  id: 'uuid-123',
  success: true,
  result: {
    packageId: 'Newtonsoft.Json',
    version: '13.0.3',
    results: [
      { projectPath: 'MyApp.csproj', success: true }
    ]
  }
}
```

Command doesn't handle IPC directly - webview message handler does.

### H. User Notifications

Toast severity mapping:

- **Error**: Total failure (0 projects succeeded)
- **Warning**: Partial failure (some projects succeeded)
- **Info**: Total success (all projects succeeded)

All error/warning toasts offer "View Logs" action.

### I. Logging Strategy

Log levels:
- `debug`: Internal state changes (cache invalidation, tree refresh)
- `info`: User-initiated actions and successful operations
- `error`: Failures and exceptions

Include contextual data (package ID, version, project name) in all log messages for filtering.

### J. Test Coverage Requirements

**Unit tests must cover**:
- All validation rules
- Single/multi-project orchestration
- Partial failure scenarios
- Cache invalidation logic (success/failure/partial)
- Tree view refresh triggering
- Logging at key points

**Integration tests must cover**:
- End-to-end flow with real provider
- CLI error handling and parsing
- Sequential execution order
- Side effect verification (cache, tree view)

### K. Integration Test Strategy

Integration tests use:
- Real domain provider implementation
- Mocked CLI executor (controlled responses)
- Real command orchestration logic
- Test fixtures for project files

This validates the integration between command and domain layers without requiring dotnet CLI.

### L. Command Registration

Command registration pattern:

```typescript
vscode.commands.registerCommand(
  CommandClass.id,
  (params) => commandInstance.execute(params)
)
```

Arrow function ensures `this` context is preserved in command class. Params are passed directly from `executeCommand` calls.

---

## Implementation Notes

- Command is a thin orchestrator - all business logic belongs in domain provider
- Progress notifications must be cancellable per VS Code UX guidelines
- Sequential execution prevents NuGet package cache race conditions
- Cache invalidation only on success prevents stale data in tree view
- Partial failures are not rollbacks - completed work is preserved
- Toast messages must handle singular/plural grammar for user-friendly messaging
- All async operations use proper error handling with structured results
- Logging provides audit trail for debugging and support

## Testing Checklist

- [ ] Validates empty packageId
- [ ] Validates empty version
- [ ] Validates empty projectPaths array
- [ ] Validates project file extensions
- [ ] Calls provider once per project
- [ ] Collects per-project results
- [ ] Handles partial failures correctly
- [ ] Invalidates cache only on success
- [ ] Refreshes tree view on success
- [ ] Shows correct toast for total success
- [ ] Shows correct toast for total failure
- [ ] Shows correct toast for partial failure
- [ ] Logs install start
- [ ] Logs per-project results
- [ ] Logs completion summary
- [ ] Handles cancellation gracefully
- [ ] Preserves completed work on cancellation

## Dependencies

- `vscode` API for progress notifications and commands
- `DomainProviderService` for provider access
- `ILogger` for operation logging
- `InstalledPackagesProvider` for tree view refresh (optional)
- Domain provider `installPackage` method implementation
- Domain provider `invalidateCache` method implementation

## Related Stories

- [STORY-001-02-001a](../stories/STORY-001-02-001a-solution-discovery.md) - Provides project discovery for validation
- [STORY-001-02-004](../stories/STORY-001-02-004-dotnet-add-package.md) - Domain provider implementation
- [STORY-001-02-005](../stories/STORY-001-02-005-cli-output-parser.md) - CLI result parsing
- [STORY-001-00-002](../stories/STORY-001-00-002-logger-service.md) - Logging infrastructure
