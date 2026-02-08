/**
 * GetProjectsHandler — Handles project listing and package installation status requests.
 */

import * as path from 'node:path';
import type { IMessageHandler, MessageContext } from '../mediator/webviewMessageMediator';
import type { GetProjectsRequestMessage, GetProjectsResponseMessage, ProjectInfo } from '../apps/packageBrowser/types';
import { isGetProjectsRequestMessage } from '../apps/packageBrowser/types';
import type { SolutionContextService } from '../../services/context/solutionContextService';
import type { IVsCodeRuntime } from '../../core/vscodeRuntime';
import type { DotnetProjectParser } from '../../services/cli/dotnetProjectParser';
import type { PackageReference } from '../../services/cli/types/projectMetadata';

export class GetProjectsHandler implements IMessageHandler<GetProjectsRequestMessage, void> {
  readonly messageType = 'getProjects';

  constructor(private readonly runtime?: IVsCodeRuntime) {}

  async handle(request: unknown, context: MessageContext): Promise<void> {
    if (!isGetProjectsRequestMessage(request)) {
      context.logger.warn('Invalid getProjectsRequest message', request);
      return;
    }

    const solutionContext = context.services.solutionContext as SolutionContextService | undefined;
    const projectParser = context.services.projectParser as DotnetProjectParser | undefined;

    if (!solutionContext) {
      context.logger.error('SolutionContext service not available');
      return;
    }

    const { requestId, packageId } = request.payload;

    // Only require a project parser when checking whether a specific package is installed
    if (packageId && !projectParser) {
      context.logger.error('ProjectParser service not available');
      return;
    }

    context.logger.info('Get projects request received', {
      requestId,
      packageId: packageId ?? 'none',
      checkInstalled: !!packageId,
    });

    try {
      const ctx = solutionContext.getContext();

      // Prefer runtime injected via constructor, otherwise fall back to context.services.runtime
      const runtime = this.runtime ?? ((context.services as any).runtime as IVsCodeRuntime | undefined);
      const workspaceFolder = runtime?.workspace.workspaceFolders?.[0];
      const workspaceRoot = workspaceFolder?.uri.fsPath ?? '';

      // Parse all projects in parallel if packageId provided
      const projectPaths = ctx.projects.map(p => p.path);
      const parseResults = packageId && projectParser ? await projectParser.parseProjects(projectPaths) : new Map();

      const projects: ProjectInfo[] = ctx.projects.map(project => {
        const relativePath = workspaceRoot ? path.relative(workspaceRoot, project.path) : project.path;

        // Check if package is installed in this project
        let installedVersion: string | undefined;
        if (packageId) {
          const parseResult = parseResults.get(project.path);
          if (parseResult?.success) {
            const pkg = parseResult.metadata.packageReferences.find(
              (ref: PackageReference) => ref.id.toLowerCase() === packageId.toLowerCase(),
            );
            installedVersion = pkg?.resolvedVersion;
          }
        }

        return {
          name: project.name,
          path: project.path,
          relativePath,
          frameworks: [],
          installedVersion,
        };
      });

      const response: GetProjectsResponseMessage = {
        type: 'notification',
        name: 'getProjectsResponse',
        args: {
          requestId,
          projects,
        },
      };

      context.logger.info('Projects sent to webview', {
        projectCount: projects.length,
        requestId,
      });

      await context.webview.postMessage(response);
    } catch (error) {
      const errObj = error instanceof Error ? error : new Error(String(error));
      context.logger.error('Failed to get projects', errObj);

      const response: GetProjectsResponseMessage = {
        type: 'notification',
        name: 'getProjectsResponse',
        args: {
          requestId,
          projects: [],
          error: {
            message: 'Failed to discover workspace projects.',
            code: 'ProjectDiscoveryError',
          },
        },
      };

      await context.webview.postMessage(response);
    }
  }
}
