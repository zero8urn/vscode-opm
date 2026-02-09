/**
 * InstallPackageHandler — Handles package installation requests.
 */

import * as path from 'node:path';
import type { IMessageHandler, MessageContext } from '../mediator/webviewMessageMediator';
import type { InstallPackageRequestMessage, InstallPackageResponseMessage } from '../apps/packageBrowser/types';
import { isInstallPackageRequestMessage } from '../apps/packageBrowser/types';
import type { SolutionContextService } from '../../services/context/solutionContextService';
import type { IVsCodeRuntime } from '../../core/vscodeRuntime';
import {
  InstallPackageCommand,
  type InstallPackageParams,
  type InstallPackageResult,
} from '../../commands/installPackageCommand';

export class InstallPackageHandler implements IMessageHandler<InstallPackageRequestMessage, void> {
  readonly messageType = 'installPackageRequest';

  constructor(private readonly runtime?: IVsCodeRuntime) {}

  async handle(request: unknown, context: MessageContext): Promise<void> {
    if (!isInstallPackageRequestMessage(request)) {
      context.logger.warn('Invalid installPackageRequest message', request);
      return;
    }

    const solutionContext = context.services.solutionContext as SolutionContextService | undefined;
    if (!solutionContext) {
      context.logger.error('SolutionContext service not available');
      return;
    }

    const { packageId, version, projectPaths, requestId } = request.payload;

    context.logger.info('Install package request received', {
      packageId,
      version,
      projectCount: projectPaths.length,
      requestId,
    });

    try {
      const runtime = this.runtime ?? ((context.services as any).runtime as IVsCodeRuntime | undefined);
      if (!runtime) throw new Error('VS Code runtime not available');

      // Invoke the internal install command
      const result = await runtime.commands.executeCommand<InstallPackageResult>(InstallPackageCommand.id, {
        packageId,
        version,
        projectPaths,
      } as InstallPackageParams);

      const successCount = result.results.filter(r => r.success).length;

      context.logger.info('Install command completed', {
        packageId,
        success: result.success,
        successCount,
        totalCount: result.results.length,
        requestId,
      });

      // Prepare minimal authoritative per-project updates
      const ctx = solutionContext.getContext();
      const workspaceFolder = runtime?.workspace.workspaceFolders?.[0];
      const workspaceRoot = workspaceFolder?.uri.fsPath ?? '';

      const updatedProjects = result.results.map(r => {
        const proj = ctx.projects.find(p => p.path === r.projectPath);
        const relativePath = workspaceRoot ? path.relative(workspaceRoot, r.projectPath) : r.projectPath;
        return {
          projectPath: r.projectPath,
          installedVersion: r.success ? version : undefined,
          name: proj?.name,
          relativePath,
          frameworks: (proj as any)?.frameworks ?? [],
        };
      });

      const response: InstallPackageResponseMessage = {
        type: 'notification',
        name: 'installPackageResponse',
        args: {
          packageId,
          version,
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
    } catch (error) {
      context.logger.error(
        'Error executing install command',
        error instanceof Error ? error : new Error(String(error)),
      );

      const response: InstallPackageResponseMessage = {
        type: 'notification',
        name: 'installPackageResponse',
        args: {
          packageId,
          version,
          success: false,
          results: [],
          requestId,
          error: {
            message: error instanceof Error ? error.message : 'Failed to install package',
            code: 'CommandExecutionError',
          },
        },
      };

      await context.webview.postMessage(response);
    }
  }
}
