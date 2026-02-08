/**
 * WebviewReadyHandler — Handles webview initialization.
 *
 * Waits for project discovery to complete, then pushes the list of discovered projects
 * to the webview client.
 */

import * as path from 'node:path';
import type { IMessageHandler, MessageContext } from '../mediator/webviewMessageMediator';
import type { WebviewReadyMessage, GetProjectsResponseMessage, ProjectInfo } from '../apps/packageBrowser/types';
import { isWebviewReadyMessage } from '../apps/packageBrowser/types';
import type { SolutionContextService } from '../../services/context/solutionContextService';
import type { IVsCodeRuntime } from '../../core/vscodeRuntime';

/**
 * Handler for 'ready' message from webview.
 */
export class WebviewReadyHandler implements IMessageHandler<WebviewReadyMessage, void> {
  readonly messageType = 'ready';

  constructor(private readonly runtime?: IVsCodeRuntime) {}

  async handle(request: unknown, context: MessageContext): Promise<void> {
    if (!isWebviewReadyMessage(request)) {
      context.logger.warn('Invalid webviewReady message', request);
      return;
    }

    const solutionContext = context.services.solutionContext as SolutionContextService | undefined;
    if (!solutionContext) {
      context.logger.error('SolutionContext service not available');
      return;
    }

    context.logger.debug('Webview ready - waiting for discovery then pushing projects');

    // Wait for any in-progress discovery to complete before pushing
    // This ensures we push actual projects, not an empty list
    try {
      await solutionContext.waitForDiscovery();

      const ctx = solutionContext.getContext();

      const runtime = this.runtime ?? ((context.services as any).runtime as IVsCodeRuntime | undefined);
      const workspaceFolder = runtime?.workspace.workspaceFolders?.[0];
      const workspaceRoot = workspaceFolder?.uri.fsPath ?? '';

      const projects: ProjectInfo[] = ctx.projects.map(project => {
        const relativePath = workspaceRoot ? path.relative(workspaceRoot, project.path) : project.path;

        return {
          name: project.name,
          path: project.path,
          relativePath,
          frameworks: [],
          installedVersion: undefined, // No packageId yet, so no installed status
        };
      });

      const response: GetProjectsResponseMessage = {
        type: 'notification',
        name: 'getProjectsResponse',
        args: {
          requestId: 'initial-push',
          projects,
        },
      };

      await context.webview.postMessage(response);

      context.logger.info('Projects pushed to webview on ready', {
        projectCount: projects.length,
      });
    } catch (error) {
      context.logger.error(
        'Failed to push projects on webview ready',
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}
