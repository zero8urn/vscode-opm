/**
 * Unit tests for GetProjectsHandler
 *
 * Tests project listing request handling.
 */

import { describe, test, expect, mock } from 'bun:test';
import { GetProjectsHandler } from '../getProjectsHandler';
import { MockVsCodeRuntime } from '../../../core/vscodeRuntime';
import type { MessageContext } from '../../mediator/webviewMessageMediator';
import type { GetProjectsRequestMessage } from '../../apps/packageBrowser/types';

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

describe('GetProjectsHandler', () => {
  test('has correct message type', () => {
    const handler = new GetProjectsHandler(new MockVsCodeRuntime());
    expect(handler.messageType).toBe('getProjects');
  });

  describe('Message Validation', () => {
    test('warns and returns early for invalid message format', async () => {
      const handler = new GetProjectsHandler(new MockVsCodeRuntime());
      const context = createMockContext();

      await handler.handle({ type: 'wrong' }, context);

      expect(context.logger.warn).toHaveBeenCalledWith('Invalid getProjectsRequest message', { type: 'wrong' });
      expect(context.webview.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('Service Availability', () => {
    test('errors when solutionContext is not available', async () => {
      const handler = new GetProjectsHandler(new MockVsCodeRuntime());
      const context = createMockContext(undefined);

      const message: GetProjectsRequestMessage = {
        type: 'getProjects',
        payload: {
          requestId: 'req-1',
        },
      };

      await handler.handle(message, context);

      expect(context.logger.error).toHaveBeenCalledWith('SolutionContext service not available');
      expect(context.webview.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('Successful Project Listing', () => {
    test('sends project list response', async () => {
      const mockProjects = [
        { name: 'ProjectA', path: '/workspace/ProjectA.csproj' },
        { name: 'ProjectB', path: '/workspace/ProjectB.csproj' },
      ];

      const solutionContext = {
        getContext: mock(() => ({
          projects: mockProjects,
        })),
      };

      const handler = new GetProjectsHandler(new MockVsCodeRuntime());
      const context = createMockContext(solutionContext);

      const message: GetProjectsRequestMessage = {
        type: 'getProjects',
        payload: {
          requestId: 'req-projects',
        },
      };

      await handler.handle(message, context);

      expect(context.webview.postMessage).toHaveBeenCalledTimes(1);
      const response = (context.webview.postMessage as any).mock.calls[0]?.[0];
      expect(response.type).toBe('notification');
      expect(response.name).toBe('getProjectsResponse');
      expect(response.args.requestId).toBe('req-projects');
      expect(response.args.projects).toHaveLength(2);
    });

    test('logs info with project count', async () => {
      const solutionContext = {
        getContext: mock(() => ({
          projects: [{}, {}, {}, {}],
        })),
      };

      const handler = new GetProjectsHandler(new MockVsCodeRuntime());
      const context = createMockContext(solutionContext);

      const message: GetProjectsRequestMessage = {
        type: 'getProjects',
        payload: {
          requestId: 'req-1',
        },
      };

      await handler.handle(message, context);

      expect(context.logger.info).toHaveBeenCalledWith('Projects sent to webview', {
        projectCount: 4,
        requestId: 'req-1',
      });
    });
  });

  describe('Error Handling', () => {
    test('logs error and sends empty projects on exception', async () => {
      const error = new Error('Context failure');
      const solutionContext = {
        getContext: mock(() => {
          throw error;
        }),
      };

      const handler = new GetProjectsHandler(new MockVsCodeRuntime());
      const context = createMockContext(solutionContext);

      const message: GetProjectsRequestMessage = {
        type: 'getProjects',
        payload: {
          requestId: 'req-err',
        },
      };

      await handler.handle(message, context);

      expect(context.logger.error).toHaveBeenCalledWith('Failed to get projects', error);
      expect(context.webview.postMessage).toHaveBeenCalledTimes(1);
      const response = (context.webview.postMessage as any).mock.calls[0]?.[0];
      expect(response.args.projects).toEqual([]);
    });
  });
});
