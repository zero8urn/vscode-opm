import * as vscode from 'vscode';
import type { ILogger } from '../services/loggerService';
import { createNonce, buildHtmlTemplate, isWebviewMessage } from './webviewHelpers';
import type { SearchRequestMessage, WebviewReadyMessage, SearchResponseMessage } from './apps/package-browser/types';
import { isSearchRequestMessage, isWebviewReadyMessage } from './apps/package-browser/types';

/**
 * Creates and configures the Package Browser webview panel.
 *
 * This factory function creates a webview panel for browsing and searching NuGet packages.
 * The webview implements a typed IPC protocol for communication between the host and client.
 *
 * @param context - Extension context for resource URIs and lifecycle management
 * @param logger - Logger instance for debug and error logging
 * @returns The configured webview panel
 */
export function createPackageBrowserWebview(context: vscode.ExtensionContext, logger: ILogger): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel('opmPackageBrowser', 'NuGet Package Browser', vscode.ViewColumn.One, {
    enableScripts: true,
    retainContextWhenHidden: true, // Preserve search state when panel is hidden
    localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'out')],
  });

  // Clean up on disposal
  panel.onDidDispose(() => {
    logger.debug('Package Browser webview disposed');
  });

  // Build and set HTML content
  panel.webview.html = buildPackageBrowserHtml(context, panel.webview, logger);

  // Handle messages from webview
  panel.webview.onDidReceiveMessage(message => {
    if (!isWebviewMessage(message)) {
      logger.warn('Invalid webview message received', message);
      return;
    }
    handleWebviewMessage(message, panel, logger);
  });

  logger.debug('Package Browser webview initialized');

  return panel;
}

/**
 * Handle typed messages from the webview client.
 */
function handleWebviewMessage(message: unknown, panel: vscode.WebviewPanel, logger: ILogger): void {
  const msg = message as { type: string; [key: string]: unknown };

  if (isWebviewReadyMessage(msg)) {
    handleWebviewReady(msg, panel, logger);
  } else if (isSearchRequestMessage(msg)) {
    handleSearchRequest(msg, panel, logger);
  } else {
    logger.warn('Unknown webview message type', msg);
  }
}

function handleWebviewReady(message: WebviewReadyMessage, panel: vscode.WebviewPanel, logger: ILogger): void {
  // Send initial configuration or state to webview if needed
  logger.debug('Webview ready message handled');
}

function handleSearchRequest(message: SearchRequestMessage, panel: vscode.WebviewPanel, logger: ILogger): void {
  // Placeholder for NuGet API integration (future story)
  logger.debug('Search request received', message.payload);

  // Mock response for development
  const response: SearchResponseMessage = {
    type: 'notification',
    name: 'searchResponse',
    args: {
      query: message.payload.query,
      results: [],
      totalCount: 0,
      requestId: message.payload.requestId,
    },
  };

  panel.webview.postMessage(response);
}

/**
 * Build the HTML document for the Package Browser webview.
 * Loads the bundled Lit component from out/webviews/packageBrowserApp.js.
 */
function buildPackageBrowserHtml(context: vscode.ExtensionContext, webview: vscode.Webview, logger: ILogger): string {
  const nonce = createNonce();

  // Get URI for bundled webview script
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'out', 'webviews', 'packageBrowserApp.js'),
  );

  logger.debug('Loading webview script from:', scriptUri.toString());

  // Build HTML with bundled Lit component
  // Note: Use scripts array instead of inline script to avoid sanitization
  return buildHtmlTemplate({
    title: 'NuGet Package Browser',
    nonce,
    webview,
    bodyHtml: '<package-browser-app></package-browser-app>',
    scripts: [scriptUri],
  });
}
