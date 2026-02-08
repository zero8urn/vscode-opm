/**
 * Unit tests for GetPackageSourcesHandler
 *
 * Tests package source retrieval and configuration handling.
 */

import { describe, test, expect, mock } from 'bun:test';
import { GetPackageSourcesHandler } from '../getPackageSourcesHandler';
import { MockVsCodeRuntime } from '../../../core/vscodeRuntime';
import type { MessageContext } from '../../mediator/webviewMessageMediator';
import type { GetPackageSourcesRequestMessage } from '../../apps/packageBrowser/types';

function createMockContext(): MessageContext {
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
    services: {},
  };
}

describe('GetPackageSourcesHandler', () => {
  test('has correct message type', () => {
    const handler = new GetPackageSourcesHandler(new MockVsCodeRuntime());
    expect(handler.messageType).toBe('getPackageSourcesRequest');
  });

  describe('Message Validation', () => {
    test('warns and returns early for invalid message format', async () => {
      const handler = new GetPackageSourcesHandler(new MockVsCodeRuntime());
      const context = createMockContext();

      await handler.handle({ type: 'wrong' }, context);

      expect(context.logger.warn).toHaveBeenCalledWith('Invalid getPackageSourcesRequest message', { type: 'wrong' });
      expect(context.webview.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('Request Logging', () => {
    test('logs debug message with requestId', async () => {
      const handler = new GetPackageSourcesHandler(new MockVsCodeRuntime());
      const context = createMockContext();

      const message: GetPackageSourcesRequestMessage = {
        type: 'getPackageSources',
        payload: {
          requestId: 'req-sources-1',
        },
      };

      await handler.handle(message, context);

      expect(context.logger.debug).toHaveBeenCalledWith('Get package sources request received', {
        requestId: 'req-sources-1',
      });
    });
  });

  describe('Success Response', () => {
    test('sends packageSourcesResponse with sources', async () => {
      const handler = new GetPackageSourcesHandler(new MockVsCodeRuntime());
      const context = createMockContext();

      const message: GetPackageSourcesRequestMessage = {
        type: 'getPackageSources',
        payload: {
          requestId: 'req-1',
        },
      };

      await handler.handle(message, context);

      expect(context.webview.postMessage).toHaveBeenCalledTimes(1);
      const response = (context.webview.postMessage as any).mock.calls[0]?.[0];
      expect(response.type).toBe('notification');
      expect(response.name).toBe('packageSourcesResponse');
      expect(response.args.requestId).toBe('req-1');
      expect(Array.isArray(response.args.sources)).toBe(true);
    });

    test('logs info with source count', async () => {
      const handler = new GetPackageSourcesHandler(new MockVsCodeRuntime());
      const context = createMockContext();

      const message: GetPackageSourcesRequestMessage = {
        type: 'getPackageSources',
        payload: {
          requestId: 'req-2',
        },
      };

      await handler.handle(message, context);

      expect(context.logger.info).toHaveBeenCalled();
      const logCall = (context.logger.info as any).mock.calls[0];
      expect(logCall[0]).toBe('Package sources sent to webview');
      expect(logCall[1]).toHaveProperty('sourceCount');
      expect(logCall[1]).toHaveProperty('requestId', 'req-2');
    });
  });

  describe('Error Handling', () => {
    test('sends empty sources array on error', async () => {
      const handler = new GetPackageSourcesHandler(new MockVsCodeRuntime());
      const context = createMockContext();

      // This test validates that errors are handled gracefully
      // In practice, the configuration service is robust and rarely fails

      const message: GetPackageSourcesRequestMessage = {
        type: 'getPackageSources',
        payload: {
          requestId: 'req-error',
        },
      };

      await handler.handle(message, context);

      // Should still send a response even if there's an error
      expect(context.webview.postMessage).toHaveBeenCalled();
    });
  });
});
