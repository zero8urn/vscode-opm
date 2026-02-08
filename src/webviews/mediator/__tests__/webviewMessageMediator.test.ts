/**
 * Unit tests for WebviewMessageMediator
 *
 * Tests the Mediator pattern implementation for routing webview messages
 * to registered handlers.
 */

import { describe, test, expect, mock } from 'bun:test';
import { WebviewMessageMediator, type IMessageHandler, type MessageContext } from '../webviewMessageMediator';

// Mock handler for testing
class MockHandler implements IMessageHandler {
  readonly messageType: string;
  readonly handleFn: any;

  constructor(messageType: string, handleFn?: any) {
    this.messageType = messageType;
    this.handleFn = handleFn || mock(async () => {});
  }

  async handle(request: unknown, context: MessageContext): Promise<void> {
    return this.handleFn(request, context);
  }
}

// Helper to create mock context
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

describe('WebviewMessageMediator', () => {
  describe('Handler Registration', () => {
    test('registers a handler successfully', () => {
      const mediator = new WebviewMessageMediator();
      const handler = new MockHandler('testMessage');

      mediator.registerHandler(handler);

      expect(mediator.hasHandler('testMessage')).toBe(true);
      expect(mediator.getHandlerCount()).toBe(1);
    });

    test('registers multiple handlers', () => {
      const mediator = new WebviewMessageMediator();
      const handler1 = new MockHandler('message1');
      const handler2 = new MockHandler('message2');
      const handler3 = new MockHandler('message3');

      mediator.registerHandler(handler1);
      mediator.registerHandler(handler2);
      mediator.registerHandler(handler3);

      expect(mediator.getHandlerCount()).toBe(3);
      expect(mediator.hasHandler('message1')).toBe(true);
      expect(mediator.hasHandler('message2')).toBe(true);
      expect(mediator.hasHandler('message3')).toBe(true);
    });

    test('throws error when registering duplicate message type', () => {
      const mediator = new WebviewMessageMediator();
      const handler1 = new MockHandler('duplicate');
      const handler2 = new MockHandler('duplicate');

      mediator.registerHandler(handler1);

      expect(() => {
        mediator.registerHandler(handler2);
      }).toThrow('Handler already registered for message type: duplicate');
    });

    test('returns false for unregistered handler', () => {
      const mediator = new WebviewMessageMediator();

      expect(mediator.hasHandler('nonexistent')).toBe(false);
    });
  });

  describe('Message Dispatching', () => {
    test('dispatches valid message to registered handler', async () => {
      const mediator = new WebviewMessageMediator();
      const handleFn = mock(async () => {});
      const handler = new MockHandler('testMessage', handleFn);
      const context = createMockContext();

      mediator.registerHandler(handler);

      const message = { type: 'testMessage', payload: { data: 'test' } };
      await mediator.dispatch(message, context);

      expect(handleFn).toHaveBeenCalledTimes(1);
      expect(handleFn).toHaveBeenCalledWith(message, context);
    });

    test('logs debug information during dispatch', async () => {
      const mediator = new WebviewMessageMediator();
      const handler = new MockHandler('testMessage');
      const context = createMockContext();

      mediator.registerHandler(handler);

      await mediator.dispatch({ type: 'testMessage' }, context);

      expect(context.logger.debug).toHaveBeenCalledWith('Dispatching message to handler', {
        type: 'testMessage',
        handler: 'MockHandler',
      });
    });

    test('warns when message format is invalid (not an object)', async () => {
      const mediator = new WebviewMessageMediator();
      const context = createMockContext();

      await mediator.dispatch('invalid', context);
      await mediator.dispatch(123, context);
      await mediator.dispatch(null, context);
      await mediator.dispatch(undefined, context);

      expect(context.logger.warn).toHaveBeenCalledTimes(4);
      expect(context.logger.warn).toHaveBeenCalledWith('Invalid message format received', 'invalid');
    });

    test('warns when message has no type property', async () => {
      const mediator = new WebviewMessageMediator();
      const context = createMockContext();

      await mediator.dispatch({ data: 'test' }, context);

      expect(context.logger.warn).toHaveBeenCalledWith('Invalid message format received', { data: 'test' });
    });

    test('warns when message type is not a string', async () => {
      const mediator = new WebviewMessageMediator();
      const context = createMockContext();

      await mediator.dispatch({ type: 123 }, context);

      expect(context.logger.warn).toHaveBeenCalledWith('Invalid message format received', { type: 123 });
    });

    test('warns when no handler registered for message type', async () => {
      const mediator = new WebviewMessageMediator();
      const context = createMockContext();

      await mediator.dispatch({ type: 'unhandledMessage' }, context);

      expect(context.logger.warn).toHaveBeenCalledWith('No handler registered for message type', {
        type: 'unhandledMessage',
      });
    });

    test('does not invoke handler for unregistered message type', async () => {
      const mediator = new WebviewMessageMediator();
      const handleFn = mock(async () => {});
      const handler = new MockHandler('registered', handleFn);
      const context = createMockContext();

      mediator.registerHandler(handler);

      await mediator.dispatch({ type: 'unregistered' }, context);

      expect(handleFn).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('catches and logs handler errors', async () => {
      const mediator = new WebviewMessageMediator();
      const error = new Error('Handler failed');
      const handleFn = mock(async () => {
        throw error;
      });
      const handler = new MockHandler('failing', handleFn);
      const context = createMockContext();

      mediator.registerHandler(handler);

      // Should not throw
      await mediator.dispatch({ type: 'failing' }, context);

      expect(context.logger.error).toHaveBeenCalledWith('Handler execution failed', error);
    });

    test('converts non-Error exceptions to Error instances', async () => {
      const mediator = new WebviewMessageMediator();
      const handleFn = mock(async () => {
        throw 'string error';
      });
      const handler = new MockHandler('failing', handleFn);
      const context = createMockContext();

      mediator.registerHandler(handler);

      await mediator.dispatch({ type: 'failing' }, context);

      expect(context.logger.error).toHaveBeenCalled();
      const loggedError = (context.logger.error as any).mock.calls[0][1];
      expect(loggedError).toBeInstanceOf(Error);
      expect(loggedError.message).toBe('string error');
    });

    test('continues processing after handler error', async () => {
      const mediator = new WebviewMessageMediator();
      const failingHandler = new MockHandler(
        'failing',
        mock(async () => {
          throw new Error('fail');
        }),
      );
      const successHandler = new MockHandler(
        'success',
        mock(async () => {}),
      );
      const context = createMockContext();

      mediator.registerHandler(failingHandler);
      mediator.registerHandler(successHandler);

      await mediator.dispatch({ type: 'failing' }, context);
      await mediator.dispatch({ type: 'success' }, context);

      expect(successHandler.handleFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Multiple Handlers', () => {
    test('dispatches different messages to different handlers', async () => {
      const mediator = new WebviewMessageMediator();
      const handleFn1 = mock(async () => {});
      const handleFn2 = mock(async () => {});
      const handler1 = new MockHandler('type1', handleFn1);
      const handler2 = new MockHandler('type2', handleFn2);
      const context = createMockContext();

      mediator.registerHandler(handler1);
      mediator.registerHandler(handler2);

      await mediator.dispatch({ type: 'type1', data: 'a' }, context);
      await mediator.dispatch({ type: 'type2', data: 'b' }, context);

      expect(handleFn1).toHaveBeenCalledTimes(1);
      expect(handleFn1).toHaveBeenCalledWith({ type: 'type1', data: 'a' }, context);
      expect(handleFn2).toHaveBeenCalledTimes(1);
      expect(handleFn2).toHaveBeenCalledWith({ type: 'type2', data: 'b' }, context);
    });

    test('same handler can be invoked multiple times', async () => {
      const mediator = new WebviewMessageMediator();
      const handleFn = mock(async () => {});
      const handler = new MockHandler('repeatable', handleFn);
      const context = createMockContext();

      mediator.registerHandler(handler);

      await mediator.dispatch({ type: 'repeatable', id: 1 }, context);
      await mediator.dispatch({ type: 'repeatable', id: 2 }, context);
      await mediator.dispatch({ type: 'repeatable', id: 3 }, context);

      expect(handleFn).toHaveBeenCalledTimes(3);
    });
  });

  describe('Context Propagation', () => {
    test('passes webview to handler', async () => {
      const mediator = new WebviewMessageMediator();
      const handleFn = mock(async (_request: unknown, context: MessageContext) => {
        await context.webview.postMessage({ type: 'response' });
      });
      const handler = new MockHandler('test', handleFn);
      const context = createMockContext();

      mediator.registerHandler(handler);
      await mediator.dispatch({ type: 'test' }, context);

      expect(context.webview.postMessage).toHaveBeenCalledWith({ type: 'response' });
    });

    test('passes logger to handler', async () => {
      const mediator = new WebviewMessageMediator();
      const handleFn = mock(async (_request: unknown, context: MessageContext) => {
        context.logger.info('Handler executed');
      });
      const handler = new MockHandler('test', handleFn);
      const context = createMockContext();

      mediator.registerHandler(handler);
      await mediator.dispatch({ type: 'test' }, context);

      expect(context.logger.info).toHaveBeenCalledWith('Handler executed');
    });

    test('passes services to handler', async () => {
      const mediator = new WebviewMessageMediator();
      let receivedServices: any = null;
      const handleFn = mock(async (_request: unknown, context: MessageContext) => {
        receivedServices = context.services;
      });
      const handler = new MockHandler('test', handleFn);
      const mockServices = { searchService: {}, detailsService: {} };
      const context = { ...createMockContext(), services: mockServices };

      mediator.registerHandler(handler);
      await mediator.dispatch({ type: 'test' }, context);

      expect(receivedServices).toBe(mockServices);
    });
  });

  describe('Edge Cases', () => {
    test('handles empty message type string', async () => {
      const mediator = new WebviewMessageMediator();
      const context = createMockContext();

      await mediator.dispatch({ type: '' }, context);

      expect(context.logger.warn).toHaveBeenCalledWith('No handler registered for message type', { type: '' });
    });

    test('handles complex message payloads', async () => {
      const mediator = new WebviewMessageMediator();
      const handleFn = mock(async () => {});
      const handler = new MockHandler('complex', handleFn);
      const context = createMockContext();

      mediator.registerHandler(handler);

      const complexMessage = {
        type: 'complex',
        payload: {
          nested: { deep: { value: 123 } },
          array: [1, 2, 3],
          fn: () => {},
        },
      };

      await mediator.dispatch(complexMessage, context);

      expect(handleFn).toHaveBeenCalledWith(complexMessage, context);
    });

    test('getHandlerCount returns 0 for empty mediator', () => {
      const mediator = new WebviewMessageMediator();

      expect(mediator.getHandlerCount()).toBe(0);
    });

    test('hasHandler is case-sensitive', () => {
      const mediator = new WebviewMessageMediator();
      const handler = new MockHandler('CaseSensitive');

      mediator.registerHandler(handler);

      expect(mediator.hasHandler('CaseSensitive')).toBe(true);
      expect(mediator.hasHandler('casesensitive')).toBe(false);
      expect(mediator.hasHandler('CASESENSITIVE')).toBe(false);
    });
  });
});
