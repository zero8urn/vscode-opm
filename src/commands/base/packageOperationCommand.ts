/**
 * Abstract base class for package operations (install, uninstall, update).
 * Implements Template Method pattern to eliminate duplication across package commands.
 *
 * The template method defines the skeleton algorithm for all package operations:
 * 1. Validate parameters
 * 2. Deduplicate project paths
 * 3. Execute operations with progress reporting
 * 4. Batch process projects concurrently (3 at a time)
 * 5. Invalidate caches for successful operations
 * 6. Build summary result
 *
 * Subclasses override only the operation-specific hook methods.
 *
 * @module commands/base/packageOperationCommand
 */

import * as path from 'node:path';
import type { PackageCliService } from '../../services/cli/packageCliService';
import type { ILogger } from '../../services/loggerService';
import type { DotnetProjectParser } from '../../services/cli/dotnetProjectParser';
import { batchConcurrent } from '../../utils/async';

/**
 * Minimal cancellation token interface.
 */
export interface ICancellationToken {
  readonly isCancellationRequested: boolean;
}

/**
 * Abstraction for VS Code progress reporting.
 * Enables unit testing by mocking the progress API.
 */
export interface IProgressReporter {
  withProgress<R>(
    options: {
      location: any;
      title: string;
      cancellable: boolean;
    },
    task: (
      progress: { report(value: { message?: string; increment?: number }): void },
      token: ICancellationToken,
    ) => Promise<R>,
  ): Promise<R>;
}

/**
 * Result for a single project operation.
 */
export interface ProjectOperationResult {
  /** Absolute path to project file */
  projectPath: string;

  /** Whether operation succeeded for this project */
  success: boolean;

  /** Error message if operation failed */
  error?: string;
}

/**
 * Result of package operation across multiple projects.
 */
export interface OperationSummary {
  /** Whether at least one operation succeeded */
  success: boolean;

  /** Per-project operation results */
  results: ProjectOperationResult[];
}

/**
 * Abstract base implementing the Template Method pattern.
 * Defines the skeleton algorithm; subclasses fill in operation-specific steps.
 *
 * @template TParams - Command parameter type (e.g., InstallPackageParams)
 */
export abstract class PackageOperationCommand<TParams extends { projectPaths: string[] }> {
  constructor(
    protected readonly packageCliService: PackageCliService,
    protected readonly logger: ILogger,
    protected readonly progressReporter: IProgressReporter,
    protected readonly projectParser?: DotnetProjectParser,
  ) {}

  /**
   * Template method: the fixed algorithm.
   * Subclasses do NOT override this.
   *
   * @param params - Operation parameters
   * @returns Operation summary across all projects
   */
  async execute(params: TParams): Promise<OperationSummary> {
    // Log initial invocation
    this.logger.info(this.getCommandName() + ' invoked', this.getLogContext(params));

    // Step 1: Validate parameters (hook method)
    this.validateParams(params);

    // Step 2: Deduplicate project paths
    this.deduplicateProjectPaths(params);

    if (params.projectPaths.length === 0) {
      return { success: false, results: [] };
    }

    // Concurrent batch size: balance performance with resource usage
    const BATCH_SIZE = 3;
    let processedCount = 0;

    // Step 3: Execute with progress reporting
    const results: ProjectOperationResult[] = await this.progressReporter.withProgress(
      {
        location: 'Window' as any, // ProgressLocation.Window
        title: this.getProgressTitle(params),
        cancellable: false, // Window progress doesn't support cancellation
      },
      async (progress, token) => {
        // Step 4: Batch process projects (3 concurrent max)
        return await batchConcurrent(
          params.projectPaths,
          async (projectPath, index) => {
            // Check cancellation before starting each project
            if (token.isCancellationRequested) {
              this.logger.warn(this.getCommandName() + ' cancelled by user', {
                completed: processedCount,
                total: params.projectPaths.length,
              });
              return {
                projectPath,
                success: false,
                error: this.getCommandName() + ' cancelled by user',
              };
            }

            const projectName = path.basename(projectPath, '.csproj');

            // Update progress (atomic increment for concurrent operations)
            processedCount++;
            if (params.projectPaths.length > 1) {
              progress.report({
                message: this.getProjectMessage(params, projectName, processedCount, params.projectPaths.length),
                increment: 100 / params.projectPaths.length,
              });
            } else {
              progress.report({
                message: this.getProjectMessage(params, projectName, processedCount, 1),
              });
            }

            // Execute operation for this project (hook method)
            return await this.executeOnProject(params, projectPath, token);
          },
          BATCH_SIZE,
        );
      },
    );

    // Step 5: Build and log summary
    const summary = this.buildSummary(results);
    this.logSummary(summary);

    // Step 6: Invalidate caches for successful operations
    if (this.projectParser && summary.success) {
      const successfulPaths = results.filter(r => r.success).map(r => r.projectPath);
      successfulPaths.forEach(projectPath => {
        this.projectParser!.invalidateCache(projectPath);
        this.logger.debug('Invalidated cache for project after ' + this.getCommandName(), { projectPath });
      });
    }

    return summary;
  }

  // ============================================================================
  // Abstract hooks (subclasses MUST implement)
  // ============================================================================

  /**
   * Get the command name for logging (e.g., "Install package command").
   * @returns Command name string
   */
  protected abstract getCommandName(): string;

  /**
   * Get logging context for initial invocation.
   * @param params - Command parameters
   * @returns Object with relevant log fields
   */
  protected abstract getLogContext(params: TParams): Record<string, any>;

  /**
   * Validate and optionally transform raw params.
   * @param params - Parameters to validate
   * @throws Error if validation fails
   */
  protected abstract validateParams(params: TParams): void;

  /**
   * Get progress dialog title.
   * @param params - Command parameters
   * @returns Title string (e.g., "Installing Newtonsoft.Json")
   */
  protected abstract getProgressTitle(params: TParams): string;

  /**
   * Get per-project progress message.
   * @param params - Command parameters
   * @param projectName - Current project name (without .csproj)
   * @param processedCount - Number of projects processed so far
   * @param totalCount - Total number of projects
   * @returns Message string
   */
  protected abstract getProjectMessage(
    params: TParams,
    projectName: string,
    processedCount: number,
    totalCount: number,
  ): string;

  /**
   * Execute the operation on a single project.
   * @param params - Command parameters
   * @param projectPath - Absolute path to .csproj file
   * @param token - Cancellation token
   * @returns Result of the operation
   */
  protected abstract executeOnProject(
    params: TParams,
    projectPath: string,
    token: ICancellationToken,
  ): Promise<ProjectOperationResult>;

  // ============================================================================
  // Concrete helper methods (shared implementation)
  // ============================================================================

  /**
   * Deduplicate project paths in-place.
   * Warns if duplicates are found.
   */
  private deduplicateProjectPaths(params: TParams): void {
    const uniquePaths = new Set(params.projectPaths);
    if (uniquePaths.size !== params.projectPaths.length) {
      this.logger.warn('Duplicate project paths detected, will de-duplicate', {
        original: params.projectPaths.length,
        unique: uniquePaths.size,
      });
      params.projectPaths = Array.from(uniquePaths);
    }
  }

  /**
   * Build summary from individual project results.
   */
  private buildSummary(results: ProjectOperationResult[]): OperationSummary {
    const successCount = results.filter(r => r.success).length;
    return {
      success: successCount > 0,
      results,
    };
  }

  /**
   * Log operation summary.
   */
  private logSummary(summary: OperationSummary): void {
    const successCount = summary.results.filter(r => r.success).length;
    const failureCount = summary.results.filter(r => !r.success).length;

    if (successCount > 0 && failureCount === 0) {
      this.logger.info('All operations succeeded', { successCount });
    } else if (successCount > 0 && failureCount > 0) {
      this.logger.warn('Partial operation success', { successCount, failureCount });
    } else if (failureCount > 0) {
      const firstError = summary.results.find(r => !r.success)?.error ?? 'Unknown error';
      this.logger.error('All operations failed', new Error(firstError));
    }
  }
}
