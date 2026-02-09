/**
 * UninstallPackageHandler — Handles package uninstallation requests.
 */

import * as path from 'node:path';
import type { IMessageHandler, MessageContext } from '../mediator/webviewMessageMediator';
import type { UninstallPackageRequestMessage, UninstallPackageResponseMessage } from '../apps/packageBrowser/types';
import { isUninstallPackageRequestMessage } from '../apps/packageBrowser/types';
import type { SolutionContextService } from '../../services/context/solutionContextService';
import type { IVsCodeRuntime } from '../../core/vscodeRuntime';
import {
  UninstallPackageCommand,
  type UninstallPackageParams,
  type UninstallPackageResult,
} from '../../commands/uninstallPackageCommand';

export class UninstallPackageHandler implements IMessageHandler<UninstallPackageRequestMessage, void> {
  readonly messageType = 'uninstallPackageRequest';

  constructor(private readonly runtime?: IVsCodeRuntime) {}

  async handle(request: unknown, context: MessageContext): Promise<void> {
    if (!isUninstallPackageRequestMessage(request)) {
      context.logger.warn('Invalid uninstallPackageRequest message', request);
      return;
    }

    const solutionContext = context.services.solutionContext as SolutionContextService | undefined;
    if (!solutionContext) {
      context.logger.error('SolutionContext service not available');
      return;
    }

    const { packageId, projectPaths, requestId } = request.payload;

    context.logger.info('Uninstall package request received', {
      packageId,
      projectCount: projectPaths.length,
      requestId,
    });

    try {
      const runtime = this.runtime ?? ((context.services as any).runtime as IVsCodeRuntime | undefined);
      if (!runtime) throw new Error('VS Code runtime not available');

      // Invoke the internal uninstall command
      const result = await runtime.commands.executeCommand<UninstallPackageResult>(UninstallPackageCommand.id, {
        packageId,
        projectPaths,
      } as UninstallPackageParams);

      const successCount = result.results.filter(r => r.success).length;

      context.logger.info('Uninstall command completed', {
        packageId,
        success: result.success,
        successCount,
        totalCount: result.results.length,
        requestId,
      });

      const ctx = solutionContext.getContext();
      const workspaceFolder = runtime.workspace.workspaceFolders?.[0];
      const workspaceRoot = workspaceFolder?.uri.fsPath ?? '';

      const updatedProjects = result.results.map(r => {
        const proj = ctx.projects.find(p => p.path === r.projectPath);
        const relativePath = workspaceRoot ? path.relative(workspaceRoot, r.projectPath) : r.projectPath;
        return {
          projectPath: r.projectPath,
          installedVersion: r.success ? undefined : undefined,
          name: proj?.name,
          relativePath,
          frameworks: (proj as any)?.frameworks ?? [],
        };
      });

      const response: UninstallPackageResponseMessage = {
        type: 'notification',
        name: 'uninstallPackageResponse',
        args: {
          packageId,
          success: result.success,
          results: result.results.map(r => ({
            projectPath: r.projectPath,
            success: r.success,
            error: r.error,
          })),
          updatedProjects,
          requestId,
        },
      };

      await context.webview.postMessage(response);

      // Show error toast notifications only (success is evident from UI update)
      if (!result.success) {
        runtime.showErrorMessage(`Failed to uninstall ${packageId}`, 'View Logs');
      } else if (!result.results.every(r => r.success)) {
        // Partial success
        runtime.showWarningMessage(
          `Uninstalled ${packageId} from ${successCount} of ${result.results.length} projects`,
        );
      }
    } catch (error) {
      context.logger.error(
        'Error executing uninstall command',
        error instanceof Error ? error : new Error(String(error)),
      );

      const response: UninstallPackageResponseMessage = {
        type: 'notification',
        name: 'uninstallPackageResponse',
        args: {
          packageId,
          success: false,
          results: [],
          requestId,
          error: {
            message: error instanceof Error ? error.message : 'Failed to uninstall package',
            code: 'CommandExecutionError',
          },
        },
      };

      await context.webview.postMessage(response);
    }
  }
}
