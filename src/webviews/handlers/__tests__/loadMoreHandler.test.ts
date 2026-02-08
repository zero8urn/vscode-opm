/**
 * Unit tests for LoadMoreHandler
 *
 * Tests pagination for search results.
 */

import { describe, test, expect, mock } from 'bun:test';
import { LoadMoreHandler } from '../loadMoreHandler';
import type { MessageContext } from '../../mediator/webviewMessageMediator';
import type { LoadMoreRequestMessage } from '../../apps/packageBrowser/types';

function createMockContext(searchService?: any): MessageContext {
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
      searchService,
    },
  };
}

describe('LoadMoreHandler', () => {
  test('has correct message type', () => {
    const handler = new LoadMoreHandler();
    expect(handler.messageType).toBe('loadMoreRequest');
  });

  describe('Message Validation', () => {
    test('warns and returns early for invalid message format', async () => {
      const handler = new LoadMoreHandler();
      const context = createMockContext();

      await handler.handle({ type: 'wrong' }, context);

      expect(context.logger.warn).toHaveBeenCalledWith('Invalid loadMoreRequest message', { type: 'wrong' });
      expect(context.webview.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('Service Availability', () => {
    test('errors when searchService is not available', async () => {
      const handler = new LoadMoreHandler();
      const context = createMockContext(undefined);

      const message: LoadMoreRequestMessage = {
        type: 'loadMoreRequest',
        payload: {
          requestId: 'req-1',
        },
      };

      await handler.handle(message, context);

      expect(context.logger.error).toHaveBeenCalledWith('SearchService not available');
      expect(context.webview.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('Successful Load More', () => {
    test('calls loadMore on search service', async () => {
      const loadMoreFn = mock(async () => ({
        error: null,
        packages: [],
        totalHits: 0,
        hasMore: false,
      }));

      const searchService = {
        loadNextPage: loadMoreFn,
        getState: mock(() => ({ loadedCount: 0, totalHits: 0, hasMore: false })),
      };

      const handler = new LoadMoreHandler();
      const context = createMockContext(searchService);

      const message: LoadMoreRequestMessage = {
        type: 'loadMoreRequest',
        payload: {
          requestId: 'req-loadmore',
        },
      };

      await handler.handle(message, context);

      expect(loadMoreFn).toHaveBeenCalledTimes(1);
    });

    test('sends loadMoreResponse with additional results', async () => {
      const mockPackages = [
        {
          id: 'Package.Page2',
          version: '2.0.0',
          description: 'Second page',
          authors: 'Author',
          totalDownloads: 500,
          verified: false,
        },
      ];

      const searchService = {
        loadNextPage: mock(async () => ({
          error: null,
          packages: mockPackages,
          totalHits: 100,
          hasMore: true,
        })),
        getState: mock(() => ({ loadedCount: 1, totalHits: 100, hasMore: true })),
      };

      const handler = new LoadMoreHandler();
      const context = createMockContext(searchService);

      const message: LoadMoreRequestMessage = {
        type: 'loadMoreRequest',
        payload: {
          requestId: 'req-page2',
        },
      };

      await handler.handle(message, context);

      expect(context.webview.postMessage).toHaveBeenCalledTimes(1);
      const response = (context.webview.postMessage as any).mock.calls[0]?.[0];
      expect(response.type).toBe('notification');
      expect(response.name).toBe('searchResponse');
      expect(response.args.results).toHaveLength(1);
      expect(response.args.hasMore).toBe(true);
      expect(response.args.requestId).toBe('req-page2');
    });

    test('logs debug info on successful load', async () => {
      const searchService = {
        loadNextPage: mock(async () => ({
          error: null,
          packages: [{}, {}, {}] as any,
          totalHits: 42,
          hasMore: false,
        })),
        getState: mock(() => ({ loadedCount: 3, totalHits: 42, hasMore: false })),
      };

      const handler = new LoadMoreHandler();
      const context = createMockContext(searchService);

      const message: LoadMoreRequestMessage = {
        type: 'loadMoreRequest',
        payload: {
          requestId: 'req-debug',
        },
      };

      await handler.handle(message, context);

      expect(context.webview.postMessage).toHaveBeenCalledTimes(1);
      const response = (context.webview.postMessage as any).mock.calls[0]?.[0];
      expect(response.args.results).toHaveLength(3);
    });
  });

  describe('Error Handling', () => {
    test('sends error response when loadMore returns error', async () => {
      const searchService = {
        loadNextPage: mock(async () => ({
          error: {
            code: 'Network',
            message: 'Failed to load more',
          },
          packages: [],
          totalHits: 0,
          hasMore: false,
        })),
        getState: mock(() => ({ loadedCount: 0, totalHits: 0, hasMore: false })),
      };

      const handler = new LoadMoreHandler();
      const context = createMockContext(searchService);

      const message: LoadMoreRequestMessage = {
        type: 'loadMoreRequest',
        payload: {
          requestId: 'req-err',
        },
      };

      await handler.handle(message, context);

      expect(context.webview.postMessage).toHaveBeenCalledTimes(1);
      const response = (context.webview.postMessage as any).mock.calls[0]?.[0];
      expect(response.args.error).toBeDefined();
    });

    test('logs error on unexpected exception', async () => {
      const error = new Error('Load failed');
      const searchService = {
        loadNextPage: mock(async () => {
          throw error;
        }),
        getState: mock(() => ({ loadedCount: 0, totalHits: 0, hasMore: false })),
      };

      const handler = new LoadMoreHandler();
      const context = createMockContext(searchService);

      await handler.handle({ type: 'loadMoreRequest', payload: { requestId: 'req-1' } }, context);

      expect(context.logger.error).toHaveBeenCalledWith('Unexpected error in load more handler', error);
    });
  });
});
