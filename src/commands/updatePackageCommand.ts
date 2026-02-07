/**
 * Update Package Command Handler
 *
 * Demonstrates extensibility of Template Method pattern.
 * Updates a package by removing the old version and adding the new version.
 * Leverages all shared workflow logic from PackageOperationCommand base class.
 *
 * @module commands/updatePackageCommand
 */

import type * as vscode from 'vscode';
import * as path from 'node:path';
import type { ILogger } from '../services/loggerService';
import type { PackageCliService } from '../services/cli/packageCliService';
import type { DotnetProjectParser } from '../services/cli/dotnetProjectParser';
import {
  PackageOperationCommand,
  type ICancellationToken,
  type IProgressReporter,
  type ProjectOperationResult,
} from './base/packageOperationCommand';

/**
 * Parameters for update package command.
 */
export interface UpdatePackageParams {
  /** Package identifier (e.g., "Newtonsoft.Json") */
  packageId: string;

  /** Target version to update to */
  toVersion: string;

  /** Absolute paths to target .csproj files */
  projectPaths: string[];
}

/**
 * Update Package Command
 *
 * Proof of extensibility: Implementing a new command requires only ~60 LOC.
 * Updates package by removing then re-adding with new version.
 */
export class UpdatePackageCommand extends PackageOperationCommand<UpdatePackageParams> {
  static readonly id = 'opm.updatePackage';

  protected getCommandName(): string {
    return 'Update package command';
  }

  protected getLogContext(params: UpdatePackageParams): Record<string, any> {
    return {
      packageId: params.packageId,
      toVersion: params.toVersion,
      projectCount: params.projectPaths.length,
    };
  }

  protected validateParams(params: UpdatePackageParams): void {
    if (!params.packageId || params.packageId.trim().length === 0) {
      throw new Error('Package ID is required');
    }

    if (!params.toVersion || params.toVersion.trim().length === 0) {
      throw new Error('Target version is required');
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

  protected getProgressTitle(params: UpdatePackageParams): string {
    return `Updating ${params.packageId} to v${params.toVersion}`;
  }

  protected getProjectMessage(
    params: UpdatePackageParams,
    projectName: string,
    processedCount: number,
    totalCount: number,
  ): string {
    if (totalCount > 1) {
      return `Updating ${params.packageId} in ${projectName} (${processedCount}/${totalCount})...`;
    }
    return `Updating ${params.packageId} in ${projectName}...`;
  }

  protected async executeOnProject(
    params: UpdatePackageParams,
    projectPath: string,
    token: ICancellationToken,
  ): Promise<ProjectOperationResult> {
    const projectName = path.basename(projectPath, '.csproj');

    this.logger.info(`Updating ${params.packageId} to v${params.toVersion} in ${projectName}`, {
      projectPath,
    });

    try {
      // Step 1: Remove existing version
      const removeResult = await this.packageCliService.removePackage({
        projectPath,
        packageId: params.packageId,
      });

      if (!removeResult.success) {
        const errorMessage = removeResult.error?.message ?? 'Unknown error during removal';
        this.logger.error(`Failed to remove ${params.packageId} from ${projectName}: ${errorMessage}`);
        return {
          projectPath,
          success: false,
          error: errorMessage,
        };
      }

      // Step 2: Add new version
      const addResult = await this.packageCliService.addPackage({
        projectPath,
        packageId: params.packageId,
        version: params.toVersion === 'latest' ? undefined : params.toVersion,
        cancellationToken: token as any as vscode.CancellationToken,
      });

      if (addResult.success) {
        this.logger.info(`Successfully updated ${params.packageId} in ${projectName}`);
        return {
          projectPath,
          success: true,
        };
      } else {
        const errorMessage = addResult.error?.message ?? 'Unknown error during installation';
        this.logger.error(
          `Failed to install ${params.packageId} v${params.toVersion} in ${projectName}: ${errorMessage}`,
        );
        return {
          projectPath,
          success: false,
          error: errorMessage,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Exception updating ${params.packageId} in ${projectName}`,
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
 * Factory to create UpdatePackageCommand with real VS Code APIs.
 * Call this from extension.ts activation where vscode module is available.
 */
export function createUpdatePackageCommand(
  packageCliService: PackageCliService,
  logger: ILogger,
  projectParser: DotnetProjectParser,
): UpdatePackageCommand {
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

  return new UpdatePackageCommand(packageCliService, logger, progressReporter, projectParser);
}
