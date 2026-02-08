/**
 * Install Package Command Handler
 *
 * Internal command that orchestrates package installation from webview IPC messages
 * through to CLI execution, progress feedback, and UI state updates. This command
 * is NOT registered in package.json and is only invoked programmatically by the
 * Package Browser webview—never directly by users via the command palette.
 *
 * Extends PackageOperationCommand base class to leverage Template Method pattern,
 * implementing only install-specific validation and execution logic.
 *
 * @module commands/installPackageCommand
 */

import type * as vscode from 'vscode';
import * as path from 'node:path';
import type { ILogger } from '../services/loggerService';
import type { IVsCodeRuntime } from '../core/vscodeRuntime';
import type { IEventBus } from '../core/eventBus';
import type { PackageCliService } from '../services/cli/packageCliService';
import type { DotnetProjectParser } from '../services/cli/dotnetProjectParser';
import {
  PackageOperationCommand,
  type ICancellationToken,
  type IProgressReporter,
  type ProjectOperationResult,
} from './base/packageOperationCommand';

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
 * @deprecated Use OperationSummary from base class
 */
export interface InstallPackageResult {
  /** Whether all installations succeeded */
  success: boolean;

  /** Per-project installation results */
  results: ProjectInstallResult[];
}

/**
 * Result for a single project installation.
 * @deprecated Use ProjectOperationResult from base class
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
 * Coordinates package installation workflow using Template Method pattern.
 * Base class handles validation, batching, progress, caching, and result aggregation.
 * This class provides only install-specific logic.
 */
export class InstallPackageCommand extends PackageOperationCommand<InstallPackageParams> {
  static readonly id = 'opm.installPackage';

  protected getCommandName(): string {
    return 'Install package command';
  }

  protected getLogContext(params: InstallPackageParams): Record<string, any> {
    return {
      packageId: params.packageId,
      version: params.version,
      projectCount: params.projectPaths.length,
    };
  }

  protected validateParams(params: InstallPackageParams): void {
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
  }

  protected getProgressTitle(params: InstallPackageParams): string {
    return `Installing ${params.packageId}`;
  }

  protected getProjectMessage(
    params: InstallPackageParams,
    projectName: string,
    processedCount: number,
    totalCount: number,
  ): string {
    if (totalCount > 1) {
      return `Installing to ${projectName} (${processedCount}/${totalCount})...`;
    }
    return `Installing to ${projectName}...`;
  }

  protected async executeOnProject(
    params: InstallPackageParams,
    projectPath: string,
    token: ICancellationToken,
  ): Promise<ProjectOperationResult> {
    const projectName = path.basename(projectPath, '.csproj');

    this.logger.info(`Installing ${params.packageId} v${params.version} to ${projectName}`, {
      projectPath,
    });

    try {
      // Delegate to PackageCliService (token is compatible with vscode.CancellationToken)
      const result = await this.packageCliService.addPackage({
        projectPath,
        packageId: params.packageId,
        version: params.version === 'latest' ? undefined : params.version,
        cancellationToken: token as any as vscode.CancellationToken,
      });

      if (result.success) {
        this.logger.info(`Successfully installed ${params.packageId} to ${projectName}`);

        // Publish package:installed event for cross-component notification
        this.eventBus.emit('package:installed', {
          packageId: params.packageId,
          version: params.version,
          projectPath,
        });

        return {
          projectPath,
          success: true,
        };
      } else {
        const errorMessage = result.error?.message ?? 'Unknown error';
        this.logger.error(`Failed to install ${params.packageId} to ${projectName}: ${errorMessage}`);
        return {
          projectPath,
          success: false,
          error: errorMessage,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Exception installing ${params.packageId} to ${projectName}`,
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
  runtime: IVsCodeRuntime,
  eventBus: IEventBus,
): InstallPackageCommand {
  const progressReporter: IProgressReporter = {
    withProgress: async (options, task) => {
      return await runtime.withProgress(
        {
          location: 15, // ProgressLocation.Window
          title: options.title,
          cancellable: options.cancellable,
        },
        task as any,
      );
    },
  };

  return new InstallPackageCommand(packageCliService, logger, progressReporter, eventBus, projectParser);
}
