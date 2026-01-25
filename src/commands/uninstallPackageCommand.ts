/**
 * Uninstall Package Command Handler
 *
 * Internal command that orchestrates package uninstallation from webview IPC messages
 * through to CLI execution, progress feedback, and UI state updates. This command
 * is NOT registered in package.json and is only invoked programmatically by the
 * Package Browser webview—never directly by users via the command palette.
 *
 * @module commands/uninstallPackageCommand
 */

import type * as vscode from 'vscode';
import * as path from 'node:path';
import type { ILogger } from '../services/loggerService';
import type { PackageCliService } from '../services/cli/packageCliService';
import type { DotnetProjectParser } from '../services/cli/dotnetProjectParser';

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
 * Parameters for uninstall package command.
 */
export interface UninstallPackageParams {
  /** Package identifier (e.g., "Newtonsoft.Json") */
  packageId: string;

  /** Absolute paths to target .csproj files */
  projectPaths: string[];
}

/**
 * Result of uninstall package operation.
 */
export interface UninstallPackageResult {
  /** Whether all uninstalls succeeded */
  success: boolean;

  /** Per-project uninstallation results */
  results: ProjectUninstallResult[];
}

/**
 * Result for a single project uninstallation.
 */
export interface ProjectUninstallResult {
  /** Absolute path to project file */
  projectPath: string;

  /** Whether uninstallation succeeded for this project */
  success: boolean;

  /** Error message if uninstallation failed */
  error?: string;
}

/**
 * Uninstall Package Command
 *
 * Coordinates package uninstallation workflow:
 * 1. Validates input parameters
 * 2. Executes uninstalls sequentially per project
 * 3. Shows progress notifications
 * 4. Invalidates caches on success
 * 5. Triggers tree view refresh
 * 6. Displays toast notifications
 */
export class UninstallPackageCommand {
  static readonly id = 'opm.uninstallPackage';

  constructor(
    private readonly packageCliService: PackageCliService,
    private readonly logger: ILogger,
    private readonly progressReporter: IProgressReporter,
    private readonly projectParser?: DotnetProjectParser,
  ) {}

  /**
   * Execute package uninstallation.
   *
   * @param params - Uninstallation parameters from webview
   * @returns Uninstallation results for all projects
   * @throws Error if validation fails
   */
  async execute(params: UninstallPackageParams): Promise<UninstallPackageResult> {
    this.logger.info('Uninstall package command invoked', {
      packageId: params.packageId,
      projectCount: params.projectPaths.length,
    });

    // Validate parameters
    this.validateParams(params);

    const results: ProjectUninstallResult[] = [];

    // Execute with progress indicator (shows in status bar)
    await this.progressReporter.withProgress(
      {
        location: 'Window' as any, // ProgressLocation.Window
        title: `Uninstalling ${params.packageId}`,
        cancellable: false, // Window progress doesn't support cancellation
      },
      async (progress, token) => {
        for (let i = 0; i < params.projectPaths.length; i++) {
          // Check for cancellation
          if (token.isCancellationRequested) {
            this.logger.warn('Uninstallation cancelled by user', {
              completed: i,
              total: params.projectPaths.length,
            });
            break;
          }

          const projectPath = params.projectPaths[i]!;
          const projectName = path.basename(projectPath, '.csproj');

          // Update progress
          if (params.projectPaths.length > 1) {
            progress.report({
              message: `Uninstalling from ${projectName} (${i + 1}/${params.projectPaths.length})...`,
              increment: 100 / params.projectPaths.length,
            });
          } else {
            progress.report({
              message: `Uninstalling from ${projectName}...`,
            });
          }

          // Execute uninstallation for this project
          const result = await this.uninstallFromProject(params.packageId, projectPath, token);

          results.push(result);

          // Stop on cancellation
          if (token.isCancellationRequested) {
            break;
          }
        }
      },
    );

    // Check if any uninstalls succeeded
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    // Log completion summary (toast notifications handled by extension host message handler)
    if (successCount > 0 && failureCount === 0) {
      this.logger.info('All uninstalls succeeded', { successCount });
    } else if (successCount > 0 && failureCount > 0) {
      this.logger.warn('Partial uninstall success', { successCount, failureCount });
    } else if (failureCount > 0) {
      const firstError = results.find(r => !r.success)?.error ?? 'Unknown error';
      this.logger.error('All uninstalls failed', new Error(firstError));
    }

    // Invalidate cache for successfully uninstalled projects
    if (this.projectParser && successCount > 0) {
      const successfulPaths = results.filter(r => r.success).map(r => r.projectPath);
      successfulPaths.forEach(projectPath => {
        this.projectParser!.invalidateCache(projectPath);
        this.logger.debug('Invalidated cache for project after uninstall', { projectPath });
      });
    }

    // TODO: Refresh tree view (when InstalledPackagesProvider is available)

    return {
      success: successCount > 0,
      results,
    };
  }

  /**
   * Validate uninstallation parameters.
   *
   * @param params - Parameters to validate
   * @throws Error if validation fails
   */
  private validateParams(params: UninstallPackageParams): void {
    if (!params.packageId || params.packageId.trim().length === 0) {
      throw new Error('Package ID is required');
    }

    if (!params.projectPaths || params.projectPaths.length === 0) {
      throw new Error('At least one project must be selected');
    }

    // Validate all project paths are .csproj files
    for (const projectPath of params.projectPaths) {
      if (!projectPath.toLowerCase().endsWith('.csproj')) {
        throw new Error(`Invalid project file: ${projectPath} (must be .csproj)`);
      }
    }

    // De-duplicate project paths
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
   * Uninstall package from a single project.
   *
   * @param packageId - Package identifier
   * @param projectPath - Absolute path to project file
   * @param token - Cancellation token
   * @returns Uninstallation result for this project
   */
  private async uninstallFromProject(
    packageId: string,
    projectPath: string,
    token: ICancellationToken,
  ): Promise<ProjectUninstallResult> {
    const projectName = path.basename(projectPath, '.csproj');

    this.logger.info(`Uninstalling ${packageId} from ${projectName}`, {
      projectPath,
    });

    try {
      // Delegate to PackageCliService
      const result = await this.packageCliService.removePackage({
        projectPath,
        packageId,
      });

      if (result.success) {
        this.logger.info(`Successfully uninstalled ${packageId} from ${projectName}`);
        return {
          projectPath,
          success: true,
        };
      } else {
        const errorMessage = result.error?.message ?? 'Unknown error';
        this.logger.error(`Failed to uninstall ${packageId} from ${projectName}: ${errorMessage}`);
        return {
          projectPath,
          success: false,
          error: errorMessage,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Exception uninstalling ${packageId} from ${projectName}`,
        error instanceof Error ? error : new Error(errorMessage),
      );
      return {
        projectPath,
        success: false,
        error: errorMessage,
      };
    }
  }
}

/**
 * Factory to create UninstallPackageCommand with real VS Code APIs.
 * Call this from extension.ts activation where vscode module is available.
 */
export function createUninstallPackageCommand(
  packageCliService: PackageCliService,
  logger: ILogger,
  projectParser: DotnetProjectParser,
): UninstallPackageCommand {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const vscodeApi: typeof import('vscode') = require('vscode');

  const progressReporter: IProgressReporter = {
    withProgress: async (options, task) => {
      return await vscodeApi.window.withProgress(
        {
          location: vscodeApi.ProgressLocation.Window,
          title: options.title,
          cancellable: options.cancellable,
        },
        task as any,
      );
    },
  };

  return new UninstallPackageCommand(packageCliService, logger, progressReporter, projectParser);
}
