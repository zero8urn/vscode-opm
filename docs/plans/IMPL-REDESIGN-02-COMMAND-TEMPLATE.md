# IMPL-REDESIGN-02: Command Template Method

> **Phase 2 of 6** — Eliminate 70% code duplication in package commands using Template Method pattern

**Status:** Planning  
**Priority:** P1  
**Estimated Effort:** 2 weeks  
**Risk Level:** Medium  
**Dependencies:** Phase 1 (Foundation)

---

## Overview

### Objectives

1. Extract shared command workflow into `PackageOperationCommand<TParams, TResult>` abstract base
2. Refactor `InstallPackageCommand` and `UninstallPackageCommand` as subclasses
3. Reduce command code from 644 LOC → 240 LOC (63% reduction)
4. Prove extensibility by creating `UpdatePackageCommand` in ~40 LOC

### Success Criteria

- ✅ Install/uninstall commands share zero duplicated code
- ✅ All existing command tests pass unchanged
- ✅ New `UpdatePackageCommand` works end-to-end
- ✅ 63% LOC reduction achieved
- ✅ Command execution behavior byte-for-byte identical

### Key Metrics

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Install command LOC | 328 | 60 | -82% |
| Uninstall command LOC | 316 | 60 | -81% |
| Duplicated LOC | ~300 | 0 | -100% |
| Base class LOC | 0 | 120 | +120 |
| **Total LOC** | **644** | **240** | **-63%** |

---

## Implementation Steps

### Step 1: Design Abstract Base Class

**File:** `src/commands/base/packageOperationCommand.ts`

**Template Method Pattern:**

```typescript
/**
 * Abstract base class for package operations (install, uninstall, update).
 * Implements Template Method pattern to eliminate duplication.
 * 
 * @template TParams - Command parameter type
 * @template TOperationResult - CLI operation result type
 * 
 * @example
 * ```typescript
 * class InstallPackageCommand extends PackageOperationCommand<InstallParams, AddPackageResult> {
 *   static readonly id = 'opm.installPackage';
 *   
 *   protected validate(params: InstallParams): Result<ValidatedInstallParams> {
 *     if (!params.packageId) return fail({ code: 'Validation', message: 'Package ID required' });
 *     return ok({ packageId: params.packageId, version: params.version, projectPaths: params.projectPaths });
 *   }
 *   
 *   protected async executeOnProject(projectPath: string, params: ValidatedInstallParams): Promise<Result<AddPackageResult>> {
 *     return this.cliService.addPackage({ projectPath, packageId: params.packageId, version: params.version });
 *   }
 *   
 *   protected getProgressTitle(params: ValidatedInstallParams): string {
 *     return `Installing ${params.packageId} v${params.version}`;
 *   }
 *   
 *   protected getProjectMessage(projectPath: string, params: ValidatedInstallParams): string {
 *     return `Adding ${params.packageId} to ${path.basename(projectPath)}`;
 *   }
 * }
 * ```
 */

import type { Result, AppError } from '../../core/result';
import type { IPackageCliService } from '../../domain/packageCliService';
import type { ILogger } from '../../services/loggerService';
import type { IDotnetProjectParser } from '../../services/cli/dotnetProjectParser';
import { batchProcess } from '../../utils/batchProcessor';

export interface IProgressReporter {
  withProgress<T>(
    options: { title: string },
    task: (progress: { report: (value: { message?: string }) => void }) => Promise<T>,
  ): Promise<T>;
}

export interface OperationSummary {
  readonly successCount: number;
  readonly failureCount: number;
  readonly results: OperationResult[];
}

export interface OperationResult {
  readonly projectPath: string;
  readonly success: boolean;
  readonly error?: AppError;
}

/**
 * Abstract base implementing the Template Method pattern.
 * Defines the skeleton algorithm; subclasses fill in operation-specific steps.
 */
export abstract class PackageOperationCommand<TParams, TOperationResult> {
  constructor(
    protected readonly cliService: IPackageCliService,
    protected readonly logger: ILogger,
    protected readonly projectParser: IDotnetProjectParser,
    protected readonly progressReporter: IProgressReporter,
  ) {}

  /**
   * Template method: the fixed algorithm.
   * Subclasses do NOT override this.
   */
  async execute(params: TParams): Promise<OperationSummary> {
    // Step 1: Validate parameters (hook method)
    const validated = this.validate(params);
    if (!validated.success) {
      return this.failWith(validated.error);
    }

    // Step 2: Extract and deduplicate project paths
    const projects = this.extractProjects(validated.value);
    const uniqueProjects = this.deduplicateProjects(projects);

    if (uniqueProjects.length === 0) {
      return { successCount: 0, failureCount: 0, results: [] };
    }

    // Step 3: Execute with progress reporting
    return this.progressReporter.withProgress(
      { title: this.getProgressTitle(validated.value) },
      async progress => {
        // Step 4: Batch process projects (3 concurrent max)
        const results = await batchProcess(uniqueProjects, 3, async projectPath => {
          progress.report({ message: this.getProjectMessage(projectPath, validated.value) });
          return this.executeOnProject(projectPath, validated.value);
        });

        // Step 5: Invalidate caches for successful operations
        await this.invalidateCaches(uniqueProjects, results);

        // Step 6: Build summary
        return this.buildSummary(results, uniqueProjects);
      },
    );
  }

  // ============================================================================
  // Abstract hooks (subclasses MUST implement)
  // ============================================================================

  /**
   * Validate and transform raw params to validated params.
   * @returns Result with validated params or validation error
   */
  protected abstract validate(params: TParams): Result<any, AppError>;

  /**
   * Execute the operation on a single project.
   * @param projectPath - Absolute path to .csproj file
   * @param params - Validated parameters
   * @returns Result of the CLI operation
   */
  protected abstract executeOnProject(projectPath: string, params: any): Promise<Result<TOperationResult, AppError>>;

  /**
   * Get progress dialog title.
   * @param params - Validated parameters
   * @returns Title string (e.g., "Installing Newtonsoft.Json v13.0.1")
   */
  protected abstract getProgressTitle(params: any): string;

  /**
   * Get per-project progress message.
   * @param projectPath - Current project being processed
   * @param params - Validated parameters
   * @returns Message string (e.g., "Adding Newtonsoft.Json to MyProject.csproj")
   */
  protected abstract getProjectMessage(projectPath: string, params: any): string;

  // ============================================================================
  // Concrete helper methods (shared implementation)
  // ============================================================================

  private extractProjects(params: any): string[] {
    // All commands have projectPaths array
    return (params as { projectPaths: string[] }).projectPaths || [];
  }

  private deduplicateProjects(paths: string[]): string[] {
    // Normalize to absolute paths and remove duplicates
    const normalized = paths.map(p => p.replace(/\\/g, '/').toLowerCase());
    const unique = [...new Set(normalized)];
    return paths.filter((_, i) => unique.includes(normalized[i]));
  }

  private async invalidateCaches(projects: string[], results: Result<TOperationResult, AppError>[]): Promise<void> {
    // Invalidate project parser cache for successful operations
    for (let i = 0; i < projects.length; i++) {
      if (results[i].success) {
        this.projectParser.invalidateCache(projects[i]);
      }
    }
  }

  private buildSummary(results: Result<TOperationResult, AppError>[], projects: string[]): OperationSummary {
    const operationResults: OperationResult[] = results.map((result, i) => ({
      projectPath: projects[i],
      success: result.success,
      error: result.success ? undefined : result.error,
    }));

    return {
      successCount: operationResults.filter(r => r.success).length,
      failureCount: operationResults.filter(r => !r.success).length,
      results: operationResults,
    };
  }

  private failWith(error: AppError): OperationSummary {
    this.logger.error('Command validation failed', error);
    return {
      successCount: 0,
      failureCount: 1,
      results: [{ projectPath: '', success: false, error }],
    };
  }
}
```

**Tests:** `src/commands/base/__tests__/packageOperationCommand.test.ts`

```typescript
import { describe, test, expect, mock } from 'bun:test';
import { PackageOperationCommand } from '../packageOperationCommand';
import { ok, fail, type Result, type AppError } from '../../../core/result';

// Test implementation
class TestCommand extends PackageOperationCommand<{ id: string; projectPaths: string[] }, string> {
  validate(params: { id: string; projectPaths: string[] }): Result<{ id: string; projectPaths: string[] }, AppError> {
    if (!params.id) return fail({ code: 'Validation', message: 'ID required' });
    return ok(params);
  }

  async executeOnProject(projectPath: string, params: { id: string }): Promise<Result<string, AppError>> {
    return ok(`Success: ${params.id} on ${projectPath}`);
  }

  getProgressTitle(params: { id: string }): string {
    return `Processing ${params.id}`;
  }

  getProjectMessage(projectPath: string, params: { id: string }): string {
    return `${params.id} → ${projectPath}`;
  }
}

describe('PackageOperationCommand (Template Method)', () => {
  test('executes template method workflow', async () => {
    const mockCli = {} as any;
    const mockLogger = { error: mock() } as any;
    const mockParser = { invalidateCache: mock() } as any;
    const mockProgress = {
      withProgress: async (_opts: any, task: any) => task({ report: mock() }),
    } as any;

    const command = new TestCommand(mockCli, mockLogger, mockParser, mockProgress);
    const result = await command.execute({ id: 'test', projectPaths: ['a.csproj'] });

    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(0);
    expect(mockParser.invalidateCache).toHaveBeenCalledWith('a.csproj');
  });

  test('deduplicates project paths', async () => {
    const mockCli = {} as any;
    const mockLogger = { error: mock() } as any;
    const mockParser = { invalidateCache: mock() } as any;
    const mockProgress = {
      withProgress: async (_opts: any, task: any) => task({ report: mock() }),
    } as any;

    const command = new TestCommand(mockCli, mockLogger, mockParser, mockProgress);
    const result = await command.execute({
      id: 'test',
      projectPaths: ['a.csproj', 'A.csproj', 'a.csproj'], // Duplicates
    });

    expect(result.successCount).toBe(1); // Only processed once
  });

  test('handles validation failure', async () => {
    const mockCli = {} as any;
    const mockLogger = { error: mock() } as any;
    const mockParser = { invalidateCache: mock() } as any;
    const mockProgress = { withProgress: mock() } as any;

    const command = new TestCommand(mockCli, mockLogger, mockParser, mockProgress);
    const result = await command.execute({ id: '', projectPaths: [] });

    expect(result.successCount).toBe(0);
    expect(result.failureCount).toBe(1);
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
```

**Acceptance Criteria:**
- [ ] Base class ~120 LOC
- [ ] 10 unit tests for template method execution
- [ ] Abstract methods clearly documented
- [ ] TypeScript generic constraints correct

---

### Step 2: Refactor InstallPackageCommand

**File:** `src/commands/installPackageCommand.ts`

**Before:** 328 LOC with duplicated validation, batching, progress, caching  
**After:** ~60 LOC implementing only install-specific logic

```typescript
import * as path from 'node:path';
import { PackageOperationCommand } from './base/packageOperationCommand';
import { ok, fail, type Result, type AppError } from '../core/result';
import type { AddPackageResult } from '../services/cli/packageCliService';

export interface InstallParams {
  packageId: string;
  version: string;
  projectPaths: string[];
  source?: string;
  prerelease?: boolean;
}

interface ValidatedInstallParams {
  packageId: string;
  version: string;
  projectPaths: string[];
  source?: string;
  prerelease?: boolean;
}

export class InstallPackageCommand extends PackageOperationCommand<InstallParams, AddPackageResult> {
  static readonly id = 'opm.installPackage';

  protected validate(params: InstallParams): Result<ValidatedInstallParams, AppError> {
    if (!params.packageId || params.packageId.trim() === '') {
      return fail({ code: 'Validation', message: 'Package ID is required', field: 'packageId' });
    }
    if (!params.version || params.version.trim() === '') {
      return fail({ code: 'Validation', message: 'Version is required', field: 'version' });
    }
    if (!params.projectPaths || params.projectPaths.length === 0) {
      return fail({ code: 'Validation', message: 'At least one project path is required', field: 'projectPaths' });
    }
    // Validate .csproj extension
    const invalidProjects = params.projectPaths.filter(p => !p.endsWith('.csproj'));
    if (invalidProjects.length > 0) {
      return fail({
        code: 'Validation',
        message: `Invalid project paths (must end with .csproj): ${invalidProjects.join(', ')}`,
        field: 'projectPaths',
      });
    }

    return ok({
      packageId: params.packageId.trim(),
      version: params.version.trim(),
      projectPaths: params.projectPaths,
      source: params.source,
      prerelease: params.prerelease,
    });
  }

  protected async executeOnProject(
    projectPath: string,
    params: ValidatedInstallParams,
  ): Promise<Result<AddPackageResult, AppError>> {
    return this.cliService.addPackage({
      projectPath,
      packageId: params.packageId,
      version: params.version,
      source: params.source,
      prerelease: params.prerelease,
    });
  }

  protected getProgressTitle(params: ValidatedInstallParams): string {
    return `Installing ${params.packageId} v${params.version}`;
  }

  protected getProjectMessage(projectPath: string, params: ValidatedInstallParams): string {
    return `Adding ${params.packageId} to ${path.basename(projectPath)}`;
  }
}

// Factory function for DI
export function createInstallPackageCommand(
  cliService: any,
  logger: any,
  projectParser: any,
  progressReporter: any,
): InstallPackageCommand {
  return new InstallPackageCommand(cliService, logger, projectParser, progressReporter);
}
```

**Acceptance Criteria:**
- [ ] ~60 LOC (down from 328)
- [ ] All existing install command tests pass
- [ ] Behavior byte-for-byte identical
- [ ] No code duplication with uninstall

---

### Step 3: Refactor UninstallPackageCommand

**File:** `src/commands/uninstallPackageCommand.ts`

**Similar refactor:** ~60 LOC implementing only uninstall-specific logic

```typescript
export class UninstallPackageCommand extends PackageOperationCommand<UninstallParams, RemovePackageResult> {
  static readonly id = 'opm.uninstallPackage';

  protected validate(params: UninstallParams): Result<ValidatedUninstallParams, AppError> {
    // Validation logic (no version required for uninstall)
    if (!params.packageId || params.packageId.trim() === '') {
      return fail({ code: 'Validation', message: 'Package ID is required', field: 'packageId' });
    }
    // ... rest of validation
    return ok({ packageId: params.packageId.trim(), projectPaths: params.projectPaths });
  }

  protected async executeOnProject(
    projectPath: string,
    params: ValidatedUninstallParams,
  ): Promise<Result<RemovePackageResult, AppError>> {
    return this.cliService.removePackage({
      projectPath,
      packageId: params.packageId,
    });
  }

  protected getProgressTitle(params: ValidatedUninstallParams): string {
    return `Uninstalling ${params.packageId}`;
  }

  protected getProjectMessage(projectPath: string, params: ValidatedUninstallParams): string {
    return `Removing ${params.packageId} from ${path.basename(projectPath)}`;
  }
}
```

**Acceptance Criteria:**
- [ ] ~60 LOC (down from 316)
- [ ] All existing uninstall command tests pass
- [ ] Behavior byte-for-byte identical
- [ ] No code duplication with install

---

### Step 4: Update Tests

**Unit Tests:** Update mocks for base class dependencies

```typescript
// Before: Mocked command directly
const command = new InstallPackageCommand(mockCli, mockLogger, mockParser);

// After: Mock progress reporter as well
const command = new InstallPackageCommand(mockCli, mockLogger, mockParser, mockProgressReporter);
```

**E2E Tests:** Should pass unchanged (external behavior identical)

**Acceptance Criteria:**
- [ ] 15 new unit tests for base class
- [ ] All existing command tests updated
- [ ] All E2E tests pass unchanged

---

### Step 5: Create UpdatePackageCommand (Proof of Extensibility)

**File:** `src/commands/updatePackageCommand.ts`

**Demonstrates:** Adding a new command is now ~40 LOC

```typescript
export class UpdatePackageCommand extends PackageOperationCommand<UpdateParams, UpdatePackageResult> {
  static readonly id = 'opm.updatePackage';

  protected validate(params: UpdateParams): Result<ValidatedUpdateParams, AppError> {
    if (!params.packageId) return fail({ code: 'Validation', message: 'Package ID required' });
    return ok({ packageId: params.packageId, projectPaths: params.projectPaths, toVersion: params.toVersion });
  }

  protected async executeOnProject(
    projectPath: string,
    params: ValidatedUpdateParams,
  ): Promise<Result<UpdatePackageResult, AppError>> {
    // First remove, then add
    const removeResult = await this.cliService.removePackage({ projectPath, packageId: params.packageId });
    if (!removeResult.success) return removeResult;

    return this.cliService.addPackage({
      projectPath,
      packageId: params.packageId,
      version: params.toVersion,
    });
  }

  protected getProgressTitle(params: ValidatedUpdateParams): string {
    return `Updating ${params.packageId} to ${params.toVersion}`;
  }

  protected getProjectMessage(projectPath: string, params: ValidatedUpdateParams): string {
    return `Updating ${params.packageId} in ${path.basename(projectPath)}`;
  }
}
```

**Acceptance Criteria:**
- [ ] ~40 LOC total
- [ ] Update command works end-to-end
- [ ] Demonstrates template method reusability

---

### Step 6: Measure LOC Reduction

**Metrics:**
```bash
cloc src/commands/installPackageCommand.ts src/commands/uninstallPackageCommand.ts src/commands/base/
```

**Target:**
- Before: 644 LOC (install + uninstall)
- After: 240 LOC (install + uninstall + base)
- **Reduction: 63%**

**Acceptance Criteria:**
- [ ] LOC reduction ≥60%
- [ ] Cyclomatic complexity reduced
- [ ] Code duplication = 0

---

## Rollback Plan

**Risk:** Medium — control flow changes, must preserve exact behavior

**Strategy:**
1. Keep old command files during transition: `installPackageCommand.old.ts`
2. Feature flag in `extension.ts` to switch implementations
3. Run both old and new commands in parallel (assert same results)

**Rollback Trigger:**
- Test failure rate >5%
- Behavioral difference detected
- Performance regression >10%

**Rollback Command:**
```typescript
// In extension.ts
const USE_TEMPLATE_METHOD = false; // Toggle to rollback
const installCommand = USE_TEMPLATE_METHOD
  ? createInstallPackageCommand(...)
  : createOldInstallPackageCommand(...);
```

---

## Next Steps

After Phase 2 completion:
- ✅ Command duplication eliminated
- ✅ Template method pattern proven
- ✅ Extensibility demonstrated (Update command)
- 🚀 **Proceed to Phase 3:** API Decomposition

---

## Related Documents

- **Master Plan:** [IMPL-REDESIGN-00-MASTER-PLAN.md](IMPL-REDESIGN-00-MASTER-PLAN.md)
- **Previous Phase:** [IMPL-REDESIGN-01-FOUNDATION.md](IMPL-REDESIGN-01-FOUNDATION.md)
- **Next Phase:** [IMPL-REDESIGN-03-API-DECOMPOSITION.md](IMPL-REDESIGN-03-API-DECOMPOSITION.md)
