/**
 * Unit tests for UpdatePackageHandler.
 */

import { describe, test, expect, mock } from 'bun:test';
import { UpdatePackageHandler } from '../updatePackageHandler';
import { MockVsCodeRuntime } from '../../../core/vscodeRuntime';
import { PackageOperationErrorCode } from '../../../services/cli/types/packageOperation';
import type { MessageContext } from '../../mediator/webviewMessageMediator';
import type { UpdatePackageRequestMessage } from '../../apps/packageBrowser/types';

function createMockContext(solutionContext?: any, cacheNotifier?: any): MessageContext {
  return {
    webview: {
      postMessage: mock(async () => true),
    } as any,
    logger: {
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
      debug: mock(() => {}),
    } as any,
    services: {
      solutionContext,
      cacheNotifier,
    } as any,
  };
}

describe('UpdatePackageHandler', () => {
  test('has correct message type', () => {
    const handler = new UpdatePackageHandler(new MockVsCodeRuntime());
    expect(handler.messageType).toBe('updatePackageRequest');
  });

  describe('Message Validation', () => {
    test('warns and returns early for invalid message format', async () => {
      const handler = new UpdatePackageHandler(new MockVsCodeRuntime());
      const context = createMockContext();

      await handler.handle({ type: 'wrong' }, context);

      expect(context.logger.warn).toHaveBeenCalledWith('Invalid updatePackageRequest message', { type: 'wrong' });
      expect(context.webview.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('Service Availability', () => {
    test('errors when solutionContext is not available', async () => {
      const handler = new UpdatePackageHandler(new MockVsCodeRuntime());
      const context = createMockContext(undefined);

      const message: UpdatePackageRequestMessage = {
        type: 'updatePackageRequest',
        payload: {
          packageId: 'Newtonsoft.Json',
          toVersion: '14.0.1',
          projectPaths: ['/test.csproj'],
          requestId: 'req-1',
        },
      };

      await handler.handle(message, context);

      expect(context.logger.error).toHaveBeenCalledWith('SolutionContext service not available');
      expect(context.webview.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('Request Handling', () => {
    test('executes update command, posts response, and invalidates cache for successful updates', async () => {
      const solutionContext = {
        getContext: mock(() => ({
          projects: [
            {
              name: 'App',
              path: '/workspace/src/App/App.csproj',
              frameworks: ['net8.0'],
            },
            {
              name: 'Lib',
              path: '/workspace/src/Lib/Lib.csproj',
              frameworks: ['net8.0'],
            },
          ],
        })),
      };
      const cacheNotifier = {
        notifyProjectsChanged: mock(() => {}),
      };
      const context = createMockContext(solutionContext, cacheNotifier);
      const runtime = new MockVsCodeRuntime();

      (runtime as any).commandsExecuteStub = async (commandId: string, params: unknown) => {
        expect(commandId).toBe('opm.updatePackage');
        expect(params).toEqual({
          packageId: 'Newtonsoft.Json',
          toVersion: '14.0.1',
          projectPaths: ['/workspace/src/App/App.csproj', '/workspace/src/Lib/Lib.csproj'],
        });

        return {
          success: true,
          results: [
            {
              projectPath: '/workspace/src/App/App.csproj',
              success: true,
            },
            {
              projectPath: '/workspace/src/Lib/Lib.csproj',
              success: false,
              error: 'Dependency conflict',
              errorCode: PackageOperationErrorCode.DependencyConflict,
              errorDetails: 'Package is required by another dependency',
            },
          ],
        };
      };

      const handler = new UpdatePackageHandler(runtime);
      const message: UpdatePackageRequestMessage = {
        type: 'updatePackageRequest',
        payload: {
          packageId: 'Newtonsoft.Json',
          toVersion: '14.0.1',
          projectPaths: ['/workspace/src/App/App.csproj', '/workspace/src/Lib/Lib.csproj'],
          requestId: 'req-update-1',
        },
      };

      await handler.handle(message, context);

      expect(cacheNotifier.notifyProjectsChanged).toHaveBeenCalledTimes(1);
      expect(context.logger.debug).toHaveBeenCalledWith('Notified webview of project changes after update');

      const response = (context.webview.postMessage as any).mock.calls[0]?.[0];
      expect(response).toEqual({
        type: 'notification',
        name: 'updatePackageResponse',
        args: {
          packageId: 'Newtonsoft.Json',
          toVersion: '14.0.1',
          success: true,
          results: [
            {
              projectPath: '/workspace/src/App/App.csproj',
              success: true,
              error: undefined,
              errorCode: undefined,
              errorDetails: undefined,
            },
            {
              projectPath: '/workspace/src/Lib/Lib.csproj',
              success: false,
              error: 'Dependency conflict',
              errorCode: PackageOperationErrorCode.DependencyConflict,
              errorDetails: 'Package is required by another dependency',
            },
          ],
          updatedProjects: [
            {
              projectPath: '/workspace/src/App/App.csproj',
              installedVersion: '14.0.1',
              name: 'App',
              relativePath: '/workspace/src/App/App.csproj',
              frameworks: ['net8.0'],
            },
          ],
          requestId: 'req-update-1',
        },
      });

      expect(runtime.getMessages('warning')).toContain(
        'Dependency conflict detected while updating Newtonsoft.Json. Remove dependent packages first or review project dependencies.',
      );
      expect(runtime.getMessages('warning')).toContain('Updated Newtonsoft.Json in 1 of 2 projects');
    });

    test('shows targeted warnings and error toast when all updates fail', async () => {
      const solutionContext = {
        getContext: mock(() => ({ projects: [] })),
      };
      const context = createMockContext(solutionContext);
      const runtime = new MockVsCodeRuntime();

      (runtime as any).commandsExecuteStub = async () => ({
        success: false,
        results: [
          {
            projectPath: '/workspace/src/App/App.csproj',
            success: false,
            error: 'License acceptance required',
            errorCode: PackageOperationErrorCode.LicenseAcceptanceRequired,
          },
          {
            projectPath: '/workspace/src/Lib/Lib.csproj',
            success: false,
            error: 'Framework mismatch',
            errorCode: PackageOperationErrorCode.FrameworkIncompatible,
          },
        ],
      });

      const handler = new UpdatePackageHandler(runtime);
      const message: UpdatePackageRequestMessage = {
        type: 'updatePackageRequest',
        payload: {
          packageId: 'Newtonsoft.Json',
          toVersion: '14.0.1',
          projectPaths: ['/workspace/src/App/App.csproj', '/workspace/src/Lib/Lib.csproj'],
          requestId: 'req-update-2',
        },
      };

      await handler.handle(message, context);

      expect(runtime.getMessages('warning')).toContain(
        'Updating Newtonsoft.Json to 14.0.1 requires license acceptance. Review the package license in NuGet before retrying.',
      );
      expect(runtime.getMessages('warning')).toContain(
        'Some selected projects are incompatible with Newtonsoft.Json 14.0.1. Check target frameworks and package dependency groups before retrying.',
      );
      expect(runtime.getMessages('error')).toContain('Failed to update Newtonsoft.Json to 14.0.1');
    });

    test('posts command execution error response when command throws', async () => {
      const solutionContext = {
        getContext: mock(() => ({ projects: [] })),
      };
      const context = createMockContext(solutionContext);
      const runtime = new MockVsCodeRuntime();
      const error = new Error('update blew up');

      (runtime as any).commandsExecuteStub = async () => {
        throw error;
      };

      const handler = new UpdatePackageHandler(runtime);
      const message: UpdatePackageRequestMessage = {
        type: 'updatePackageRequest',
        payload: {
          packageId: 'Newtonsoft.Json',
          toVersion: '14.0.1',
          projectPaths: ['/workspace/src/App/App.csproj'],
          requestId: 'req-update-3',
        },
      };

      await handler.handle(message, context);

      expect(context.logger.error).toHaveBeenCalledWith('Error executing update command', error);

      const response = (context.webview.postMessage as any).mock.calls[0]?.[0];
      expect(response).toEqual({
        type: 'notification',
        name: 'updatePackageResponse',
        args: {
          packageId: 'Newtonsoft.Json',
          toVersion: '14.0.1',
          success: false,
          results: [],
          requestId: 'req-update-3',
          error: {
            message: 'update blew up',
            code: 'CommandExecutionError',
          },
        },
      });
    });
  });
});
