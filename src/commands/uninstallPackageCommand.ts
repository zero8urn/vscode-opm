/**
 * Uninstall Package Command Handler
 *
 * Internal command that orchestrates package uninstallation from webview IPC messages
 * through to CLI execution, progress feedback, and UI state updates. This command
 * is NOT registered in package.json and is only invoked programmatically by the
 * Package Browser webview—never directly by users via the command palette.
 *
 * Extends PackageOperationCommand base class to leverage Template Method pattern,
 * implementing only uninstall-specific validation and execution logic.
 *
 * @module commands/uninstallPackageCommand
 */

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
 * @deprecated Use OperationSummary from base class
 */
export interface UninstallPackageResult {
  /** Whether all uninstalls succeeded */
  success: boolean;

  /** Per-project uninstallation results */
  results: ProjectUninstallResult[];
}

/**
 * Result for a single project uninstallation.
 * @deprecated Use ProjectOperationResult from base class
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
 * Coordinates package uninstallation workflow using Template Method pattern.
 * Base class handles validation, batching, progress, caching, and result aggregation.
 * This class provides only uninstall-specific logic.
 */
export class UninstallPackageCommand extends PackageOperationCommand<UninstallPackageParams> {
  static readonly id = 'opm.uninstallPackage';

  protected getCommandName(): string {
    return 'Uninstall package command';
  }

  protected getLogContext(params: UninstallPackageParams): Record<string, any> {
    return {
      packageId: params.packageId,
      projectCount: params.projectPaths.length,
    };
  }

  protected validateParams(params: UninstallPackageParams): void {
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
  }

  protected getProgressTitle(params: UninstallPackageParams): string {
    return `Uninstalling ${params.packageId}`;
  }

  protected getProjectMessage(
    params: UninstallPackageParams,
    projectName: string,
    processedCount: number,
    totalCount: number,
  ): string {
    if (totalCount > 1) {
      return `Uninstalling from ${projectName} (${processedCount}/${totalCount})...`;
    }
    return `Uninstalling from ${projectName}...`;
  }

  protected async executeOnProject(
    params: UninstallPackageParams,
    projectPath: string,
    token: ICancellationToken,
  ): Promise<ProjectOperationResult> {
    const projectName = path.basename(projectPath, '.csproj');

    this.logger.info(`Uninstalling ${params.packageId} from ${projectName}`, {
      projectPath,
    });

    try {
      // Delegate to PackageCliService
      const result = await this.packageCliService.removePackage({
        projectPath,
        packageId: params.packageId,
      });

      if (result.success) {
        this.logger.info(`Successfully uninstalled ${params.packageId} from ${projectName}`);

        // Publish package:uninstalled event for cross-component notification
        this.eventBus.emit('package:uninstalled', {
          packageId: params.packageId,
          projectPath,
        });

        return {
          projectPath,
          success: true,
        };
      } else {
        const errorMessage = result.error?.message ?? 'Unknown error';
        this.logger.error(`Failed to uninstall ${params.packageId} from ${projectName}: ${errorMessage}`);
        return {
          projectPath,
          success: false,
          error: errorMessage,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Exception uninstalling ${params.packageId} from ${projectName}`,
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
  runtime: IVsCodeRuntime,
  eventBus: IEventBus,
): UninstallPackageCommand {
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

  return new UninstallPackageCommand(packageCliService, logger, progressReporter, eventBus, projectParser);
}
