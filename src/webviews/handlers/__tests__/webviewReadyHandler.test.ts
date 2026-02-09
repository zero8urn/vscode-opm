/**
 * Unit tests for WebviewReadyHandler
 *
 * Tests webview initialization and project discovery handling.
 */

import { describe, test, expect, mock } from 'bun:test';
import { WebviewReadyHandler } from '../webviewReadyHandler';
import { MockVsCodeRuntime } from '../../../core/vscodeRuntime';
import type { MessageContext } from '../../mediator/webviewMessageMediator';
import type { WebviewReadyMessage } from '../../apps/packageBrowser/types';

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

describe('WebviewReadyHandler', () => {
  test('has correct message type', () => {
    const handler = new WebviewReadyHandler(new MockVsCodeRuntime());
    expect(handler.messageType).toBe('ready');
  });

  describe('Message Validation', () => {
    test('warns and returns early for invalid message format', async () => {
      const handler = new WebviewReadyHandler(new MockVsCodeRuntime());
      const context = createMockContext();

      await handler.handle({ type: 'wrong' }, context);

      expect(context.logger.warn).toHaveBeenCalledWith('Invalid webviewReady message', { type: 'wrong' });
      expect(context.webview.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('Service Availability', () => {
    test('errors when solutionContext is not available', async () => {
      const handler = new WebviewReadyHandler(new MockVsCodeRuntime());
      const context = createMockContext(undefined);

      const message: WebviewReadyMessage = {
        type: 'ready',
      };

      await handler.handle(message, context);

      expect(context.logger.error).toHaveBeenCalledWith('SolutionContext service not available');
      expect(context.webview.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('Successful Discovery', () => {
    test('waits for discovery and sends projects', async () => {
      const mockProjects = [
        { name: 'Project1', path: '/workspace/Project1.csproj' },
        { name: 'Project2', path: '/workspace/Project2.csproj' },
      ];

      const solutionContext = {
        waitForDiscovery: mock(async () => {}),
        getContext: mock(() => ({
          projects: mockProjects,
        })),
      };

      const handler = new WebviewReadyHandler(new MockVsCodeRuntime());
      const context = createMockContext(solutionContext);

      const message: WebviewReadyMessage = {
        type: 'ready',
      };

      await handler.handle(message, context);

      expect(solutionContext.waitForDiscovery).toHaveBeenCalledTimes(1);
      expect(solutionContext.getContext).toHaveBeenCalledTimes(1);
      expect(context.webview.postMessage).toHaveBeenCalledTimes(1);
    });

    test('logs debug message about waiting for discovery', async () => {
      const solutionContext = {
        waitForDiscovery: mock(async () => {}),
        getContext: mock(() => ({ projects: [] })),
      };

      const handler = new WebviewReadyHandler(new MockVsCodeRuntime());
      const context = createMockContext(solutionContext);

      await handler.handle({ type: 'ready', payload: {} }, context);

      expect(context.logger.debug).toHaveBeenCalledWith('Webview ready - waiting for discovery then pushing projects');
    });

    test('logs info with project count after sending', async () => {
      const solutionContext = {
        waitForDiscovery: mock(async () => {}),
        getContext: mock(() => ({
          projects: [{}, {}, {}],
        })),
      };

      const handler = new WebviewReadyHandler(new MockVsCodeRuntime());
      const context = createMockContext(solutionContext);

      await handler.handle({ type: 'ready', payload: {} }, context);

      expect(context.logger.info).toHaveBeenCalledWith('Projects pushed to webview on ready', {
        projectCount: 3,
      });
    });

    test('sends getProjectsResponse with correct structure', async () => {
      const mockProjects = [{ name: 'TestProject', path: '/workspace/TestProject.csproj' }];

      const solutionContext = {
        waitForDiscovery: mock(async () => {}),
        getContext: mock(() => ({ projects: mockProjects })),
      };

      const handler = new WebviewReadyHandler(new MockVsCodeRuntime());
      const context = createMockContext(solutionContext);

      await handler.handle({ type: 'ready', payload: {} }, context);

      const response = (context.webview.postMessage as any).mock.calls[0]?.[0];
      expect(response.type).toBe('notification');
      expect(response.name).toBe('getProjectsResponse');
      expect(response.args.requestId).toBe('initial-push');
      expect(response.args.projects).toHaveLength(1);
      expect(response.args.projects[0].name).toBe('TestProject');
      expect(response.args.projects[0].path).toBe('/workspace/TestProject.csproj');
    });

    test('sets frameworks to empty array for initial push', async () => {
      const solutionContext = {
        waitForDiscovery: mock(async () => {}),
        getContext: mock(() => ({
          projects: [{ name: 'Test', path: '/test.csproj' }],
        })),
      };

      const handler = new WebviewReadyHandler(new MockVsCodeRuntime());
      const context = createMockContext(solutionContext);

      await handler.handle({ type: 'ready', payload: {} }, context);

      const response = (context.webview.postMessage as any).mock.calls[0]?.[0];
      expect(response.args.projects[0].frameworks).toEqual([]);
      expect(response.args.projects[0].installedVersion).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    test('logs error when discovery fails', async () => {
      const error = new Error('Discovery failed');
      const solutionContext = {
        waitForDiscovery: mock(async () => {
          throw error;
        }),
        getContext: mock(() => ({ projects: [] })),
      };

      const handler = new WebviewReadyHandler(new MockVsCodeRuntime());
      const context = createMockContext(solutionContext);

      await handler.handle({ type: 'ready', payload: {} }, context);

      expect(context.logger.error).toHaveBeenCalledWith('Failed to push projects on webview ready', error);
      expect(context.webview.postMessage).not.toHaveBeenCalled();
    });

    test('handles non-Error exceptions', async () => {
      const solutionContext = {
        waitForDiscovery: mock(async () => {
          throw 'string error';
        }),
        getContext: mock(() => ({ projects: [] })),
      };

      const handler = new WebviewReadyHandler(new MockVsCodeRuntime());
      const context = createMockContext(solutionContext);

      await handler.handle({ type: 'ready', payload: {} }, context);

      expect(context.logger.error).toHaveBeenCalled();
      const loggedError = (context.logger.error as any).mock.calls[0]?.[1];
      expect(loggedError).toBeInstanceOf(Error);
    });
  });
});
