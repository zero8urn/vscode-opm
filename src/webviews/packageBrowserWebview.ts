/**
 * Package Browser Webview.
 *
 * Creates a webview panel that implements a typed IPC protocol using a
 * mediator-based message routing approach. Handlers and builders are
 * implemented in dedicated modules.
 *
 * @see src/webviews/mediator/webviewMessageMediator.ts
 * @see src/webviews/handlers/
 * @see src/webviews/builders/webviewBuilder.ts
 */

import * as vscode from 'vscode';
import type { IVsCodeRuntime } from '../core/vscodeRuntime';
import type { ILogger } from '../services/loggerService';
import type { INuGetApiClient } from '../domain/nugetApiClient';
import type { SolutionContextService } from '../services/context/solutionContextService';
import type { CacheInvalidationNotifier } from '../services/cache/cacheInvalidationNotifier';
import type { DotnetProjectParser } from '../services/cli/dotnetProjectParser';
import { isWebviewMessage } from './webviewHelpers';
import { WebviewMessageMediator } from './mediator/webviewMessageMediator';
import { createAllHandlers } from './handlers';
import { WebviewBuilder } from './builders/webviewBuilder';
import { createSearchService } from './services/searchService';
import { createPackageDetailsService } from './services/packageDetailsService';

/**
 * Creates and configures the Package Browser webview panel.
 *
 * This factory function creates a webview panel for browsing and searching NuGet packages.
 * The webview implements a typed IPC protocol using the Mediator pattern for message routing.
 *
 * **Mediator Pattern Benefits:**
 * - Decoupled message handling (each handler is independently testable)
 * - Extensibility (new handlers can be added without modifying this file)
 * - Single Responsibility (this function only manages lifecycle, not business logic)
 *
 * @param context - Extension context for resource URIs and lifecycle management
 * @param runtime - VS Code runtime adapter for handlers requiring workspace access
 * @param logger - Logger instance for debug and error logging
 * @param nugetClient - NuGet API client instance for search operations
 * @param solutionContext - Solution context service for project discovery
 * @param projectParser - Project parser for reading .csproj files
 * @param cacheNotifier - Cache invalidation notifier for project changes
 * @returns The configured webview panel
 */
export function createPackageBrowserWebview(
  context: vscode.ExtensionContext,
  runtime: IVsCodeRuntime,
  logger: ILogger,
  nugetClient: INuGetApiClient,
  solutionContext: SolutionContextService,
  projectParser: DotnetProjectParser,
  cacheNotifier: CacheInvalidationNotifier,
): vscode.WebviewPanel {
  // Create webview panel with security settings
  const panel = vscode.window.createWebviewPanel('opmPackageBrowser', 'NuGet Package Browser', vscode.ViewColumn.One, {
    enableScripts: true,
    retainContextWhenHidden: true, // Preserve search state and panel content when hidden
    localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'out')],
  });

  // Create service instances for this webview
  const searchService = createSearchService(nugetClient, logger);
  const detailsService = createPackageDetailsService(nugetClient, logger);

  // Register panel with cache invalidation notifier
  cacheNotifier.registerPanel(panel);

  // Clean up on disposal
  panel.onDidDispose(() => {
    searchService.resetPagination();
    logger.debug('Package Browser webview disposed');
  });

  // Build HTML using WebviewBuilder (Builder Pattern)
  const builder = new WebviewBuilder(context.extensionUri, panel.webview, runtime);
  panel.webview.html = builder.buildPackageBrowserHtml();

  // Create and configure mediator with all handlers (Mediator + Command Patterns)
  const mediator = new WebviewMessageMediator();
  const handlers = createAllHandlers(runtime);

  handlers.forEach(handler => {
    mediator.registerHandler(handler);
    logger.debug(`Registered handler: ${handler.messageType}`);
  });

  logger.info(`Mediator configured with ${mediator.getHandlerCount()} handlers`);

  // Handle messages from webview using mediator
  panel.webview.onDidReceiveMessage(message => {
    if (!isWebviewMessage(message)) {
      logger.warn('Invalid webview message received', message);
      return;
    }

    // Dispatch to mediator with service context
    void mediator.dispatch(message, {
      webview: panel.webview,
      logger,
      services: {
        searchService,
        detailsService,
        solutionContext,
        projectParser,
        cacheNotifier,
      },
    });
  });

  logger.debug('Package Browser webview initialized with Mediator pattern');

  return panel;
}
