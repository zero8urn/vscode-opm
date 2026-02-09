/**
 * Unit tests for UninstallPackageHandler
 *
 * Tests package uninstallation request handling.
 */

import { describe, test, expect, mock } from 'bun:test';
import { UninstallPackageHandler } from '../uninstallPackageHandler';
import { MockVsCodeRuntime } from '../../../core/vscodeRuntime';
import type { MessageContext } from '../../mediator/webviewMessageMediator';
import type { UninstallPackageRequestMessage } from '../../apps/packageBrowser/types';

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

describe('UninstallPackageHandler', () => {
  test('has correct message type', () => {
    const handler = new UninstallPackageHandler(new MockVsCodeRuntime());
    expect(handler.messageType).toBe('uninstallPackageRequest');
  });

  describe('Message Validation', () => {
    test('warns and returns early for invalid message format', async () => {
      const handler = new UninstallPackageHandler(new MockVsCodeRuntime());
      const context = createMockContext();

      await handler.handle({ type: 'wrong' }, context);

      expect(context.logger.warn).toHaveBeenCalledWith('Invalid uninstallPackageRequest message', { type: 'wrong' });
      expect(context.webview.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('Service Availability', () => {
    test('errors when solutionContext is not available', async () => {
      const handler = new UninstallPackageHandler(new MockVsCodeRuntime());
      const context = createMockContext(undefined);

      const message: UninstallPackageRequestMessage = {
        type: 'uninstallPackageRequest',
        payload: {
          packageId: 'Newtonsoft.Json',
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
    test('logs info with uninstall details', async () => {
      const solutionContext = {
        getContext: mock(() => ({ projects: [] })),
      };

      const handler = new UninstallPackageHandler(new MockVsCodeRuntime());
      const context = createMockContext(solutionContext);

      const message: UninstallPackageRequestMessage = {
        type: 'uninstallPackageRequest',
        payload: {
          packageId: 'Newtonsoft.Json',
          projectPaths: ['/a.csproj', '/b.csproj', '/c.csproj'],
          requestId: 'req-uninstall-123',
        },
      };

      const mockRuntime = new MockVsCodeRuntime();
      (mockRuntime as any).commandsExecuteStub = async () => ({ success: false, results: [] });

      const handlerWithRuntime = new UninstallPackageHandler(mockRuntime);
      await handlerWithRuntime.handle(message, context);

      expect(context.logger.info).toHaveBeenCalledWith('Uninstall package request received', {
        packageId: 'Newtonsoft.Json',
        projectCount: 3,
        requestId: 'req-uninstall-123',
      });
    });
  });
});
