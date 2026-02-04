/**
 * High-level service for NuGet package management operations via dotnet CLI.
 *
 * Wraps DotnetCliExecutor to provide package-specific methods (add, remove, list)
 * with proper argument construction, error code interpretation, and result parsing.
 * Supports cancellation for long-running downloads and translates NuGet error codes
 * to domain error types.
 *
 * @module services/cli/packageCliService
 */

import * as path from 'node:path';
import type { DotnetCliExecutor } from './dotnetCliExecutor';
import type { ILogger } from '../loggerService';
import {
  type AddPackageOptions,
  type RemovePackageOptions,
  type PackageOperationResult,
  PackageOperationErrorCode,
} from './types/packageOperation';

/**
 * Service interface for package management operations.
 */
export interface PackageCliService {
  /**
   * Add a package to a project.
   *
   * Executes `dotnet add package <id> --version <ver>` with optional source
   * and prerelease flags. Parses stderr for NuGet error codes (NU1102, NU1403)
   * and maps to domain errors.
   *
   * @param options - Package installation options
   * @returns Success result with CLI output or error result with details
   */
  addPackage(options: AddPackageOptions): Promise<PackageOperationResult>;

  /**
   * Remove a package from a project.
   *
   * Executes `dotnet remove package <id>` and validates the operation succeeded.
   *
   * @param options - Package removal options
   * @returns Success result or error result
   */
  removePackage(options: RemovePackageOptions): Promise<PackageOperationResult>;
}

/**
 * Factory to create PackageCliService with injected dependencies.
 *
 * @param cliExecutor - Low-level dotnet CLI executor
 * @param logger - Logger instance for operation tracking
 * @returns PackageCliService implementation
 */
export function createPackageCliService(cliExecutor: DotnetCliExecutor, logger: ILogger): PackageCliService {
  return new PackageCliServiceImpl(cliExecutor, logger);
}

/**
 * Implementation of PackageCliService.
 */
class PackageCliServiceImpl implements PackageCliService {
  /** Default timeout for package operations (2 minutes) */
  private static readonly DEFAULT_TIMEOUT_MS = 120_000;

  constructor(private readonly cliExecutor: DotnetCliExecutor, private readonly logger: ILogger) {}

  async addPackage(options: AddPackageOptions): Promise<PackageOperationResult> {
    const { projectPath, packageId, version, prerelease, source, cancellationToken } = options;

    this.logger.info('Adding package to project', {
      projectPath: path.basename(projectPath),
      packageId,
      version: version ?? 'latest',
    });

    // Validate project file exists (use node fs for compatibility with test environments)
    try {
      const fs = await import('node:fs/promises');
      await fs.access(projectPath);
    } catch {
      this.logger.error('Project file not found', new Error(projectPath));
      return {
        success: false,
        error: {
          code: PackageOperationErrorCode.ProjectNotFound,
          message: `Project file not found: ${projectPath}`,
        },
      };
    }

    // Check dotnet CLI availability
    const isDotnetAvailable = await this.cliExecutor.isDotnetAvailable();
    if (!isDotnetAvailable) {
      this.logger.error('dotnet CLI not found in PATH');
      return {
        success: false,
        error: {
          code: PackageOperationErrorCode.DotnetNotFound,
          message: 'dotnet CLI not found in PATH. Please install the .NET SDK.',
        },
      };
    }

    // Construct command arguments
    const args = ['add', projectPath, 'package', packageId];

    if (version) {
      args.push('--version', version);
    }

    // Optionally skip restore to avoid network operations during tests or in
    // environments with restricted network/configs. This only updates the
    // project file and does not validate package existence.
    if (options.noRestore) {
      args.push('--no-restore');
    }

    if (prerelease) {
      args.push('--prerelease');
    }

    if (source) {
      args.push('--source', source);
    }

    // Handle cancellation
    if (cancellationToken?.isCancellationRequested) {
      this.logger.warn('Package add operation cancelled before execution');
      return {
        success: false,
        error: {
          code: PackageOperationErrorCode.Cancelled,
          message: 'Operation cancelled by user',
        },
      };
    }

    // Execute command
    this.logger.debug(`Executing: dotnet ${args.join(' ')}`);
    const startTime = Date.now();

    // Note: Current DotnetCliExecutor doesn't support cancellation tokens directly
    // This is a limitation we'll address in the cancellation support step
    const result = await this.cliExecutor.execute({
      args,
      cwd: path.dirname(projectPath),
      timeout: PackageCliServiceImpl.DEFAULT_TIMEOUT_MS,
    });

    const duration = Date.now() - startTime;
    this.logger.debug('Package add command completed', {
      exitCode: result.exitCode,
      duration: `${duration}ms`,
      timedOut: result.timedOut,
    });

    // Check for timeout
    if (result.timedOut) {
      this.logger.error('Package add operation timed out');
      return {
        success: false,
        error: {
          code: PackageOperationErrorCode.Timeout,
          message: 'Package installation timed out. Check network connection and try again.',
        },
      };
    }

    // Check for success
    if (result.exitCode === 0) {
      this.logger.info('Package added successfully', { packageId, version: version ?? 'latest' });
      return {
        success: true,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    }

    // Parse error from stderr
    const error = this.parsePackageError(result.stderr, result.stdout);
    this.logger.error('Package add failed', new Error(error.message));

    return {
      success: false,
      error,
    };
  }

  async removePackage(options: RemovePackageOptions): Promise<PackageOperationResult> {
    const { projectPath, packageId } = options;

    this.logger.info('Removing package from project', {
      projectPath: path.basename(projectPath),
      packageId,
    });

    // Validate project file exists (use node fs for compatibility with test environments)
    try {
      const fs = await import('node:fs/promises');
      await fs.access(projectPath);
    } catch {
      this.logger.error('Project file not found', new Error(projectPath));
      return {
        success: false,
        error: {
          code: PackageOperationErrorCode.ProjectNotFound,
          message: `Project file not found: ${projectPath}`,
        },
      };
    }

    // Check dotnet CLI availability
    const isDotnetAvailable = await this.cliExecutor.isDotnetAvailable();
    if (!isDotnetAvailable) {
      this.logger.error('dotnet CLI not found in PATH');
      return {
        success: false,
        error: {
          code: PackageOperationErrorCode.DotnetNotFound,
          message: 'dotnet CLI not found in PATH. Please install the .NET SDK.',
        },
      };
    }

    // Construct command arguments
    const args = ['remove', projectPath, 'package', packageId];

    // Execute command
    this.logger.debug(`Executing: dotnet ${args.join(' ')}`);
    const startTime = Date.now();

    const result = await this.cliExecutor.execute({
      args,
      cwd: path.dirname(projectPath),
      timeout: 30_000, // Remove operations are typically faster
    });

    const duration = Date.now() - startTime;
    this.logger.debug('Package remove command completed', {
      exitCode: result.exitCode,
      duration: `${duration}ms`,
    });

    // Check for success
    if (result.exitCode === 0) {
      this.logger.info('Package removed successfully', { packageId });
      return {
        success: true,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    }

    // Parse error from stderr (use specialized parser for remove operations)
    const error = this.parseRemovePackageError(result.stderr, result.stdout);
    this.logger.error('Package remove failed', new Error(error.message));

    return {
      success: false,
      error,
    };
  }

  /**
   * Parse NuGet error codes from stderr for package removal operations.
   *
   * Recognizes uninstall-specific error patterns:
   * - NU1103: Package not found in project
   * - NU1107: Dependency conflict (package required by others)
   * - Permission errors: Access denied, read-only files
   *
   * @param stderr - Standard error output from dotnet CLI
   * @param stdout - Standard output (may contain additional context)
   * @returns PackageOperationError with appropriate code and message
   */
  private parseRemovePackageError(
    stderr: string,
    stdout: string,
  ): {
    code: PackageOperationErrorCode;
    message: string;
    details?: string;
    nugetErrorCode?: string;
  } {
    const combinedOutput = stderr + '\n' + stdout;

    // Log full CLI error for debugging
    this.logger.debug('Parsing CLI error output for package remove', { stderr, stdout });

    // Extract NuGet error code (NU#### pattern)
    const nugetCodeMatch = combinedOutput.match(/\b(NU\d{4})\b/);
    const nugetErrorCode = nugetCodeMatch?.[1];

    // NU1103: Package not found in project
    if (nugetErrorCode === 'NU1103' || /unable to find package/i.test(combinedOutput)) {
      return {
        code: PackageOperationErrorCode.PackageNotFoundInProject,
        message: 'Package not found in project',
        details: stderr.trim(),
        nugetErrorCode,
      };
    }

    // NU1107: Dependency conflict - package is required by other packages
    if (nugetErrorCode === 'NU1107' || /required by/i.test(combinedOutput)) {
      const dependentPackages = this.extractDependentPackages(combinedOutput);

      return {
        code: PackageOperationErrorCode.DependencyConflict,
        message:
          dependentPackages.length > 0
            ? `Package is required by: ${dependentPackages.join(', ')}`
            : 'Package is required by other packages',
        details: combinedOutput.trim(), // Full CLI output for detailed error view
        nugetErrorCode,
      };
    }

    // Permission errors
    if (/access is denied/i.test(combinedOutput) || /permission/i.test(combinedOutput)) {
      return {
        code: PackageOperationErrorCode.PermissionDenied,
        message: 'Permission denied. Project file may be read-only.',
        details: stderr.trim(),
      };
    }

    // Generic error - preserve full message for user
    return {
      code: PackageOperationErrorCode.CliError,
      message: stderr.trim() || 'Failed to uninstall package',
      details: stderr.trim(),
      nugetErrorCode,
    };
  }

  /**
   * Extract dependent package names from CLI error output.
   *
   * Parses NuGet dependency conflict messages to extract package names
   * that depend on the package being removed.
   *
   * Example formats:
   * - "error NU1107: Version conflict detected for Package.Foo. Package.Bar requires Package.Foo (>= 1.0.0)."
   * - "Package 'Microsoft.Extensions.Logging.Abstractions' is required by 'Microsoft.Extensions.Logging'"
   *
   * @param cliOutput - Combined stderr and stdout from dotnet CLI
   * @returns Array of dependent package names
   */
  private extractDependentPackages(cliOutput: string): string[] {
    const dependents: string[] = [];

    // Pattern 1: "required by 'PackageName'"
    const requiredByPattern = /required by ['"]([^'"]+)['"]/gi;
    let match;
    while ((match = requiredByPattern.exec(cliOutput)) !== null) {
      dependents.push(match[1]!);
    }

    // Pattern 2: "Package.Name requires" or "Package.Name (version) requires"
    const requiresPattern = /([A-Za-z0-9_.]+)(?:\s+\([^)]+\))?\s+requires/gi;
    while ((match = requiresPattern.exec(cliOutput)) !== null) {
      const pkg = match[1]!;
      if (!dependents.includes(pkg)) {
        dependents.push(pkg);
      }
    }

    return dependents;
  }

  /**
   * Parse NuGet error codes from stderr and map to domain errors.
   *
   * Recognizes error patterns:
   * - NU1102: Unable to find package (version not found)
   * - NU1403: Package requires license acceptance
   * - NU1202: Package incompatible with target framework
   * - NU1108: Circular dependency detected
   * - Network errors: connection timeouts, SSL failures
   *
   * @param stderr - Standard error output from dotnet CLI
   * @param stdout - Standard output (may contain additional context)
   * @returns PackageOperationError with appropriate code and message
   */
  private parsePackageError(
    stderr: string,
    stdout: string,
  ): {
    code: PackageOperationErrorCode;
    message: string;
    details?: string;
    nugetErrorCode?: string;
  } {
    const combinedOutput = stderr + '\n' + stdout;

    // Extract NuGet error code (NU#### pattern)
    const nugetCodeMatch = combinedOutput.match(/\b(NU\d{4})\b/);
    const nugetErrorCode = nugetCodeMatch?.[1];

    // NU1102: Package version not found
    if (nugetErrorCode === 'NU1102' || /unable to find package/i.test(combinedOutput)) {
      return {
        code: PackageOperationErrorCode.PackageVersionNotFound,
        message: 'Package or version not found in the configured sources',
        details: stderr.trim(),
        nugetErrorCode,
      };
    }

    // NU1403: License acceptance required
    if (nugetErrorCode === 'NU1403' || /license acceptance/i.test(combinedOutput)) {
      return {
        code: PackageOperationErrorCode.LicenseAcceptanceRequired,
        message: 'This package requires you to accept a license agreement',
        details: stderr.trim(),
        nugetErrorCode,
      };
    }

    // NU1202: Framework compatibility error
    if (nugetErrorCode === 'NU1202' || /not compatible with/i.test(combinedOutput)) {
      return {
        code: PackageOperationErrorCode.FrameworkIncompatible,
        message: 'Package is not compatible with the project target framework',
        details: stderr.trim(),
        nugetErrorCode,
      };
    }

    // NU1108: Circular dependency
    if (nugetErrorCode === 'NU1108' || /circular dependency/i.test(combinedOutput)) {
      return {
        code: PackageOperationErrorCode.CircularDependency,
        message: 'Circular dependency detected in package graph',
        details: stderr.trim(),
        nugetErrorCode,
      };
    }

    // Network errors
    if (
      /unable to load the service index/i.test(combinedOutput) ||
      /unable to connect/i.test(combinedOutput) ||
      /network.*error/i.test(combinedOutput) ||
      /timeout/i.test(combinedOutput)
    ) {
      return {
        code: PackageOperationErrorCode.NetworkError,
        message: 'Network error while downloading package. Check your internet connection.',
        details: stderr.trim(),
        nugetErrorCode,
      };
    }

    // Generic CLI error
    return {
      code: PackageOperationErrorCode.CliError,
      message: stderr.trim() || 'Package operation failed',
      details: stderr.trim(),
      nugetErrorCode,
    };
  }
}
