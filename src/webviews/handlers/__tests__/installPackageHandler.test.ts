/**
 * Unit tests for InstallPackageHandler
 *
 * Tests package installation request handling and VS Code command integration.
 */

import { describe, test, expect, mock } from 'bun:test';
import { InstallPackageHandler } from '../installPackageHandler';
import { MockVsCodeRuntime } from '../../../core/vscodeRuntime';
import type { MessageContext } from '../../mediator/webviewMessageMediator';
import type { InstallPackageRequestMessage } from '../../apps/packageBrowser/types';

function createMockContext(solutionContext?: any): MessageContext {
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
    },
  };
}

describe('InstallPackageHandler', () => {
  test('has correct message type', () => {
    const handler = new InstallPackageHandler(new MockVsCodeRuntime());
    expect(handler.messageType).toBe('installPackageRequest');
  });

  describe('Message Validation', () => {
    test('warns and returns early for invalid message format', async () => {
      const handler = new InstallPackageHandler(new MockVsCodeRuntime());
      const context = createMockContext();

      await handler.handle({ type: 'wrong' }, context);

      expect(context.logger.warn).toHaveBeenCalledWith('Invalid installPackageRequest message', { type: 'wrong' });
      expect(context.webview.postMessage).not.toHaveBeenCalled();
    });

    test('warns and returns early for missing payload fields', async () => {
      const handler = new InstallPackageHandler(new MockVsCodeRuntime());
      const context = createMockContext();

      await handler.handle({ type: 'installPackageRequest', payload: {} }, context);

      expect(context.logger.warn).toHaveBeenCalled();
      expect(context.webview.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('Service Availability', () => {
    test('errors when solutionContext is not available', async () => {
      const handler = new InstallPackageHandler(new MockVsCodeRuntime());
      const context = createMockContext(undefined);

      const message: InstallPackageRequestMessage = {
        type: 'installPackageRequest',
        payload: {
          packageId: 'Newtonsoft.Json',
          version: '13.0.3',
          projectPaths: ['/test.csproj'],
          requestId: 'req-1',
        },
      };

      await handler.handle(message, context);

      expect(context.logger.error).toHaveBeenCalledWith('SolutionContext service not available');
      expect(context.webview.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('Request Logging', () => {
    test('logs info with install details', async () => {
      const solutionContext = {
        getContext: mock(() => ({ projects: [] })),
      };

      const handler = new InstallPackageHandler(new MockVsCodeRuntime());
      const context = createMockContext(solutionContext);

      const message: InstallPackageRequestMessage = {
        type: 'installPackageRequest',
        payload: {
          packageId: 'Newtonsoft.Json',
          version: '13.0.3',
          projectPaths: ['/a.csproj', '/b.csproj'],
          requestId: 'req-123',
        },
      };

      // Provide a MockVsCodeRuntime that returns a fake executeCommand result
      const mockRuntime = new MockVsCodeRuntime();
      (mockRuntime as any).commandsExecuteStub = async () => ({ success: false, results: [] });

      const handlerWithRuntime = new InstallPackageHandler(mockRuntime);

      await handlerWithRuntime.handle(message, context);

      expect(context.logger.info).toHaveBeenCalledWith('Install package request received', {
        packageId: 'Newtonsoft.Json',
        version: '13.0.3',
        projectCount: 2,
        requestId: 'req-123',
      });
    });
  });
});
