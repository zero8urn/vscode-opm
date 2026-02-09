/**
 * Unit tests for RefreshProjectCacheHandler
 *
 * Tests project cache refresh request handling.
 */

import { describe, test, expect, mock } from 'bun:test';
import { RefreshProjectCacheHandler } from '../refreshProjectCacheHandler';
import type { MessageContext } from '../../mediator/webviewMessageMediator';
import type { RefreshProjectCacheRequestMessage } from '../../apps/packageBrowser/types';

function createMockContext(projectParser?: any, cacheNotifier?: any): MessageContext {
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
      projectParser,
      cacheNotifier,
    },
  };
}

describe('RefreshProjectCacheHandler', () => {
  test('has correct message type', () => {
    const handler = new RefreshProjectCacheHandler();
    expect(handler.messageType).toBe('refreshProjectCacheRequest');
  });

  describe('Message Validation', () => {
    test('warns and returns early for invalid message format', async () => {
      const handler = new RefreshProjectCacheHandler();
      const context = createMockContext(undefined, undefined);

      await handler.handle({ type: 'wrong' }, context);

      expect(context.logger.warn).toHaveBeenCalledWith('Invalid refreshProjectCacheRequest message', {
        type: 'wrong',
      });
      expect(context.webview.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('Service Availability', () => {
    test('errors when cacheNotifier is not available', async () => {
      const handler = new RefreshProjectCacheHandler();
      const context = createMockContext(undefined, undefined);

      const message: RefreshProjectCacheRequestMessage = {
        type: 'refreshProjectCache',
        payload: {
          requestId: 'req-1',
        },
      };

      await handler.handle(message, context);

      expect(context.logger.error).toHaveBeenCalledWith('Required services not available');
      expect(context.webview.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('Successful Cache Refresh', () => {
    test('calls invalidateCache on notifier', async () => {
      const notifyFn = mock(() => {});

      const projectParser = {
        cache: { clear: mock(() => {}) },
      };

      const cacheNotifier = {
        notifyProjectsChanged: notifyFn,
      };

      const handler = new RefreshProjectCacheHandler();
      const context = createMockContext(projectParser, cacheNotifier);

      const message: RefreshProjectCacheRequestMessage = {
        type: 'refreshProjectCache',
        payload: {
          requestId: 'req-refresh',
        },
      };

      await handler.handle(message, context);

      expect(notifyFn).toHaveBeenCalledTimes(1);
    });

    test('logs info on successful refresh', async () => {
      const projectParser = {
        cache: { clear: mock(() => {}) },
      };

      const cacheNotifier = {
        notifyProjectsChanged: mock(() => {}),
      };

      const handler = new RefreshProjectCacheHandler();
      const context = createMockContext(projectParser, cacheNotifier);

      const message: RefreshProjectCacheRequestMessage = {
        type: 'refreshProjectCache',
        payload: {
          requestId: 'req-log',
        },
      };

      await handler.handle(message, context);

      expect(context.logger.info).toHaveBeenCalledWith('Project cache cleared successfully', {
        requestId: 'req-log',
      });
    });
  });

  describe('Error Handling', () => {
    test('logs error and sends failure response on exception', async () => {
      const error = new Error('Cache refresh failed');
      const projectParser = {
        cache: {
          clear: mock(() => {
            throw error;
          }),
        },
      };

      const cacheNotifier = {
        notifyProjectsChanged: mock(() => {}),
      };

      const handler = new RefreshProjectCacheHandler();
      const context = createMockContext(projectParser, cacheNotifier);

      const message: RefreshProjectCacheRequestMessage = {
        type: 'refreshProjectCache',
        payload: {
          requestId: 'req-err',
        },
      };

      await handler.handle(message, context);

      expect(context.logger.error).toHaveBeenCalledWith('Error refreshing project cache', error);
    });
  });
});
