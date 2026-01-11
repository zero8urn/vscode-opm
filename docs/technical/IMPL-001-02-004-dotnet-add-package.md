# IMPL-001-02-004-dotnet-add-package

**Story**: [STORY-001-02-004-dotnet-add-package](../stories/STORY-001-02-004-dotnet-add-package.md)  
**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)

## Overview

This technical implementation document details the construction of `PackageCliService`, a high-level wrapper around `DotnetCliExecutor` that provides package management operations (`add`, `remove`, `list`). The service translates domain-level package operations into correct CLI arguments, interprets package-specific error codes (NU1102, NU1403, NU1108), and returns structured results with discriminated unions.

## Implementation Plan

**Summary**: Implement `PackageCliService` as a high-level wrapper around `DotnetCliExecutor` for package management operations (`add`, `remove`, `list`). The service translates domain-level package operations into correct CLI arguments, interprets package-specific error codes (NU1102, NU1403, NU1108), and returns structured results with discriminated unions. Follows existing patterns from `dotnetProjectParser` and `dotnetSolutionParser` with factory-based construction, injected logger, and operation-specific error handling.

**Key Design Decisions**:
- Delegate all process spawning to `DotnetCliExecutor` (no direct `spawn()` calls)
- Return `PackageOperationResult` type with success/error discrimination similar to `ProjectParseResult`
- Support cancellation via `vscode.CancellationToken` for long-running downloads
- Parse stderr for NuGet error codes and map to domain error types
- Working directory is always the parent directory of the target project file
- Expose optional `source` parameter for non-default package feeds

**Consolidated Todo List**:

1. [Create type definitions](#section-1-types) - Domain models for operation results and errors
2. [Implement PackageCliService interface](#section-2-service-interface) - Core service contract with add/remove/list methods
3. [Build addPackage implementation](#section-3-add-package) - Construct args, execute CLI, parse results
4. [Build removePackage implementation](#section-4-remove-package) - Implement uninstall operation
5. [Implement error code parser](#section-5-error-parser) - Extract NU* codes from stderr and map to domain errors
6. [Add cancellation support](#section-6-cancellation) - Wire CancellationToken to process termination
7. [Create factory function](#section-7-factory) - Factory with logger injection following existing patterns
8. [Write unit tests](#section-8-unit-tests) - Mock DotnetCliExecutor, test arg construction and error mapping
9. [Write integration tests](#section-9-integration-tests) - Real CLI execution with test projects
10. [Add logging and telemetry](#section-10-logging) - Debug logs for commands, error logs for failures

---

<a id="section-1-types"></a>
## 1. Create Type Definitions

**File**: `src/services/cli/types/packageOperation.ts`

Define domain models for package operations following the pattern from `projectMetadata.ts`:

```typescript
/**
 * Options for adding a package to a project.
 */
export interface AddPackageOptions {
  /** Absolute path to target .csproj file */
  readonly projectPath: string;

  /** Package ID (e.g., "Newtonsoft.Json") */
  readonly packageId: string;

  /** Package version (e.g., "13.0.3") - omit for latest stable */
  readonly version?: string;

  /** Include prerelease versions when resolving latest */
  readonly prerelease?: boolean;

  /** NuGet source URL (omit for default configured sources) */
  readonly source?: string;

  /** Cancellation token for aborting long operations */
  readonly cancellationToken?: vscode.CancellationToken;
}

/**
 * Options for removing a package from a project.
 */
export interface RemovePackageOptions {
  /** Absolute path to target .csproj file */
  readonly projectPath: string;

  /** Package ID to remove */
  readonly packageId: string;
}

/**
 * Package operation error codes.
 */
export enum PackageOperationErrorCode {
  /** dotnet CLI not found in PATH */
  DotnetNotFound = 'DOTNET_NOT_FOUND',

  /** Project file not found */
  ProjectNotFound = 'PROJECT_NOT_FOUND',

  /** Package version not found in configured sources */
  PackageVersionNotFound = 'PACKAGE_VERSION_NOT_FOUND', // NU1102

  /** Package requires license acceptance */
  LicenseAcceptanceRequired = 'LICENSE_ACCEPTANCE_REQUIRED', // NU1403

  /** Package not compatible with project target framework */
  FrameworkIncompatible = 'FRAMEWORK_INCOMPATIBLE', // NU1202

  /** Network error during package download */
  NetworkError = 'NETWORK_ERROR',

  /** Operation timed out */
  Timeout = 'TIMEOUT',

  /** Operation cancelled by user */
  Cancelled = 'CANCELLED',

  /** Generic CLI execution error */
  CliError = 'CLI_ERROR',
}

/**
 * Package operation error.
 */
export interface PackageOperationError {
  readonly code: PackageOperationErrorCode;
  readonly message: string;
  readonly details?: string;
  readonly nugetErrorCode?: string; // Original NU* code if applicable
}

/**
 * Result of a package operation.
 */
export type PackageOperationResult =
  | {
      success: true;
      /** CLI exit code (always 0 for success) */
      exitCode: number;
      /** Standard output from CLI */
      stdout: string;
      /** Standard error (may contain warnings even on success) */
      stderr: string;
    }
  | {
      success: false;
      error: PackageOperationError;
      /** CLI exit code if available */
      exitCode?: number;
      /** Raw stderr for debugging */
      stderr?: string;
    };
```

**Error Code Mapping Reference**:
- `NU1102`: Unable to find package (version not found)
- `NU1403`: Package requires license acceptance
- `NU1202`: Package incompatible with target framework
- `NU1108`: Circular dependency detected

---

<a id="section-2-service-interface"></a>
## 2. Implement PackageCliService Interface

**File**: `src/services/cli/packageCliService.ts`

Define the service interface following `DotnetProjectParser` and `DotnetSolutionParser` patterns:

```typescript
export interface PackageCliService {
  /**
   * Add a package to a project.
   *
   * Executes: dotnet add "<projectPath>" package <packageId> [--version <version>]
   * [--prerelease] [--source <source>]
   *
   * @param options - Package installation options
   * @returns Success result with CLI output or error result with mapped code
   */
  addPackage(options: AddPackageOptions): Promise<PackageOperationResult>;

  /**
   * Remove a package from a project.
   *
   * Executes: dotnet remove "<projectPath>" package <packageId>
   *
   * @param options - Package removal options
   * @returns Success result or error result
   */
  removePackage(options: RemovePackageOptions): Promise<PackageOperationResult>;
}
```

---

<a id="section-3-add-package"></a>
## 3. Build addPackage Implementation

**Core Logic**:

```typescript
async addPackage(options: AddPackageOptions): Promise<PackageOperationResult> {
  const { projectPath, packageId, version, prerelease, source, cancellationToken } = options;

  logger.debug('Adding package to project', { projectPath, packageId, version });

  // Validate project file exists
  try {
    await fs.access(projectPath);
  } catch {
    return {
      success: false,
      error: {
        code: PackageOperationErrorCode.ProjectNotFound,
        message: `Project file not found: ${projectPath}`,
      },
    };
  }

  // Verify dotnet CLI available
  const isDotnetAvailable = await cliExecutor.isDotnetAvailable();
  if (!isDotnetAvailable) {
    return {
      success: false,
      error: {
        code: PackageOperationErrorCode.DotnetNotFound,
        message: 'dotnet CLI not found in PATH. Please install .NET SDK.',
      },
    };
  }

  // Build command arguments
  const args = ['add', projectPath, 'package', packageId];
  if (version) {
    args.push('--version', version);
  }
  if (prerelease) {
    args.push('--prerelease');
  }
  if (source) {
    args.push('--source', source);
  }

  // Set working directory to project parent
  const cwd = path.dirname(projectPath);

  // Execute CLI command
  const result = await cliExecutor.execute({
    args,
    cwd,
    timeout: 60000, // 60s for package downloads
  });

  // Check for cancellation
  if (cancellationToken?.isCancellationRequested) {
    return {
      success: false,
      error: {
        code: PackageOperationErrorCode.Cancelled,
        message: 'Operation cancelled by user',
      },
    };
  }

  // Handle timeout
  if (result.timedOut) {
    return {
      success: false,
      error: {
        code: PackageOperationErrorCode.Timeout,
        message: 'Package installation timed out after 60 seconds',
      },
      exitCode: result.exitCode,
      stderr: result.stderr,
    };
  }

  // Handle success
  if (result.exitCode === 0) {
    logger.info('Successfully added package', { projectPath, packageId, version });
    return {
      success: true,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  // Parse error from stderr
  const error = this.parseError(result.stderr, result.exitCode);
  logger.error('Failed to add package', new Error(error.message), { packageId, projectPath });

  return {
    success: false,
    error,
    exitCode: result.exitCode,
    stderr: result.stderr,
  };
}
```

---

<a id="section-4-remove-package"></a>
## 4. Build removePackage Implementation

**Core Logic**:

```typescript
async removePackage(options: RemovePackageOptions): Promise<PackageOperationResult> {
  const { projectPath, packageId } = options;

  logger.debug('Removing package from project', { projectPath, packageId });

  // Validate project exists
  try {
    await fs.access(projectPath);
  } catch {
    return {
      success: false,
      error: {
        code: PackageOperationErrorCode.ProjectNotFound,
        message: `Project file not found: ${projectPath}`,
      },
    };
  }

  // Build command arguments
  const args = ['remove', projectPath, 'package', packageId];
  const cwd = path.dirname(projectPath);

  // Execute CLI command
  const result = await cliExecutor.execute({ args, cwd, timeout: 30000 });

  // Handle success
  if (result.exitCode === 0) {
    logger.info('Successfully removed package', { projectPath, packageId });
    return {
      success: true,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  // Parse error
  const error = this.parseError(result.stderr, result.exitCode);
  logger.error('Failed to remove package', new Error(error.message), { packageId, projectPath });

  return {
    success: false,
    error,
    exitCode: result.exitCode,
    stderr: result.stderr,
  };
}
```

---

<a id="section-5-error-parser"></a>
## 5. Implement Error Code Parser

**Core Logic**:

```typescript
/**
 * Parse NuGet error codes from stderr and map to domain errors.
 */
private parseError(stderr: string, exitCode: number): PackageOperationError {
  // Check for specific NuGet error codes
  const nugetErrorMatch = stderr.match(/error (NU\d{4}):/i);
  const nugetErrorCode = nugetErrorMatch?.[1];

  // NU1102: Unable to find package 'X' with version 'Y'
  if (stderr.includes('NU1102') || stderr.includes('Unable to find package')) {
    return {
      code: PackageOperationErrorCode.PackageVersionNotFound,
      message: 'Package or version not found in configured sources',
      details: stderr,
      nugetErrorCode,
    };
  }

  // NU1403: Package requires license acceptance
  if (stderr.includes('NU1403') || stderr.includes('license agreement')) {
    return {
      code: PackageOperationErrorCode.LicenseAcceptanceRequired,
      message: 'Package requires license acceptance',
      details: stderr,
      nugetErrorCode,
    };
  }

  // NU1202: Package incompatible with target framework
  if (stderr.includes('NU1202') || stderr.includes('not compatible')) {
    return {
      code: PackageOperationErrorCode.FrameworkIncompatible,
      message: 'Package is not compatible with project target framework',
      details: stderr,
      nugetErrorCode,
    };
  }

  // Network errors
  if (
    stderr.includes('Unable to load the service index') ||
    stderr.includes('network') ||
    stderr.includes('timeout')
  ) {
    return {
      code: PackageOperationErrorCode.NetworkError,
      message: 'Network error occurred while downloading package',
      details: stderr,
      nugetErrorCode,
    };
  }

  // Generic CLI error
  return {
    code: PackageOperationErrorCode.CliError,
    message: `CLI command failed with exit code ${exitCode}`,
    details: stderr,
    nugetErrorCode,
  };
}
```

---

<a id="section-6-cancellation"></a>
## 6. Add Cancellation Support

**Implementation Notes**:

The current `DotnetCliExecutor` does not expose process control for cancellation. We have two options:

**Option A**: Enhance `DotnetCliExecutor` to accept `CancellationToken` and kill process on cancellation request.

**Option B**: Check `cancellationToken.isCancellationRequested` before and after CLI execution in `PackageCliService`.

**Recommendation**: Implement **Option B** for MVP (simpler, no changes to shared executor), then enhance executor in follow-up story if needed for progress reporting during downloads.

```typescript
// Before execution
if (cancellationToken?.isCancellationRequested) {
  return {
    success: false,
    error: {
      code: PackageOperationErrorCode.Cancelled,
      message: 'Operation cancelled before execution',
    },
  };
}

// After execution
if (cancellationToken?.isCancellationRequested) {
  return {
    success: false,
    error: {
      code: PackageOperationErrorCode.Cancelled,
      message: 'Operation cancelled by user',
    },
  };
}
```

---

<a id="section-7-factory"></a>
## 7. Create Factory Function

**File**: `src/services/cli/packageCliService.ts`

```typescript
export function createPackageCliService(
  cliExecutor: DotnetCliExecutor,
  logger: ILogger,
): PackageCliService {
  return new PackageCliServiceImpl(cliExecutor, logger);
}

class PackageCliServiceImpl implements PackageCliService {
  constructor(
    private readonly cliExecutor: DotnetCliExecutor,
    private readonly logger: ILogger,
  ) {}

  async addPackage(options: AddPackageOptions): Promise<PackageOperationResult> {
    // Implementation from section 3
  }

  async removePackage(options: RemovePackageOptions): Promise<PackageOperationResult> {
    // Implementation from section 4
  }

  private parseError(stderr: string, exitCode: number): PackageOperationError {
    // Implementation from section 5
  }
}
```

**Integration in extension.ts**:

```typescript
const cliExecutor = createDotnetCliExecutor(logger);
const packageCliService = createPackageCliService(cliExecutor, logger);

// Store in context for command handlers
context.subscriptions.push({
  dispose: () => {
    // No resources to clean up
  },
});
```

---

<a id="section-8-unit-tests"></a>
## 8. Write Unit Tests

**File**: `src/services/cli/__tests__/packageCliService.test.ts`

**Test Cases**:

```typescript
import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { createPackageCliService } from '../packageCliService';
import type { DotnetCliExecutor } from '../dotnetCliExecutor';
import type { ILogger } from '../../loggerService';

describe('PackageCliService', () => {
  let mockExecutor: DotnetCliExecutor;
  let mockLogger: ILogger;
  let service: PackageCliService;

  beforeEach(() => {
    mockExecutor = {
      execute: mock(async () => ({ exitCode: 0, stdout: '', stderr: '', timedOut: false })),
      isDotnetAvailable: mock(async () => true),
      getDotnetVersion: mock(async () => '8.0.100'),
    };

    mockLogger = {
      debug: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
    };

    service = createPackageCliService(mockExecutor, mockLogger);
  });

  describe('addPackage', () => {
    it('constructs correct CLI arguments for simple install', async () => {
      await service.addPackage({
        projectPath: '/workspace/MyApp.csproj',
        packageId: 'Newtonsoft.Json',
        version: '13.0.3',
      });

      expect(mockExecutor.execute).toHaveBeenCalledWith({
        args: ['add', '/workspace/MyApp.csproj', 'package', 'Newtonsoft.Json', '--version', '13.0.3'],
        cwd: '/workspace',
        timeout: 60000,
      });
    });

    it('includes --prerelease flag when specified', async () => {
      await service.addPackage({
        projectPath: '/workspace/MyApp.csproj',
        packageId: 'PackageId',
        prerelease: true,
      });

      expect(mockExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          args: expect.arrayContaining(['--prerelease']),
        }),
      );
    });

    it('includes --source when custom feed specified', async () => {
      await service.addPackage({
        projectPath: '/workspace/MyApp.csproj',
        packageId: 'Private.Package',
        source: 'https://custom.nuget.org/v3/index.json',
      });

      expect(mockExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          args: expect.arrayContaining(['--source', 'https://custom.nuget.org/v3/index.json']),
        }),
      );
    });

    it('returns success result on exit code 0', async () => {
      mockExecutor.execute = mock(async () => ({
        exitCode: 0,
        stdout: 'info : PackageReference added successfully.',
        stderr: '',
        timedOut: false,
      }));

      const result = await service.addPackage({
        projectPath: '/workspace/MyApp.csproj',
        packageId: 'Newtonsoft.Json',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.exitCode).toBe(0);
      }
    });

    it('maps NU1102 error to PackageVersionNotFound', async () => {
      mockExecutor.execute = mock(async () => ({
        exitCode: 1,
        stdout: '',
        stderr: 'error NU1102: Unable to find package Newtonsoft.Json with version 99.99.99',
        timedOut: false,
      }));

      const result = await service.addPackage({
        projectPath: '/workspace/MyApp.csproj',
        packageId: 'Newtonsoft.Json',
        version: '99.99.99',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(PackageOperationErrorCode.PackageVersionNotFound);
        expect(result.error.nugetErrorCode).toBe('NU1102');
      }
    });

    it('maps NU1403 error to LicenseAcceptanceRequired', async () => {
      mockExecutor.execute = mock(async () => ({
        exitCode: 1,
        stdout: '',
        stderr: 'error NU1403: This package requires you to accept a license agreement',
        timedOut: false,
      }));

      const result = await service.addPackage({
        projectPath: '/workspace/MyApp.csproj',
        packageId: 'CommercialPackage',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(PackageOperationErrorCode.LicenseAcceptanceRequired);
      }
    });

    it('handles timeout with Timeout error code', async () => {
      mockExecutor.execute = mock(async () => ({
        exitCode: -1,
        stdout: '',
        stderr: '',
        timedOut: true,
      }));

      const result = await service.addPackage({
        projectPath: '/workspace/MyApp.csproj',
        packageId: 'LargePackage',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(PackageOperationErrorCode.Timeout);
      }
    });

    it('returns DotnetNotFound when CLI unavailable', async () => {
      mockExecutor.isDotnetAvailable = mock(async () => false);

      const result = await service.addPackage({
        projectPath: '/workspace/MyApp.csproj',
        packageId: 'Package',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(PackageOperationErrorCode.DotnetNotFound);
      }
    });
  });

  describe('removePackage', () => {
    it('constructs correct CLI arguments', async () => {
      await service.removePackage({
        projectPath: '/workspace/MyApp.csproj',
        packageId: 'Newtonsoft.Json',
      });

      expect(mockExecutor.execute).toHaveBeenCalledWith({
        args: ['remove', '/workspace/MyApp.csproj', 'package', 'Newtonsoft.Json'],
        cwd: '/workspace',
        timeout: 30000,
      });
    });

    it('returns success on exit code 0', async () => {
      const result = await service.removePackage({
        projectPath: '/workspace/MyApp.csproj',
        packageId: 'Newtonsoft.Json',
      });

      expect(result.success).toBe(true);
    });
  });
});
```

---

<a id="section-9-integration-tests"></a>
## 9. Write Integration Tests

**File**: `test/integration/packageCliService.integration.test.ts`

**Setup**: Create real test projects using `test/fixtures/TestProject/TestProject.csproj`

**Test Cases**:

```typescript
import { describe, it, expect, beforeAll } from 'bun:test';
import { createDotnetCliExecutor } from '../../src/services/cli/dotnetCliExecutor';
import { createPackageCliService } from '../../src/services/cli/packageCliService';
import { createLogger } from '../../src/services/loggerService';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('PackageCliService Integration', () => {
  const logger = createLogger(/* mock output channel */);
  const cliExecutor = createDotnetCliExecutor(logger);
  const service = createPackageCliService(cliExecutor, logger);

  const testProjectPath = path.resolve(__dirname, '../fixtures/TestProject/TestProject.csproj');

  beforeAll(async () => {
    // Ensure test project exists
    await fs.access(testProjectPath);

    // Remove any existing test packages
    await service.removePackage({ projectPath: testProjectPath, packageId: 'Newtonsoft.Json' });
  });

  it('successfully adds and removes a real package', async () => {
    // Add package
    const addResult = await service.addPackage({
      projectPath: testProjectPath,
      packageId: 'Newtonsoft.Json',
      version: '13.0.3',
    });

    expect(addResult.success).toBe(true);

    // Verify package was added by checking project file
    const projectContent = await fs.readFile(testProjectPath, 'utf-8');
    expect(projectContent).toContain('Newtonsoft.Json');
    expect(projectContent).toContain('13.0.3');

    // Remove package
    const removeResult = await service.removePackage({
      projectPath: testProjectPath,
      packageId: 'Newtonsoft.Json',
    });

    expect(removeResult.success).toBe(true);

    // Verify package was removed
    const updatedContent = await fs.readFile(testProjectPath, 'utf-8');
    expect(updatedContent).not.toContain('Newtonsoft.Json');
  });

  it('fails gracefully for non-existent package version', async () => {
    const result = await service.addPackage({
      projectPath: testProjectPath,
      packageId: 'Newtonsoft.Json',
      version: '999.999.999',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(PackageOperationErrorCode.PackageVersionNotFound);
    }
  });

  it('handles network failures gracefully', async () => {
    // Use invalid source URL to trigger network error
    const result = await service.addPackage({
      projectPath: testProjectPath,
      packageId: 'Package',
      source: 'https://invalid.nuget.source.local',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(PackageOperationErrorCode.NetworkError);
    }
  });
});
```

---

<a id="section-10-logging"></a>
## 10. Add Logging and Telemetry

**Logging Points**:

1. **Debug level**: Log full CLI command before execution (sanitize source URLs if they contain credentials)
2. **Debug level**: Log execution time and exit code after completion
3. **Info level**: Log successful package additions/removals with package ID and version
4. **Error level**: Log failures with error code, message, and sanitized stderr
5. **Warn level**: Log timeout warnings and cancellation requests

**Example Logging**:

```typescript
// Before execution
logger.debug('Executing dotnet CLI command', {
  command: `dotnet ${args.join(' ')}`,
  cwd,
  timeout,
});

// After success
logger.info('Package operation completed successfully', {
  operation: 'add',
  packageId,
  version,
  projectPath,
  duration: Date.now() - startTime,
});

// After failure
logger.error('Package operation failed', new Error(error.message), {
  operation: 'add',
  packageId,
  projectPath,
  errorCode: error.code,
  nugetErrorCode: error.nugetErrorCode,
  exitCode,
});
```

**Error Handling Strategy**:

1. **Structured errors**: Always return `PackageOperationResult` with discriminated union - never throw
2. **User-facing messages**: Error messages should be actionable (e.g., "Package version not found - verify version exists on NuGet.org")
3. **Debug details**: Include full stderr in error result for "View Logs" functionality
4. **Bubble up**: Command handlers translate domain errors to VS Code notifications with appropriate severity

---

## Files to Create/Modify

**New Files**:
- `src/services/cli/types/packageOperation.ts` - Type definitions
- `src/services/cli/packageCliService.ts` - Service implementation
- `src/services/cli/__tests__/packageCliService.test.ts` - Unit tests
- `test/integration/packageCliService.integration.test.ts` - Integration tests

**Modified Files**:
- `src/extension.ts` - Register service in activation context (future story)

**Test Fixtures**:
- `test/fixtures/TestProject/TestProject.csproj` - Already exists for integration tests

---

## Acceptance Criteria Mapping

| Criteria | Implementation Section |
|----------|----------------------|
| Command constructs correct CLI arguments | Section 3 (addPackage), Section 8 (unit tests) |
| Supports optional --prerelease flag | Section 3 (addPackage), Section 1 (types) |
| Supports optional --source parameter | Section 3 (addPackage), Section 1 (types) |
| Captures stdout and stderr | Section 3 (delegates to cliExecutor) |
| Logs full CLI command at debug level | Section 10 (logging) |
| Returns exit code 0 as success | Section 3 (success handling) |
| Handles process spawn errors (ENOENT) | Section 3 (isDotnetAvailable check) |
| Respects configurable timeout | Section 3 (timeout: 60000) |
| Working directory set to project parent | Section 3 (cwd: path.dirname) |
| Handles paths with spaces | Section 3 (CLI executor handles quoting) |
| Parses package-specific error codes | Section 5 (error parser) |
| Handles license acceptance prompt | Section 5 (NU1403 mapping) |
| Network failure handling | Section 5 (network error mapping) |
| Operation cancellation | Section 6 (cancellation support) |

---

## Dependencies

**Required Services** (already implemented):
- `DotnetCliExecutor` - Low-level CLI execution
- `LoggerService` - Logging infrastructure

**Blocking Dependencies**: None (all dependencies exist)

**Future Integration Points**:
- `InstallCommandHandler` (STORY-001-02-006) - Consumes this service
- `PackageOperationProgressService` (STORY-001-02-008) - Wraps this service with progress UI

---

## Risk Mitigation

1. **Risk**: dotnet CLI output format changes between versions
   - **Mitigation**: Parse stderr with regex patterns, fallback to generic error mapping

2. **Risk**: Long package downloads block extension host
   - **Mitigation**: 60-second timeout, cancellation support, plan for background execution in future story

3. **Risk**: Concurrent package operations corrupt project file
   - **Mitigation**: This is a general dotnet CLI limitation (affects all tools including VS 2022/Rider when mixing CLI + IDE operations). Serialize operations in command handler layer and document that users should not run manual `dotnet add package` commands while extension operations are in progress. Consider adding file watcher to detect external modifications and refresh UI state.

4. **Risk**: Network failures leave project in inconsistent state
   - **Mitigation**: dotnet CLI handles rollback automatically - document this behavior

---

**Implementation Date**: 2026-01-11  
**Last Updated**: 2026-01-11
