/**
 * UpdatePackageHandler — Handles package update requests.
 */

import * as path from 'node:path';
import type { IMessageHandler, MessageContext } from '../mediator/webviewMessageMediator';
import type { UpdatePackageRequestMessage, UpdatePackageResponseMessage } from '../apps/packageBrowser/types';
import { isUpdatePackageRequestMessage } from '../apps/packageBrowser/types';
import type { SolutionContextService } from '../../services/context/solutionContextService';
import type { IVsCodeRuntime } from '../../core/vscodeRuntime';
import { PackageOperationErrorCode } from '../../services/cli/types/packageOperation';
import {
  UpdatePackageCommand,
  type UpdatePackageParams,
  type UpdatePackageResult,
} from '../../commands/updatePackageCommand';

export class UpdatePackageHandler implements IMessageHandler<UpdatePackageRequestMessage, void> {
  readonly messageType = 'updatePackageRequest';

  constructor(private readonly runtime?: IVsCodeRuntime) {}

  async handle(request: unknown, context: MessageContext): Promise<void> {
    if (!isUpdatePackageRequestMessage(request)) {
      context.logger.warn('Invalid updatePackageRequest message', request);
      return;
    }

    const solutionContext = context.services.solutionContext as SolutionContextService | undefined;
    if (!solutionContext) {
      context.logger.error('SolutionContext service not available');
      return;
    }

    const { packageId, toVersion, projectPaths, requestId } = request.payload;

    context.logger.info('Update package request received', {
      packageId,
      toVersion,
      projectCount: projectPaths.length,
      requestId,
    });

    try {
      const runtime = this.runtime ?? ((context.services as any).runtime as IVsCodeRuntime | undefined);
      if (!runtime) {
        throw new Error('VS Code runtime not available');
      }

      const result = await runtime.commands.executeCommand<UpdatePackageResult>(UpdatePackageCommand.id, {
        packageId,
        toVersion,
        projectPaths,
      } as UpdatePackageParams);

      if (!result || !Array.isArray(result.results)) {
        throw new Error('Update command did not return a valid result');
      }

      const successCount = result.results.filter(projectResult => projectResult.success).length;

      context.logger.info('Update command completed', {
        packageId,
        toVersion,
        success: result.success,
        successCount,
        totalCount: result.results.length,
        requestId,
      });

      const ctx = solutionContext.getContext();
      const workspaceFolder = runtime.workspace.workspaceFolders?.[0];
      const workspaceRoot = workspaceFolder?.uri.fsPath ?? '';

      const updatedProjects = result.results
        .filter(projectResult => projectResult.success)
        .map(projectResult => {
          const project = ctx.projects.find(candidate => candidate.path === projectResult.projectPath);
          const relativePath = workspaceRoot
            ? path.relative(workspaceRoot, projectResult.projectPath)
            : projectResult.projectPath;

          return {
            projectPath: projectResult.projectPath,
            installedVersion: toVersion,
            name: project?.name,
            relativePath,
            frameworks: (project as any)?.frameworks ?? [],
          };
        });

      if (result.success) {
        const cacheNotifier = (context.services as any).cacheNotifier;
        if (cacheNotifier) {
          cacheNotifier.notifyProjectsChanged();
          context.logger.debug('Notified webview of project changes after update');
        }
      }

      const failedResults = result.results.filter(projectResult => !projectResult.success);
      const hasDependencyConflict = failedResults.some(
        projectResult => projectResult.errorCode === PackageOperationErrorCode.DependencyConflict,
      );
      const hasLicenseAcceptanceError = failedResults.some(
        projectResult => projectResult.errorCode === PackageOperationErrorCode.LicenseAcceptanceRequired,
      );
      const hasFrameworkCompatibilityError = failedResults.some(
        projectResult => projectResult.errorCode === PackageOperationErrorCode.FrameworkIncompatible,
      );

      if (hasDependencyConflict) {
        await runtime.showWarningMessage(
          `Dependency conflict detected while updating ${packageId}. Remove dependent packages first or review project dependencies.`,
          'View Logs',
        );
      }

      if (hasLicenseAcceptanceError) {
        await runtime.showWarningMessage(
          `Updating ${packageId} to ${toVersion} requires license acceptance. Review the package license in NuGet before retrying.`,
          'View Logs',
        );
      }

      if (hasFrameworkCompatibilityError) {
        await runtime.showWarningMessage(
          `Some selected projects are incompatible with ${packageId} ${toVersion}. Check target frameworks and package dependency groups before retrying.`,
          'View Logs',
        );
      }

      const response: UpdatePackageResponseMessage = {
        type: 'notification',
        name: 'updatePackageResponse',
        args: {
          packageId,
          toVersion,
          success: result.success,
          results: result.results.map(projectResult => ({
            projectPath: projectResult.projectPath,
            success: projectResult.success,
            error: projectResult.error,
            errorCode: projectResult.errorCode,
            errorDetails: projectResult.errorDetails,
          })),
          updatedProjects,
          requestId,
        },
      };

      await context.webview.postMessage(response);

      if (!result.success) {
        await runtime.showErrorMessage(`Failed to update ${packageId} to ${toVersion}`, 'View Logs');
      } else if (!result.results.every(projectResult => projectResult.success)) {
        await runtime.showWarningMessage(
          `Updated ${packageId} in ${successCount} of ${result.results.length} projects`,
        );
      }
    } catch (error) {
      context.logger.error('Error executing update command', error instanceof Error ? error : new Error(String(error)));

      const response: UpdatePackageResponseMessage = {
        type: 'notification',
        name: 'updatePackageResponse',
        args: {
          packageId,
          toVersion,
          success: false,
          results: [],
          requestId,
          error: {
            message: error instanceof Error ? error.message : 'Failed to update package',
            code: 'CommandExecutionError',
          },
        },
      };

      await context.webview.postMessage(response);
    }
  }
}
