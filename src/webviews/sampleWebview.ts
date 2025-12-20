import * as vscode from 'vscode';
import type { ILogger } from '../services/loggerService';
import { createNonce, buildHtmlTemplate, isWebviewMessage } from './webviewHelpers';

export function createSampleWebview(context: vscode.ExtensionContext, logger: ILogger) {
  const panel = vscode.window.createWebviewPanel('scaffoldWebview', 'Scaffold Webview', vscode.ViewColumn.One, {
    enableScripts: true,
  });

  // Generate nonce for CSP
  const nonce = createNonce();

  // Build HTML using the template helper
  panel.webview.html = buildHtmlTemplate({
    title: 'Scaffold Webview',
    nonce,
    webview: panel.webview,
    bodyHtml: `
      <div id="app">Webview placeholder</div>
      <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        vscode.postMessage({ type: 'init' });
      </script>
    `,
  });

  // Handle messages from webview with type guard
  panel.webview.onDidReceiveMessage(m => {
    if (!isWebviewMessage(m)) {
      logger.warn('Invalid webview message received', m);
      return;
    }
    logger.debug('Webview message received', m);
  });

  return panel;
}
