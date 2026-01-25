/**
 * Install Package Command Handler
 *
 * Internal command that orchestrates package installation from webview IPC messages
 * through to CLI execution, progress feedback, and UI state updates. This command
 * is NOT registered in package.json and is only invoked programmatically by the
 * Package Browser webview—never directly by users via the command palette.
 *
 * @module commands/installPackageCommand
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
 * Parameters for install package command.
 */
export interface InstallPackageParams {
  /** Package identifier (e.g., "Newtonsoft.Json") */
  packageId: string;

  /** Package version (e.g., "13.0.3" or "latest") */
  version: string;

  /** Absolute paths to target .csproj files */
  projectPaths: string[];
}

/**
 * Result of install package operation.
 */
export interface InstallPackageResult {
  /** Whether all installations succeeded */
  success: boolean;

  /** Per-project installation results */
  results: ProjectInstallResult[];
}

/**
 * Result for a single project installation.
 */
export interface ProjectInstallResult {
  /** Absolute path to project file */
  projectPath: string;

  /** Whether installation succeeded for this project */
  success: boolean;

  /** Error message if installation failed */
  error?: string;
}

/**
 * Install Package Command
 *
 * Coordinates package installation workflow:
 * 1. Validates input parameters
 * 2. Executes installations sequentially per project
 * 3. Shows progress notifications
 * 4. Invalidates caches on success
 * 5. Triggers tree view refresh
 * 6. Displays toast notifications
 */
export class InstallPackageCommand {
  static readonly id = 'opm.installPackage';

  constructor(
    private readonly packageCliService: PackageCliService,
    private readonly logger: ILogger,
    private readonly progressReporter: IProgressReporter,
    private readonly projectParser?: DotnetProjectParser,
  ) {}

  /**
   * Execute package installation.
   *
   * @param params - Installation parameters from webview
   * @returns Installation results for all projects
   * @throws Error if validation fails
   */
  async execute(params: InstallPackageParams): Promise<InstallPackageResult> {
    this.logger.info('Install package command invoked', {
      packageId: params.packageId,
      version: params.version,
      projectCount: params.projectPaths.length,
    });

    // Validate parameters
    this.validateParams(params);

    const results: ProjectInstallResult[] = [];

    // Execute with progress indicator (shows in status bar)
    await this.progressReporter.withProgress(
      {
        location: 'Window' as any, // ProgressLocation.Window
        title: `Installing ${params.packageId}`,
        cancellable: false, // Window progress doesn't support cancellation
      },
      async (progress, token) => {
        for (let i = 0; i < params.projectPaths.length; i++) {
          // Check for cancellation
          if (token.isCancellationRequested) {
            this.logger.warn('Installation cancelled by user', {
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
              message: `Installing to ${projectName} (${i + 1}/${params.projectPaths.length})...`,
              increment: 100 / params.projectPaths.length,
            });
          } else {
            progress.report({
              message: `Installing to ${projectName}...`,
            });
          }

          // Execute installation for this project
          const result = await this.installToProject(params.packageId, params.version, projectPath, token);

          results.push(result);

          // Stop on cancellation
          if (token.isCancellationRequested) {
            break;
          }
        }
      },
    );

    // Check if any installations succeeded
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    // Log completion summary (toast notifications handled by extension host message handler)
    if (successCount > 0 && failureCount === 0) {
      this.logger.info('All installations succeeded', { successCount });
    } else if (successCount > 0 && failureCount > 0) {
      this.logger.warn('Partial installation success', { successCount, failureCount });
    } else if (failureCount > 0) {
      const firstError = results.find(r => !r.success)?.error ?? 'Unknown error';
      this.logger.error('All installations failed', new Error(firstError));
    }

    // Invalidate cache for successfully installed projects
    if (this.projectParser && successCount > 0) {
      const successfulPaths = results.filter(r => r.success).map(r => r.projectPath);
      successfulPaths.forEach(projectPath => {
        this.projectParser!.invalidateCache(projectPath);
        this.logger.debug('Invalidated cache for project after install', { projectPath });
      });
    }

    // TODO: Refresh tree view (when InstalledPackagesProvider is available)

    return {
      success: successCount > 0,
      results,
    };
  }

  /**
   * Validate installation parameters.
   *
   * @param params - Parameters to validate
   * @throws Error if validation fails
   */
  private validateParams(params: InstallPackageParams): void {
    if (!params.packageId || params.packageId.trim().length === 0) {
      throw new Error('Package ID is required');
    }

    if (!params.version || params.version.trim().length === 0) {
      throw new Error('Package version is required');
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
   * Install package to a single project.
   *
   * @param packageId - Package identifier
   * @param version - Package version
   * @param projectPath - Absolute path to project file
   * @param token - Cancellation token
   * @returns Installation result for this project
   */
  private async installToProject(
    packageId: string,
    version: string,
    projectPath: string,
    token: ICancellationToken,
  ): Promise<ProjectInstallResult> {
    const projectName = path.basename(projectPath, '.csproj');

    this.logger.info(`Installing ${packageId} v${version} to ${projectName}`, {
      projectPath,
    });

    try {
      // Delegate to PackageCliService (token is compatible with vscode.CancellationToken)
      const result = await this.packageCliService.addPackage({
        projectPath,
        packageId,
        version: version === 'latest' ? undefined : version,
        cancellationToken: token as any as vscode.CancellationToken,
      });

      if (result.success) {
        this.logger.info(`Successfully installed ${packageId} to ${projectName}`);
        return {
          projectPath,
          success: true,
        };
      } else {
        const errorMessage = result.error?.message ?? 'Unknown error';
        this.logger.error(`Failed to install ${packageId} to ${projectName}: ${errorMessage}`);
        return {
          projectPath,
          success: false,
          error: errorMessage,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Exception installing ${packageId} to ${projectName}`,
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
 * Factory to create InstallPackageCommand with real VS Code APIs.
 * Call this from extension.ts activation where vscode module is available.
 */
export function createInstallPackageCommand(
  packageCliService: PackageCliService,
  logger: ILogger,
  projectParser: DotnetProjectParser,
): InstallPackageCommand {
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

  return new InstallPackageCommand(packageCliService, logger, progressReporter, projectParser);
}
