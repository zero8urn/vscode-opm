# IMPL-001-03-001-uninstall-single

**Story**: [STORY-001-03-001-uninstall-single](../stories/STORY-001-03-001-uninstall-single.md)  
**Feature**: [FEAT-001-03-manage-packages](../features/FEAT-001-03-manage-packages.md)  
**Created**: 2026-01-25  
**Status**: Ready for Implementation

## High-Level Summary

Implement package uninstallation from a single project by creating `UninstallPackageCommand`, extending `PackageCliService` with `removePackage()` method, and updating webview UI button logic to show "Uninstall" when all selected projects have the package installed. This implementation mirrors the install command infrastructure (IMPL-001-02-006) but executes `dotnet remove package` instead of `dotnet add package`, providing consistent progress feedback, cache invalidation, and error handling for package removal operations.

The command is **internal-only** (not registered in package.json) and invoked exclusively by the Package Browser webview through IPC when users select installed projects and click the "Uninstall" button. The UI dynamically adapts button labels based on installation state, showing "Install" for uninstalled projects and "Uninstall" for installed projects.

## Todo List

- [Create UninstallPackageCommand class](#1-command-structure)
- [Extend PackageCliService with removePackage method](#2-cli-service-extension)
- [Implement single-project uninstall flow](#3-single-project-flow)
- [Add progress notifications with cancellation](#4-progress-cancellation)
- [Implement cache invalidation on success](#5-cache-invalidation)
- [Trigger tree view refresh](#6-tree-view-refresh)
- [Add webview IPC integration](#7-webview-ipc-integration)
- [Implement toast notifications](#8-toast-notifications)
- [Update project-selector button logic](#9-project-selector-ui)
- [Add comprehensive logging](#10-logging)
- [Write unit tests](#11-unit-tests)
- [Write integration tests](#12-integration-tests)
- [Write E2E tests](#13-e2e-tests)
- [Register command in extension activation](#14-command-registration)

---

## Detailed Implementation Sections

### 1. Command Structure

**File**: `src/commands/uninstallPackageCommand.ts`

Create command class mirroring `InstallPackageCommand` pattern with typed parameters and result interfaces.

```typescript
export interface UninstallPackageParams {
  packageId: string;
  projectPaths: string[];
}

export interface UninstallPackageResult {
  success: boolean;
  results: ProjectUninstallResult[];
}

export interface ProjectUninstallResult {
  projectPath: string;
  success: boolean;
  error?: string;
}

export class UninstallPackageCommand {
  static readonly id = 'opm.uninstallPackage';

  constructor(
    private readonly domainProviderService: DomainProviderService,
    private readonly logger: ILogger,
    private readonly installedPackagesProvider?: InstalledPackagesProvider,
  ) {}

  async execute(params: UninstallPackageParams): Promise<UninstallPackageResult> {
    // Implementation follows in subsequent sections
  }

  private validateParams(params: UninstallPackageParams): void {
    // Validation logic
  }

  private async uninstallFromProject(
    provider: DomainProvider,
    packageId: string,
    projectPath: string,
  ): Promise<ProjectUninstallResult> {
    // Single-project uninstall logic
  }

  private async handlePostUninstall(params: UninstallPackageParams, results: ProjectUninstallResult[]): Promise<void> {
    // Cache invalidation and tree view refresh
  }

  private showToast(packageId: string, results: ProjectUninstallResult[]): void {
    // User notifications
  }
}
```

**Key Points**:

- No `version` parameter needed (uninstall removes regardless of version)
- Same constructor DI pattern as install command
- Result interface tracks per-project success/failure
- Static `id` for command registration

**See**: [§A: Parameter Validation](#a-parameter-validation)

---

### 2. CLI Service Extension

**File**: `src/services/cli/packageCliService.ts`

Add `removePackage()` method to execute `dotnet remove package` command.

```typescript
export class PackageCliService {
  // ... existing methods (addPackage, etc.)

  async removePackage(packageId: string, projectPath: string): Promise<DomainResult<void>> {
    this.logger.debug(`Executing dotnet remove package: ${packageId} from ${projectPath}`);

    const args = ['remove', projectPath, 'package', packageId];

    try {
      const result = await this.cliExecutor.execute('dotnet', args);

      if (result.exitCode === 0) {
        this.logger.info(`Successfully removed ${packageId} from ${path.basename(projectPath)}`);
        return { success: true, result: undefined };
      }

      // Parse CLI error output to determine error type
      const error = this.parseRemovePackageError(result.stderr || result.stdout);
      this.logger.error(`Failed to remove ${packageId}: ${error.message}`, result.stderr);

      return { success: false, error };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Exception during dotnet remove: ${message}`, error);

      return {
        success: false,
        error: {
          code: 'CliExecutionError',
          message: `Failed to execute dotnet remove: ${message}`,
        },
      };
    }
  }

  private parseRemovePackageError(output: string): DomainError {
    // Log full CLI error for debugging
    this.logger.debug('Parsing CLI error output', output);

    // Check for known error patterns
    if (output.includes('NU1103') || output.includes('Unable to find package')) {
      return {
        code: 'NotFound',
        message: 'Package not found in project',
      };
    }

    if (output.includes('NU1107') || output.includes('required by')) {
      // Extract dependency information from CLI output
      // Example: "error NU1107: Package 'Foo' is required by 'Bar' (v1.0.0), 'Baz' (v2.3.4)"
      const dependentPackages = this.extractDependentPackages(output);

      return {
        code: 'DependencyConflict',
        message:
          dependentPackages.length > 0
            ? `Package is required by: ${dependentPackages.join(', ')}`
            : 'Package is required by other packages',
        details: output, // Full CLI output for detailed error view
      };
    }

    if (output.includes('Access is denied') || output.includes('permission')) {
      return {
        code: 'PermissionDenied',
        message: 'Permission denied. Project file may be read-only.',
      };
    }

    // Generic error - preserve full message for user
    return {
      code: 'UninstallFailed',
      message: output || 'Failed to uninstall package',
    };
  }

  private extractDependentPackages(cliOutput: string): string[] {
    // Parse CLI output to extract package names
    // Example formats:
    // "error NU1107: Version conflict detected for Package.Foo. Package.Bar requires Package.Foo (>= 1.0.0)."
    // "Package 'Microsoft.Extensions.Logging.Abstractions' is required by 'Microsoft.Extensions.Logging'"

    const dependents: string[] = [];

    // Pattern 1: "required by 'PackageName'"
    const requiredByPattern = /required by ['"]([^'"]+)['"]/gi;
    let match;
    while ((match = requiredByPattern.exec(cliOutput)) !== null) {
      dependents.push(match[1]);
    }

    // Pattern 2: "Package.Name requires" or "Package.Name (version) requires"
    const requiresPattern = /([A-Za-z0-9_.]+)(?:\s+\([^\)]+\))?\s+requires/gi;
    while ((match = requiresPattern.exec(cliOutput)) !== null) {
      const pkg = match[1];
      if (!dependents.includes(pkg)) {
        dependents.push(pkg);
      }
    }

    return dependents;
  }
}
```

**Key Points**:

- CLI command: `dotnet remove <PROJECT> package <PACKAGE_ID>`
- No version parameter (removes any installed version)
- Parse stderr/stdout for specific error codes
- Return `DomainResult<void>` (no data on success)
- Map CLI errors to domain error codes (NotFound, DependencyConflict, PermissionDenied)

**See**: [§B: CLI Error Parsing](#b-cli-error-parsing)

---

### 3. Single-Project Flow

Implement core uninstallation logic with progress feedback.

```typescript
async execute(params: UninstallPackageParams): Promise<UninstallPackageResult> {
  // Validate inputs
  this.validateParams(params);

  this.logger.info(
    `Uninstall command invoked: ${params.packageId} from ${params.projectPaths.length} project(s)`
  );

  // Get domain provider
  const provider = this.domainProviderService.getProvider();
  if (!provider) {
    throw new Error('Domain provider not initialized');
  }

  const results: ProjectUninstallResult[] = [];

  // Execute with progress
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Uninstalling ${params.packageId}`,
      cancellable: true
    },
    async (progress, token) => {
      for (let i = 0; i < params.projectPaths.length; i++) {
        if (token.isCancellationRequested) {
          this.logger.info(
            `Uninstall cancelled (${i}/${params.projectPaths.length} projects completed)`
          );
          break;
        }

        const projectPath = params.projectPaths[i];
        const projectName = path.basename(projectPath, '.csproj');

        // Update progress
        progress.report({
          message: `from ${projectName} (${i + 1}/${params.projectPaths.length})...`,
          increment: (100 / params.projectPaths.length)
        });

        // Execute uninstallation for single project
        const result = await this.uninstallFromProject(
          provider,
          params.packageId,
          projectPath
        );

        results.push(result);
      }
    }
  );

  // Handle post-uninstall actions
  await this.handlePostUninstall(params, results);

  const successCount = results.filter(r => r.success).length;
  this.logger.info(
    `Uninstall operation completed: ${successCount}/${results.length} projects succeeded`
  );

  return {
    success: results.every(r => r.success),
    results
  };
}
```

**Key Points**:

- Same progress notification pattern as install
- Progress message: "from ProjectName (1/3)..."
- Sequential execution with cancellation support
- Post-uninstall hook for cache invalidation and UI refresh

**See**: [§C: Progress Reporting](#c-progress-reporting)

---

### 4. Progress & Cancellation

Implement single-project uninstall with error handling.

```typescript
private async uninstallFromProject(
  provider: DomainProvider,
  packageId: string,
  projectPath: string
): Promise<ProjectUninstallResult> {
  this.logger.info(
    `Uninstalling ${packageId} from ${projectPath}`
  );

  try {
    // Domain provider must implement removePackage method
    const result = await provider.removePackage({
      packageId,
      projectPath
    });

    if (result.success) {
      this.logger.info(
        `Successfully uninstalled ${packageId} from ${path.basename(projectPath)}`
      );
      return { projectPath, success: true };
    } else {
      // Log full error details (including CLI output) for debugging
      this.logger.error(
        `Failed to uninstall ${packageId} from ${path.basename(projectPath)}: ${result.error?.message}`,
        result.error?.details // Full CLI error output logged for troubleshooting
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
      `Exception uninstalling ${packageId} from ${path.basename(projectPath)}: ${message}`
    );
    return { projectPath, success: false, error: message };
  }
}
```

**Key Points**:

- Provider delegates to `PackageCliService.removePackage()`
- Per-project try/catch prevents cascade failures
- Structured error handling with `DomainResult<void>`
- Detailed logging for debugging

**See**: [§D: Error Handling](#d-error-handling)

---

### 5. Cache Invalidation

Invalidate installed package cache on successful uninstallation.

```typescript
private async handlePostUninstall(
  params: UninstallPackageParams,
  results: ProjectUninstallResult[]
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

- Only invalidate if at least one uninstall succeeded
- Same cache pattern as install (`installed:*` glob)
- Tree view refresh shows package removed immediately
- Toast feedback regardless of cache invalidation

**See**: [§E: Cache Management](#e-cache-management)

---

### 6. Tree View Refresh

Tree view refresh uses existing `InstalledPackagesProvider` infrastructure.

```typescript
// Already implemented in InstalledPackagesProvider
export class InstalledPackagesProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }
}
```

**Key Points**:

- Provider injected via constructor (optional for testability)
- Refresh is synchronous, triggers VS Code re-render
- Same pattern as install command (reuse existing)

**See**: [§F: Tree View Integration](#f-tree-view-integration)

---

### 7. Webview IPC Integration

Add uninstall message types and handler integration.

**File**: `src/webviews/apps/packageBrowser/types.ts`

```typescript
// Add to WebviewMessage union type
export type WebviewMessage =
  | { type: 'searchPackages'; query: string; skip?: number }
  | { type: 'installPackage'; packageId: string; version: string; projectPaths: string[] }
  | { type: 'uninstallPackage'; packageId: string; projectPaths: string[] } // NEW
  | { type: 'getInstalledVersions'; projectPaths: string[] };

// Add response type
export interface UninstallPackageResponse {
  packageId: string;
  success: boolean;
  results: Array<{
    projectPath: string;
    success: boolean;
    error?: string;
  }>;
}
```

**File**: `src/webviews/apps/packageBrowser/packageBrowser.ts` (message handler)

```typescript
async handleUninstallPackage(message: { packageId: string; projectPaths: string[] }): Promise<void> {
  const result = await vscode.commands.executeCommand<UninstallPackageResult>(
    'opm.uninstallPackage',
    {
      packageId: message.packageId,
      projectPaths: message.projectPaths
    }
  );

  // Send response back to webview
  this.postMessage({
    type: 'uninstallPackageResponse',
    success: result.success,
    packageId: message.packageId,
    results: result.results
  });

  // Trigger project list refresh (re-fetch installed packages)
  this.postMessage({ type: 'projectsChanged' });
}
```

**Key Points**:

- New `uninstallPackage` IPC message type
- Handler invokes command, sends response back
- Triggers `projectsChanged` notification for UI refresh
- Same pattern as install IPC flow

**See**: [§G: Webview IPC Protocol](#g-webview-ipc-protocol)

---

### 8. Toast Notifications

Show appropriate feedback based on uninstall results.

```typescript
private showToast(packageId: string, results: ProjectUninstallResult[]): void {
  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;

  if (successCount === 0) {
    // Total failure
    const firstError = results.find(r => !r.success)?.error || 'Unknown error';
    vscode.window.showErrorMessage(
      `Failed to uninstall ${packageId}: ${firstError}`,
      'View Logs'
    ).then(action => {
      if (action === 'View Logs') {
        this.logger.show();
      }
    });
  } else if (successCount === totalCount) {
    // Total success
    const projectWord = totalCount === 1 ? 'project' : 'projects';
    const message = totalCount === 1
      ? `Uninstalled ${packageId}`
      : `Uninstalled ${packageId} from ${totalCount} ${projectWord}`;
    vscode.window.showInformationMessage(message);
  } else {
    // Partial success
    const failCount = totalCount - successCount;
    vscode.window.showWarningMessage(
      `Uninstalled ${packageId} from ${successCount} of ${totalCount} projects (${failCount} failed)`,
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

- Error toast for total failure with "View Logs"
- Info toast for success (singular/plural grammar)
- Warning toast for partial failure with counts
- Consistent with install command notifications

**See**: [§H: User Notifications](#h-user-notifications)

---

### 9. Project Selector UI

**File**: `src/webviews/apps/packageBrowser/components/project-selector.ts`

Update button label logic to detect installation state.

```typescript
@customElement(PROJECT_SELECTOR_TAG)
export class ProjectSelector extends LitElement {
  @property({ type: Array }) projects: ProjectInfo[] = [];
  @property({ type: Array }) selectedProjects: string[] = [];
  @property({ type: String }) packageId!: string;
  @property({ type: String }) selectedVersion!: string;
  @property({ type: Object }) installedVersions: Map<string, string> = new Map();

  // Compute whether all selected projects have the package installed
  private get allSelectedInstalled(): boolean {
    if (this.selectedProjects.length === 0) return false;

    return this.selectedProjects.every(projectPath => this.installedVersions.has(projectPath));
  }

  // Compute whether any selected project has the package installed
  private get anySelectedInstalled(): boolean {
    return this.selectedProjects.some(projectPath => this.installedVersions.has(projectPath));
  }

  // Determine button action and label
  private get buttonAction(): 'install' | 'uninstall' | 'mixed' | 'none' {
    if (this.selectedProjects.length === 0) return 'none';

    const allInstalled = this.allSelectedInstalled;
    const anyInstalled = this.anySelectedInstalled;

    if (allInstalled) return 'uninstall';
    if (!anyInstalled) return 'install';
    return 'mixed'; // Some installed, some not (future: handle in multi-project story)
  }

  private get buttonLabel(): string {
    const count = this.selectedProjects.length;
    const projectWord = count === 1 ? 'project' : 'projects';

    switch (this.buttonAction) {
      case 'install':
        return `Install to ${count} ${projectWord}`;
      case 'uninstall':
        return `Uninstall from ${count} ${projectWord}`;
      case 'mixed':
        return 'Mixed selection'; // Disabled state
      case 'none':
        return 'Select projects';
    }
  }

  private handleButtonClick() {
    if (this.buttonAction === 'install') {
      this.dispatchEvent(
        new CustomEvent('install-package', {
          detail: {
            packageId: this.packageId,
            version: this.selectedVersion,
            projectPaths: this.selectedProjects,
          },
          bubbles: true,
          composed: true,
        }),
      );
    } else if (this.buttonAction === 'uninstall') {
      this.dispatchEvent(
        new CustomEvent('uninstall-package', {
          detail: {
            packageId: this.packageId,
            projectPaths: this.selectedProjects,
          },
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  render() {
    return html`
      <div class="project-selector">
        <!-- Project checkboxes -->
        ${this.renderProjectList()}

        <!-- Action button -->
        <button
          class=${this.buttonAction === 'uninstall' ? 'secondary' : 'primary'}
          ?disabled=${this.buttonAction === 'none' || this.buttonAction === 'mixed'}
          @click=${this.handleButtonClick}
        >
          ${this.buttonLabel}
        </button>
      </div>
    `;
  }
}
```

**Key Points**:

- Check `installedVersions` map to determine installation state
- Show "Uninstall" only when ALL selected projects have package installed
- Use secondary button styling for uninstall (destructive action)
- Dispatch `uninstall-package` custom event (bubbles to packageBrowser)
- Disable button for mixed selections (future enhancement)

**See**: [§I: UI Button Logic](#i-ui-button-logic)

---

### 10. Logging

Add comprehensive logging throughout uninstall flow.

```typescript
// Command start
this.logger.info(`Uninstall command invoked: ${params.packageId} from ${params.projectPaths.length} project(s)`);

// Per-project success
this.logger.info(`Successfully uninstalled ${packageId} from ${path.basename(projectPath)}`);

// Per-project failure
this.logger.error(`Failed to uninstall ${packageId} from ${path.basename(projectPath)}: ${result.error?.message}`);

// Cancellation
this.logger.info(`Uninstall cancelled (${completedCount}/${totalCount} projects completed)`);

// Cache invalidation
this.logger.debug('Invalidated installed package cache');

// Tree view refresh
this.logger.debug('Refreshed installed packages tree view');

// Final summary
this.logger.info(`Uninstall operation completed: ${successCount}/${totalCount} projects succeeded`);
```

**Key Points**:

- Use `info` for user actions, `error` for failures, `debug` for internal
- Include package ID and project name in all logs
- Log both individual results and final summary

**See**: [§J: Logging Strategy](#j-logging-strategy)

---

### 11. Unit Tests

**File**: `src/commands/__tests__/uninstallPackageCommand.test.ts`

Test validation, orchestration, and error handling.

```typescript
import { describe, expect, test, mock } from 'bun:test';
import { UninstallPackageCommand } from '../uninstallPackageCommand';

describe('UninstallPackageCommand', () => {
  const mockLogger = {
    info: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
    show: mock(() => {}),
  };

  const mockProvider = {
    removePackage: mock(async () => ({ success: true, result: undefined })),
    invalidateCache: mock(async () => {}),
  };

  const mockProviderService = {
    getProvider: () => mockProvider,
  };

  test('validates required packageId', async () => {
    const cmd = new UninstallPackageCommand(mockProviderService as any, mockLogger as any);

    await expect(cmd.execute({ packageId: '', projectPaths: ['test.csproj'] })).rejects.toThrow(
      'packageId is required',
    );
  });

  test('validates non-empty projectPaths', async () => {
    const cmd = new UninstallPackageCommand(mockProviderService as any, mockLogger as any);

    await expect(cmd.execute({ packageId: 'Newtonsoft.Json', projectPaths: [] })).rejects.toThrow(
      'at least one project path is required',
    );
  });

  test('validates project file extension', async () => {
    const cmd = new UninstallPackageCommand(mockProviderService as any, mockLogger as any);

    await expect(cmd.execute({ packageId: 'Newtonsoft.Json', projectPaths: ['invalid.txt'] })).rejects.toThrow(
      '.csproj',
    );
  });

  test('calls domain provider removePackage with correct parameters', async () => {
    const cmd = new UninstallPackageCommand(mockProviderService as any, mockLogger as any);
    mockProvider.removePackage.mockClear();

    const result = await cmd.execute({
      packageId: 'Newtonsoft.Json',
      projectPaths: ['MyApp.csproj'],
    });

    expect(mockProvider.removePackage).toHaveBeenCalledTimes(1);
    expect(mockProvider.removePackage).toHaveBeenCalledWith({
      packageId: 'Newtonsoft.Json',
      projectPath: 'MyApp.csproj',
    });
    expect(result.success).toBe(true);
  });

  test('handles partial failure correctly', async () => {
    const mockFailingProvider = {
      removePackage: mock(async ({ projectPath }) => {
        if (projectPath === 'App2.csproj') {
          return {
            success: false,
            error: { code: 'NotFound', message: 'Package not found in project' },
          };
        }
        return { success: true, result: undefined };
      }),
      invalidateCache: mock(async () => {}),
    };

    const cmd = new UninstallPackageCommand({ getProvider: () => mockFailingProvider } as any, mockLogger as any);

    const result = await cmd.execute({
      packageId: 'Test',
      projectPaths: ['App1.csproj', 'App2.csproj', 'App3.csproj'],
    });

    expect(result.success).toBe(false);
    expect(result.results).toHaveLength(3);
    expect(result.results[0].success).toBe(true);
    expect(result.results[1].success).toBe(false);
    expect(result.results[1].error).toContain('Package not found');
    expect(result.results[2].success).toBe(true);
  });

  test('invalidates cache on successful uninstall', async () => {
    const cmd = new UninstallPackageCommand(mockProviderService as any, mockLogger as any);
    mockProvider.invalidateCache.mockClear();

    await cmd.execute({
      packageId: 'Newtonsoft.Json',
      projectPaths: ['MyApp.csproj'],
    });

    expect(mockProvider.invalidateCache).toHaveBeenCalledWith('installed:*');
  });

  test('does not invalidate cache on total failure', async () => {
    const mockFailProvider = {
      removePackage: mock(async () => ({
        success: false,
        error: { code: 'Error', message: 'Fail' },
      })),
      invalidateCache: mock(async () => {}),
    };

    const cmd = new UninstallPackageCommand({ getProvider: () => mockFailProvider } as any, mockLogger as any);

    await cmd.execute({
      packageId: 'Test',
      projectPaths: ['App.csproj'],
    });

    expect(mockFailProvider.invalidateCache).not.toHaveBeenCalled();
  });

  test('refreshes tree view on successful uninstall', async () => {
    const mockTreeView = {
      refresh: mock(() => {}),
    };

    const cmd = new UninstallPackageCommand(mockProviderService as any, mockLogger as any, mockTreeView as any);

    await cmd.execute({
      packageId: 'Newtonsoft.Json',
      projectPaths: ['MyApp.csproj'],
    });

    expect(mockTreeView.refresh).toHaveBeenCalled();
  });

  test('logs uninstall start, per-project results, and completion', async () => {
    const cmd = new UninstallPackageCommand(mockProviderService as any, mockLogger as any);
    mockLogger.info.mockClear();

    await cmd.execute({
      packageId: 'Newtonsoft.Json',
      projectPaths: ['MyApp.csproj'],
    });

    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Uninstall command invoked'));
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully uninstalled'));
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Uninstall operation completed'));
  });

  test('logs full error details including CLI output', async () => {
    const mockFailProvider = {
      removePackage: mock(async () => ({
        success: false,
        error: {
          code: 'DependencyConflict',
          message: 'Package is required by: PackageA, PackageB',
          details: 'error NU1107: Full CLI output with dependency info...',
        },
      })),
    };

    const cmd = new UninstallPackageCommand({ getProvider: () => mockFailProvider } as any, mockLogger as any);

    await cmd.execute({
      packageId: 'Test',
      projectPaths: ['App.csproj'],
    });

    // Verify logger.error was called with both message and details
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Package is required by: PackageA, PackageB'),
      'error NU1107: Full CLI output with dependency info...',
    );
  });
});
```

**Additional Unit Tests for CLI Service**:

**File**: `src/services/cli/__tests__/packageCliService.test.ts`

```typescript
import { describe, expect, test } from 'bun:test';
import { PackageCliService } from '../packageCliService';

describe('PackageCliService - removePackage error parsing', () => {
  test('extracts dependent packages from NU1107 error', () => {
    const cliOutput = `
      error NU1107: Version conflict detected for Microsoft.Extensions.Logging.Abstractions.
      Microsoft.Extensions.Logging (>= 8.0.0) requires Microsoft.Extensions.Logging.Abstractions (>= 8.0.0)
      Serilog.Extensions.Logging (>= 3.1.0) requires Microsoft.Extensions.Logging.Abstractions (>= 2.0.0)
    `;

    const service = new PackageCliService(mockExecutor, mockLogger);
    const error = (service as any).parseRemovePackageError(cliOutput);

    expect(error.code).toBe('DependencyConflict');
    expect(error.message).toContain('Microsoft.Extensions.Logging');
    expect(error.message).toContain('Serilog.Extensions.Logging');
    expect(error.details).toBe(cliOutput);
  });

  test('extracts packages from "required by" pattern', () => {
    const cliOutput = `
      Package 'Microsoft.Extensions.Logging.Abstractions' is required by 'Microsoft.Extensions.Logging'
    `;

    const service = new PackageCliService(mockExecutor, mockLogger);
    const error = (service as any).parseRemovePackageError(cliOutput);

    expect(error.code).toBe('DependencyConflict');
    expect(error.message).toContain('Microsoft.Extensions.Logging');
    expect(error.details).toBe(cliOutput);
  });

  test('handles dependency conflict with no extractable packages', () => {
    const cliOutput = 'error NU1107: Dependency conflict detected';

    const service = new PackageCliService(mockExecutor, mockLogger);
    const error = (service as any).parseRemovePackageError(cliOutput);

    expect(error.code).toBe('DependencyConflict');
    expect(error.message).toBe('Package is required by other packages');
    expect(error.details).toBe(cliOutput);
  });

  test('logs debug message when parsing CLI error', () => {
    const mockLogger = {
      debug: mock(() => {}),
      info: mock(() => {}),
      error: mock(() => {}),
    };

    const service = new PackageCliService(mockExecutor, mockLogger as any);
    (service as any).parseRemovePackageError('some error');

    expect(mockLogger.debug).toHaveBeenCalledWith('Parsing CLI error output', 'some error');
  });
});
```

**See**: [§K: Test Coverage Requirements](#k-test-coverage-requirements)

---

### 12. Integration Tests

**File**: `test/integration/uninstallPackage.integration.test.ts`

Test end-to-end flow with real CLI execution.

```typescript
import { describe, expect, test, beforeEach } from 'bun:test';
import { UninstallPackageCommand } from '../../src/commands/uninstallPackageCommand';
import { NuGetDomainProvider } from '../../src/env/node/nugetDomainProvider';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

describe('UninstallPackageCommand Integration', () => {
  test('executes dotnet remove package command', async () => {
    const mockExecutor = {
      execute: async (cmd: string, args: string[]) => {
        expect(cmd).toBe('dotnet');
        expect(args[0]).toBe('remove');
        expect(args[2]).toBe('package');
        expect(args[3]).toBe('Newtonsoft.Json');

        return { exitCode: 0, stdout: 'Successfully removed package', stderr: '' };
      },
    };

    const provider = new NuGetDomainProvider(mockExecutor, logger);
    const providerService = { getProvider: () => provider };
    const command = new UninstallPackageCommand(providerService, logger);

    const result = await command.execute({
      packageId: 'Newtonsoft.Json',
      projectPaths: ['test/fixtures/TestProject/TestProject.csproj'],
    });

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(true);
  });

  test('handles CLI error and returns failure result', async () => {
    const mockExecutor = {
      execute: async () => ({
        exitCode: 1,
        stdout: '',
        stderr: 'error NU1103: Unable to find package Newtonsoft.Json in the project',
      }),
    };

    const provider = new NuGetDomainProvider(mockExecutor, logger);
    const providerService = { getProvider: () => provider };
    const command = new UninstallPackageCommand(providerService, logger);

    const result = await command.execute({
      packageId: 'Newtonsoft.Json',
      projectPaths: ['test/fixtures/TestProject/TestProject.csproj'],
    });

    expect(result.success).toBe(false);
    expect(result.results[0].error).toContain('Unable to find package');
  });

  test('executes multi-project uninstall sequentially', async () => {
    const executionOrder: string[] = [];
    const mockExecutor = {
      execute: async (cmd: string, args: string[]) => {
        const projectPath = args[1];
        executionOrder.push(projectPath);
        return { exitCode: 0, stdout: 'Success', stderr: '' };
      },
    };

    const provider = new NuGetDomainProvider(mockExecutor, logger);
    const providerService = { getProvider: () => provider };
    const command = new UninstallPackageCommand(providerService, logger);

    await command.execute({
      packageId: 'Serilog',
      projectPaths: ['App1.csproj', 'App2.csproj', 'App3.csproj'],
    });

    expect(executionOrder).toEqual(['App1.csproj', 'App2.csproj', 'App3.csproj']);
  });

  test('parses dependency conflict error correctly', async () => {
    const mockExecutor = {
      execute: async () => ({
        exitCode: 1,
        stdout: '',
        stderr:
          'error NU1107: Version conflict detected for Microsoft.Extensions.Logging.Abstractions. ' +
          'Microsoft.Extensions.Logging (>= 8.0.0) requires Microsoft.Extensions.Logging.Abstractions (>= 8.0.0) ' +
          'Serilog.Extensions.Logging (>= 3.1.0) requires Microsoft.Extensions.Logging.Abstractions (>= 2.0.0)',
      }),
    };

    const provider = new NuGetDomainProvider(mockExecutor, logger);
    const providerService = { getProvider: () => provider };
    const command = new UninstallPackageCommand(providerService, logger);

    const result = await command.execute({
      packageId: 'Microsoft.Extensions.Logging.Abstractions',
      projectPaths: ['App.csproj'],
    });

    expect(result.success).toBe(false);
    expect(result.results[0].error).toContain('Package is required by');
    expect(result.results[0].error).toContain('Microsoft.Extensions.Logging');
    expect(result.results[0].error).toContain('Serilog.Extensions.Logging');
  });

  test('parses dependency conflict with single dependency', async () => {
    const mockExecutor = {
      execute: async () => ({
        exitCode: 1,
        stdout: '',
        stderr: "Package 'Foo.Abstractions' is required by 'Foo.Core'",
      }),
    };

    const provider = new NuGetDomainProvider(mockExecutor, logger);
    const providerService = { getProvider: () => provider };
    const command = new UninstallPackageCommand(providerService, logger);

    const result = await command.execute({
      packageId: 'Foo.Abstractions',
      projectPaths: ['App.csproj'],
    });

    expect(result.success).toBe(false);
    expect(result.results[0].error).toContain('Package is required by: Foo.Core');
  });

    const result = await command.execute({
      packageId: 'Microsoft.Extensions.Logging.Abstractions',
      projectPaths: ['App.csproj'],
    });

    expect(result.success).toBe(false);
    expect(result.results[0].error).toContain('required by other packages');
  });
});
```

**See**: [§L: Integration Test Strategy](#l-integration-test-strategy)

---

### 13. E2E Tests

**File**: `test/e2e/uninstallPackage.e2e.ts`

Test command registration and execution within VS Code Extension Host.

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';
import { UninstallPackageCommand } from '../../src/commands/uninstallPackageCommand';

suite('Uninstall Package E2E', () => {
  test('Command is registered', async function () {
    this.timeout(5000);

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes(UninstallPackageCommand.id), 'opm.uninstallPackage command should be registered');
  });

  test('Command executes without error', async function () {
    this.timeout(10000);

    // This test verifies command can be invoked
    // Actual uninstall is mocked to prevent modifying test fixtures
    try {
      await vscode.commands.executeCommand(UninstallPackageCommand.id, {
        packageId: 'Newtonsoft.Json',
        projectPaths: [], // Empty to trigger validation error
      });
      assert.fail('Should have thrown validation error');
    } catch (error) {
      assert.ok(
        error instanceof Error && error.message.includes('at least one project'),
        'Should throw validation error for empty projectPaths',
      );
    }
  });

  test('Command validates parameters', async function () {
    this.timeout(5000);

    try {
      await vscode.commands.executeCommand(UninstallPackageCommand.id, {
        packageId: '',
        projectPaths: ['test.csproj'],
      });
      assert.fail('Should have thrown validation error');
    } catch (error) {
      assert.ok(error instanceof Error && error.message.includes('packageId is required'), 'Should validate packageId');
    }
  });
});
```

**Key Points**:

- Test command registration in Extension Host
- Test parameter validation
- Test execution flow (with mocked provider)
- Use `suite()` and `test()` (Mocha convention, NOT `describe()`/`it()`)
- Set explicit timeouts for VS Code operations

**See**: [§M: E2E Test Guidelines](#m-e2e-test-guidelines)

---

### 14. Command Registration

**File**: `src/extension.ts`

Register command during activation (internal-only, not in package.json).

```typescript
import { UninstallPackageCommand } from './commands/uninstallPackageCommand';

export function activate(context: vscode.ExtensionContext) {
  // ... existing setup

  // Create services
  const logger = createLogger(context);
  const domainProviderService = new DomainProviderService();
  const installedPackagesProvider = new InstalledPackagesProvider(domainProviderService, logger);

  // Register uninstall package command (internal only)
  const uninstallPackageCommand = new UninstallPackageCommand(domainProviderService, logger, installedPackagesProvider);

  context.subscriptions.push(
    vscode.commands.registerCommand(UninstallPackageCommand.id, params => uninstallPackageCommand.execute(params)),
  );

  logger.info('UninstallPackageCommand registered (internal only)');
}
```

**Key Points**:

- Register with `vscode.commands.registerCommand` (NOT in package.json)
- Internal command - only invoked by webview IPC
- Same DI pattern as install command
- Add to subscriptions for cleanup

**See**: [§N: Command Registration](#n-command-registration)

---

## Additional Context Sections

### A. Parameter Validation

Validate inputs to prevent invalid operations.

```typescript
private validateParams(params: UninstallPackageParams): void {
  if (!params.packageId || params.packageId.trim() === '') {
    throw new Error('packageId is required');
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
}
```

**Note**: No version validation needed (uninstall removes any installed version).

---

### B. CLI Error Parsing

Map dotnet CLI errors to domain error codes for actionable feedback. The parsing strategy extracts specific dependency information from NuGet error messages to provide users with actionable guidance.

| CLI Error Pattern                   | Error Code           | User Message                                                      | Details Field            |
| ----------------------------------- | -------------------- | ----------------------------------------------------------------- | ------------------------ |
| `NU1103` / "Unable to find package" | `NotFound`           | "Package not found in project"                                    | N/A                      |
| `NU1107` / "required by"            | `DependencyConflict` | "Package is required by: PackageA, PackageB" (extracted from CLI) | Full CLI output for logs |
| "Access is denied" / "permission"   | `PermissionDenied`   | "Permission denied. Project file may be read-only."               | N/A                      |
| Generic failure                     | `UninstallFailed`    | Full CLI output message                                           | N/A                      |

**Dependency Conflict Parsing**:

The `extractDependentPackages()` method uses regex patterns to extract package names from CLI output:

- **Pattern 1**: `required by 'PackageName'` → Extracts "PackageName"
- **Pattern 2**: `Package.Name requires` → Extracts "Package.Name"

Example CLI error:

```
error NU1107: Version conflict detected for Microsoft.Extensions.Logging.Abstractions.
  Microsoft.Extensions.Logging (>= 8.0.0) requires Microsoft.Extensions.Logging.Abstractions (>= 8.0.0)
  Serilog.Extensions.Logging (>= 3.1.0) requires Microsoft.Extensions.Logging.Abstractions (>= 2.0.0)
```

Parsed message shown to user:

```
"Package is required by: Microsoft.Extensions.Logging, Serilog.Extensions.Logging"
```

**Logging Strategy**:

- **User-facing message**: Concise, actionable (shows extracted package names)
- **Logged details**: Full CLI output in `error.details` field for debugging
- **Logger call**: `logger.error(message, error.details)` logs both message and full CLI output

This ensures users see actionable information in toasts/UI while developers can view full CLI output in logs for troubleshooting.

---

### C. Progress Reporting

Progress messages use same pattern as install:

```typescript
progress.report({
  message: `from ${projectName} (${i + 1}/${total})...`,
  increment: 100 / total,
});
```

Title: "Uninstalling PackageName"  
Message: "from MyApp.Web (1/3)..."

---

### D. Error Handling

Three-layer error handling:

1. **Validation errors**: Thrown immediately, caught by VS Code
2. **Domain errors**: Returned as `DomainResult`, logged and reported
3. **Unexpected errors**: Caught per-project, logged, returned as failure

Never throw from `execute()` after validation - always return structured result.

---

### E. Cache Management

Cache invalidation only on success:

```typescript
if (anySuccess) {
  await provider.invalidateCache('installed:*');
}
```

Glob pattern `installed:*` clears all installed package caches across all projects.

---

### F. Tree View Integration

Tree view refresh is optional (may not exist during tests):

```typescript
if (this.installedPackagesProvider) {
  this.installedPackagesProvider.refresh();
}
```

Refresh fires `onDidChangeTreeData` event, VS Code re-queries tree.

---

### G. Webview IPC Protocol

**Request** (Webview → Host):

```typescript
{
  type: 'uninstallPackage',
  packageId: 'Newtonsoft.Json',
  projectPaths: ['MyApp.csproj']
}
```

**Response** (Host → Webview):

```typescript
{
  type: 'uninstallPackageResponse',
  packageId: 'Newtonsoft.Json',
  success: true,
  results: [
    { projectPath: 'MyApp.csproj', success: true }
  ]
}
```

**Notification** (Host → Webview):

```typescript
{
  type: 'projectsChanged';
}
```

---

### H. User Notifications

Toast message mapping:

| Scenario                    | Severity | Message                                                   | Actions   |
| --------------------------- | -------- | --------------------------------------------------------- | --------- |
| Total failure (0 succeeded) | Error    | "Failed to uninstall PackageName: [error]"                | View Logs |
| Total success               | Info     | "Uninstalled PackageName from N projects"                 | None      |
| Partial failure             | Warning  | "Uninstalled PackageName from N of M projects (X failed)" | View Logs |

---

### I. UI Button Logic

Button state decision tree:

```
selectedProjects.length === 0 → Disable, label: "Select projects"
allSelectedInstalled === true → Show "Uninstall from N projects" (secondary)
allSelectedInstalled === false → Show "Install to N projects" (primary)
Mixed (some installed, some not) → Disable, label: "Mixed selection" (future)
```

---

### J. Logging Strategy

Log at these points:

- Command invocation (info)
- Per-project start (info)
- Per-project success (info)
- Per-project failure (error)
- Cancellation (info)
- Cache invalidation (debug)
- Tree view refresh (debug)
- Final summary (info)

---

### K. Test Coverage Requirements

**Unit tests must cover**:

- Parameter validation (empty packageId, empty projectPaths, invalid extensions)
- Single/multi-project orchestration
- Partial failure scenarios
- Cache invalidation logic (success/failure/partial)
- Tree view refresh triggering
- Toast notification logic (success/failure/partial)

**Integration tests must cover**:

- Real CLI execution with mocked executor
- Error parsing (NotFound, DependencyConflict, PermissionDenied)
- Sequential execution order
- Cache invalidation side effects

**E2E tests must cover**:

- Command registration verification
- Parameter validation in Extension Host
- Command execution flow (basic)

---

### L. Integration Test Strategy

Integration tests validate:

- Command → Provider → CLI service integration
- CLI error parsing and domain error mapping
- Sequential execution guarantees
- Cache invalidation triggers

Use mocked CLI executor for deterministic results.

---

### M. E2E Test Guidelines

E2E tests in VS Code Extension Host:

- Use `suite()` and `test()` (Mocha), NOT `describe()`/`it()`
- Set explicit timeouts: `this.timeout(5000)`
- Test command registration, not business logic
- Test validation errors (easy to trigger)
- Mock domain provider to avoid real CLI calls
- DO NOT test webview DOM (no access from Extension Host)

---

### N. Command Registration

Registration pattern:

```typescript
vscode.commands.registerCommand(UninstallPackageCommand.id, params => uninstallPackageCommand.execute(params));
```

**Internal command** - NOT in package.json contributions.  
Only invoked programmatically by webview via IPC.

---

## Implementation Notes

- Mirror install command infrastructure for consistency
- Uninstall requires no version parameter (removes any installed version)
- CLI command: `dotnet remove <PROJECT> package <PACKAGE_ID>`
- Sequential execution prevents race conditions
- Cache invalidation only on success
- Tree view refresh shows removal immediately
- Button uses secondary styling (destructive action indicator)
- Webview fetches installed versions on panel open to populate UI state
- Mixed selections (some installed, some not) disabled in this story (future: STORY-001-03-002)

## Testing Checklist

- [ ] Validates empty packageId
- [ ] Validates empty projectPaths array
- [ ] Validates project file extensions
- [ ] Calls provider.removePackage with correct params
- [ ] Collects per-project results
- [ ] Handles partial failures correctly
- [ ] Invalidates cache only on success
- [ ] Refreshes tree view on success
- [ ] Shows correct toast for total success
- [ ] Shows correct toast for total failure
- [ ] Shows correct toast for partial failure
- [ ] Logs uninstall start, per-project results, completion
- [ ] Logs full CLI error output in error.details field
- [ ] Handles cancellation gracefully
- [ ] Preserves completed work on cancellation
- [ ] CLI service parses NotFound error correctly
- [ ] CLI service parses DependencyConflict error correctly
- [ ] CLI service extracts dependent package names from NU1107 errors
- [ ] CLI service extracts dependent packages from "required by" pattern
- [ ] CLI service includes full CLI output in error.details for dependency conflicts
- [ ] CLI service handles dependency conflict with no extractable packages gracefully
- [ ] CLI service logs debug message when parsing CLI errors
- [ ] CLI service parses PermissionDenied error correctly
- [ ] User-facing error message shows extracted package names (not full CLI output)
- [ ] Logger.error receives both user message and full CLI output details
- [ ] Project selector shows "Uninstall" when all selected installed
- [ ] Project selector shows "Install" when none selected installed
- [ ] Webview sends uninstallPackage IPC message
- [ ] Host sends uninstallPackageResponse back to webview
- [ ] Host sends projectsChanged notification after uninstall

## Dependencies

- `vscode` API for progress notifications and commands
- `DomainProviderService` for provider access
- `ILogger` for operation logging
- `InstalledPackagesProvider` for tree view refresh (optional)
- `PackageCliService.removePackage()` method (NEW - implement in this story)
- Domain provider `removePackage()` method (NEW - add to interface)
- Domain provider `invalidateCache()` method (existing)
- Webview `project-selector` component (extend with button logic)
- Webview IPC types (extend with uninstallPackage messages)

## Related Stories

- [STORY-001-02-006](../stories/STORY-001-02-006-install-command.md) - Install command infrastructure (reuse pattern)
- [STORY-001-02-010](../stories/STORY-001-02-010-cache-invalidation.md) - Cache invalidation mechanism
- [STORY-001-02-002](../stories/STORY-001-02-002-project-selection-ui.md) - Project selector component
- [STORY-001-03-002](../stories/STORY-001-03-002-uninstall-multi.md) - Multi-project uninstall (extends this)
- [STORY-001-03-006](../stories/STORY-001-03-006-dependency-warnings.md) - Dependency warnings (hooks into this)
