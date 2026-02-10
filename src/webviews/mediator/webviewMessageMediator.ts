/**
 * Webview Message Mediator — Mediator Pattern Implementation
 *
 * Routes IPC messages from webviews to registered message handlers.
 * Implements the Mediator pattern to decouple message dispatching from handling logic.
 * Each message type has a dedicated Command handler implementing IMessageHandler.
 *
 * @see src/webviews/handlers/
 * @see src/webviews/builders/webviewBuilder.ts
 */

import type * as vscode from 'vscode';
import type { ILogger } from '../../services/loggerService';

/**
 * Context passed to message handlers.
 * Contains all dependencies needed by handlers to process messages.
 */
export interface MessageContext {
  /** Webview instance for sending responses */
  readonly webview: vscode.Webview;

  /** Logger for debugging and error tracking */
  readonly logger: ILogger;

  /** Injected services (typed as any to avoid circular dependencies) */
  readonly services: {
    readonly searchService?: any;
    readonly detailsService?: any;
    readonly solutionContext?: any;
    readonly projectParser?: any;
    readonly cacheNotifier?: any;
  };
}

/**
 * Generic message handler interface (Command pattern).
 * Each message type implements this interface as a dedicated handler class.
 *
 * @template TRequest - The message type this handler processes
 * @template TResponse - The response type (optional, defaults to void)
 */
export interface IMessageHandler<TRequest = unknown, TResponse = void> {
  /** Unique message type identifier (e.g., 'searchRequest', 'ready') */
  readonly messageType: string;

  /**
   * Process the message and return a response.
   * Handlers should NOT post messages directly; instead return data
   * that the mediator will wrap in a response envelope.
   *
   * @param request - The typed message from the webview
   * @param context - Execution context with webview, logger, and services
   * @returns Promise resolving to response data or void
   */
  handle(request: TRequest, context: MessageContext): Promise<TResponse>;
}

/**
 * Mediator that routes webview messages to registered handlers.
 *
 * **Usage:**
 * ```typescript
 * const mediator = new WebviewMessageMediator();
 * mediator.registerHandler(new SearchHandler(searchService));
 * mediator.registerHandler(new InstallHandler(installCommand));
 *
 * webview.onDidReceiveMessage(msg =>
 *   mediator.dispatch(msg, { webview, logger, services })
 * );
 * ```
 */
export class WebviewMessageMediator {
  private readonly handlers = new Map<string, IMessageHandler>();

  /**
   * Register a message handler for a specific message type.
   *
   * @param handler - Handler instance implementing IMessageHandler
   * @throws Error if a handler for the same messageType is already registered
   */
  registerHandler(handler: IMessageHandler): void {
    if (this.handlers.has(handler.messageType)) {
      throw new Error(`Handler already registered for message type: ${handler.messageType}`);
    }
    this.handlers.set(handler.messageType, handler);
  }

  /**
   * Dispatch a message to its registered handler.
   * Validates message format, invokes handler, and handles errors gracefully.
   *
   * @param message - Raw message from webview (untyped)
   * @param context - Execution context with webview, logger, and services
   */
  async dispatch(message: unknown, context: MessageContext): Promise<void> {
    // Validate basic message structure
    if (!this.isValidMessage(message)) {
      context.logger.warn('Invalid message format received', message);
      return;
    }

    const msg = message as { type: string; [key: string]: unknown };
    const handler = this.handlers.get(msg.type);

    if (!handler) {
      context.logger.warn('No handler registered for message type', { type: msg.type });
      return;
    }

    try {
      context.logger.debug('Dispatching message to handler', {
        type: msg.type,
        handler: handler.constructor.name,
      });

      // Invoke handler (response handling is delegated to individual handlers)
      await handler.handle(message, context);
    } catch (error) {
      context.logger.error('Handler execution failed', error instanceof Error ? error : new Error(String(error)));

      // Handlers are responsible for sending error responses
      // Mediator just logs and prevents crash
    }
  }

  /**
   * Type guard for basic message validation.
   * Checks that message is an object with a 'type' property.
   */
  private isValidMessage(message: unknown): message is { type: string } {
    return (
      typeof message === 'object' &&
      message !== null &&
      'type' in message &&
      typeof (message as { type: unknown }).type === 'string'
    );
  }

  /**
   * Get count of registered handlers (useful for testing).
   */
  getHandlerCount(): number {
    return this.handlers.size;
  }

  /**
   * Check if a handler is registered for a message type (useful for testing).
   */
  hasHandler(messageType: string): boolean {
    return this.handlers.has(messageType);
  }
}
