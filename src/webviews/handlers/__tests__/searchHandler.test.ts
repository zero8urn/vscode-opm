/**
 * Unit tests for SearchHandler
 *
 * Tests package search message handling, including validation,
 * service integration, timeout handling, and error scenarios.
 */

import { describe, test, expect, mock } from 'bun:test';
import { SearchHandler } from '../searchHandler';
import type { MessageContext } from '../../mediator/webviewMessageMediator';
import type { SearchRequestMessage } from '../../apps/packageBrowser/types';

// Helper to create mock context
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

describe('SearchHandler', () => {
  test('has correct message type', () => {
    const handler = new SearchHandler();
    expect(handler.messageType).toBe('searchRequest');
  });

  describe('Message Validation', () => {
    test('warns and returns early for invalid message format', async () => {
      const handler = new SearchHandler();
      const context = createMockContext();

      await handler.handle({ type: 'wrong' }, context);

      expect(context.logger.warn).toHaveBeenCalledWith('Invalid searchRequest message', { type: 'wrong' });
      expect(context.webview.postMessage).not.toHaveBeenCalled();
    });

    test('warns and returns early for missing payload', async () => {
      const handler = new SearchHandler();
      const context = createMockContext();

      await handler.handle({ type: 'searchRequest' }, context);

      expect(context.logger.warn).toHaveBeenCalled();
      expect(context.webview.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('Service Availability', () => {
    test('errors when searchService is not available', async () => {
      const handler = new SearchHandler();
      const context = createMockContext(undefined); // No service

      const message: SearchRequestMessage = {
        type: 'searchRequest',
        payload: {
          query: 'Newtonsoft.Json',
          includePrerelease: false,
          requestId: 'req-1',
        },
      };

      await handler.handle(message, context);

      expect(context.logger.error).toHaveBeenCalledWith('SearchService not available');
      expect(context.webview.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('Successful Search', () => {
    test('calls searchService with correct parameters', async () => {
      const searchFn = mock(async () => ({
        error: null,
        packages: [],
        totalHits: 0,
        hasMore: false,
      }));

      const searchService = { search: searchFn };
      const handler = new SearchHandler();
      const context = createMockContext(searchService);

      const message: SearchRequestMessage = {
        type: 'searchRequest',
        payload: {
          query: 'Newtonsoft.Json',
          includePrerelease: true,
          requestId: 'req-123',
          sourceId: 'nuget.org',
        },
      };

      await handler.handle(message, context);

      expect(searchFn).toHaveBeenCalledTimes(1);
      const callArgs = searchFn.mock.calls[0] as unknown as [string, any, AbortSignal];
      const [query, options, signal] = callArgs;
      expect(query).toBe('Newtonsoft.Json');
      expect(options).toEqual({
        prerelease: true,
        sourceId: 'nuget.org',
      });
      expect(signal).toBeInstanceOf(AbortSignal);
    });

    test('logs info with request details', async () => {
      const searchService = {
        search: mock(async () => ({
          error: null,
          packages: [],
          totalHits: 0,
          hasMore: false,
        })),
      };

      const handler = new SearchHandler();
      const context = createMockContext(searchService);

      const message: SearchRequestMessage = {
        type: 'searchRequest',
        payload: {
          query: 'TestPackage',
          includePrerelease: false,
          requestId: 'req-456',
        },
      };

      await handler.handle(message, context);

      expect(context.logger.info).toHaveBeenCalledWith('Search request received', {
        query: 'TestPackage',
        includePrerelease: false,
        requestId: 'req-456',
        sourceId: undefined,
      });
    });

    test('sends success response with transformed packages', async () => {
      const mockPackages = [
        {
          id: 'Package.A',
          version: '1.0.0',
          description: 'Test package',
          authors: 'Test Author',
          totalDownloads: 1000,
          verified: false,
          iconUrl: undefined,
          projectUrl: undefined,
          licenseUrl: undefined,
        },
      ];

      const searchService = {
        search: mock(async () => ({
          error: null,
          packages: mockPackages,
          totalHits: 1,
          hasMore: false,
        })),
      };

      const handler = new SearchHandler();
      const context = createMockContext(searchService);

      const message: SearchRequestMessage = {
        type: 'searchRequest',
        payload: {
          query: 'Package.A',
          includePrerelease: false,
          requestId: 'req-789',
        },
      };

      await handler.handle(message, context);

      expect(context.webview.postMessage).toHaveBeenCalledTimes(1);
      const response = (context.webview.postMessage as any).mock.calls[0][0];
      expect(response.type).toBe('notification');
      expect(response.name).toBe('searchResponse');
      expect(response.args.query).toBe('Package.A');
      expect(response.args.results).toHaveLength(1);
      expect(response.args.results[0].id).toBe('Package.A');
      expect(response.args.totalHits).toBe(1);
      expect(response.args.hasMore).toBe(false);
      expect(response.args.requestId).toBe('req-789');
    });

    test('logs debug info on successful search', async () => {
      const searchService = {
        search: mock(async () => ({
          error: null,
          packages: [{}, {}, {}] as any,
          totalHits: 42,
          hasMore: true,
        })),
      };

      const handler = new SearchHandler();
      const context = createMockContext(searchService);

      const message: SearchRequestMessage = {
        type: 'searchRequest',
        payload: {
          query: 'test',
          includePrerelease: false,
          requestId: 'req-debug',
        },
      };

      await handler.handle(message, context);

      expect(context.logger.debug).toHaveBeenCalledWith('Search completed successfully', {
        packageCount: 3,
        totalHits: 42,
        hasMore: true,
        requestId: 'req-debug',
      });
    });
  });

  describe('Error Handling', () => {
    test('sends error response when search returns error', async () => {
      const searchService = {
        search: mock(async () => ({
          error: {
            code: 'Network',
            message: 'Connection failed',
          },
          packages: [],
          totalHits: 0,
          hasMore: false,
        })),
      };

      const handler = new SearchHandler();
      const context = createMockContext(searchService);

      const message: SearchRequestMessage = {
        type: 'searchRequest',
        payload: {
          query: 'FailingPackage',
          includePrerelease: false,
          requestId: 'req-error',
        },
      };

      await handler.handle(message, context);

      expect(context.webview.postMessage).toHaveBeenCalledTimes(1);
      const response = (context.webview.postMessage as any).mock.calls[0][0];
      expect(response.name).toBe('searchResponse');
      expect(response.args.error).toBeDefined();
      expect(response.args.requestId).toBe('req-error');
    });

    test('logs and sends error response on unexpected exception', async () => {
      const error = new Error('Unexpected failure');
      const searchService = {
        search: mock(async () => {
          throw error;
        }),
      };

      const handler = new SearchHandler();
      const context = createMockContext(searchService);

      const message: SearchRequestMessage = {
        type: 'searchRequest',
        payload: {
          query: 'test',
          includePrerelease: false,
          requestId: 'req-exception',
        },
      };

      await handler.handle(message, context);

      expect(context.logger.error).toHaveBeenCalledWith('Unexpected error in search handler', error);
      expect(context.webview.postMessage).toHaveBeenCalledTimes(1);
      const response = (context.webview.postMessage as any).mock.calls[0][0];
      expect(response.args.error).toBeDefined();
    });
  });

  describe('Prerelease Handling', () => {
    test('defaults includePrerelease to false when undefined', async () => {
      const searchFn = mock(async () => ({
        error: null,
        packages: [],
        totalHits: 0,
        hasMore: false,
      }));

      const searchService = { search: searchFn };
      const handler = new SearchHandler();
      const context = createMockContext(searchService);

      const message: SearchRequestMessage = {
        type: 'searchRequest',
        payload: {
          query: 'test',
          requestId: 'req-1',
          // includePrerelease omitted
        },
      };

      await handler.handle(message, context);

      const callArgs = searchFn.mock.calls[0] as unknown as [string, any, AbortSignal];
      const options = callArgs[1];
      expect(options.prerelease).toBe(false);
    });

    test('passes includePrerelease=true when specified', async () => {
      const searchFn = mock(async () => ({
        error: null,
        packages: [],
        totalHits: 0,
        hasMore: false,
      }));

      const searchService = { search: searchFn };
      const handler = new SearchHandler();
      const context = createMockContext(searchService);

      const message: SearchRequestMessage = {
        type: 'searchRequest',
        payload: {
          query: 'test',
          includePrerelease: true,
          requestId: 'req-1',
        },
      };

      await handler.handle(message, context);

      const callArgs = searchFn.mock.calls[0] as unknown as [string, any, AbortSignal];
      const options = callArgs[1];
      expect(options.prerelease).toBe(true);
    });
  });

  describe('Source Handling', () => {
    test('passes sourceId when specified', async () => {
      const searchFn = mock(async () => ({
        error: null,
        packages: [],
        totalHits: 0,
        hasMore: false,
      }));

      const searchService = { search: searchFn };
      const handler = new SearchHandler();
      const context = createMockContext(searchService);

      const message: SearchRequestMessage = {
        type: 'searchRequest',
        payload: {
          query: 'test',
          includePrerelease: false,
          requestId: 'req-1',
          sourceId: 'custom-source',
        },
      };

      await handler.handle(message, context);

      const callArgs = searchFn.mock.calls[0] as unknown as [string, any, AbortSignal];
      const options = callArgs[1];
      expect(options.sourceId).toBe('custom-source');
    });

    test('does not pass sourceId when omitted', async () => {
      const searchFn = mock(async () => ({
        error: null,
        packages: [],
        totalHits: 0,
        hasMore: false,
      }));

      const searchService = { search: searchFn };
      const handler = new SearchHandler();
      const context = createMockContext(searchService);

      const message: SearchRequestMessage = {
        type: 'searchRequest',
        payload: {
          query: 'test',
          includePrerelease: false,
          requestId: 'req-1',
        },
      };

      await handler.handle(message, context);

      const callArgs = searchFn.mock.calls[0] as unknown as [string, any, AbortSignal];
      const options = callArgs[1];
      expect(options.sourceId).toBeUndefined();
    });
  });
});
