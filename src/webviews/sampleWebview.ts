import * as vscode from 'vscode';
import ThemeService from '../services/themeService';
import type { ILogger } from '../services/loggerService';
import { createNonce, buildHtmlTemplate, isWebviewMessage } from './webviewHelpers';

export function createSampleWebview(context: vscode.ExtensionContext, logger: ILogger) {
  const panel = vscode.window.createWebviewPanel('scaffoldWebview', 'Scaffold Webview', vscode.ViewColumn.One, {
    enableScripts: true,
  });

  // Register with ThemeService so token updates are forwarded
  ThemeService.instance.registerWebview(panel);
  panel.onDidDispose(() => ThemeService.instance.unregisterWebview(panel));

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
        // Apply CSS variables coming from the host
        window.addEventListener('message', e => {
          const message = e.data;
          // Expect notifications following the extension's IPC protocol
          if (message?.type === 'notification' && message?.name === 'themeChanged') {
            const tokens = message.args?.tokens || {};
            Object.keys(tokens).forEach(key => {
              try { document.documentElement.style.setProperty(key, tokens[key]); } catch(e) { /* ignore */ }
            });
            // Optionally reflect kind on root element
            if (message.args?.kind) document.documentElement.setAttribute('data-theme', message.args.kind);
          }
        });
        // Tell the host we're ready
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
