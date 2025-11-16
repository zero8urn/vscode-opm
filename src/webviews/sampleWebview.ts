import * as vscode from 'vscode';
import ThemeService from '../services/themeService';

export function createSampleWebview(context: vscode.ExtensionContext) {
  const panel = vscode.window.createWebviewPanel('scaffoldWebview', 'Scaffold Webview', vscode.ViewColumn.One, {
    enableScripts: true,
  });
  // Register with ThemeService so token updates are forwarded
  ThemeService.instance.registerWebview(panel);
  panel.onDidDispose(() => ThemeService.instance.unregisterWebview(panel));

  panel.webview.html = `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' http: https:; script-src 'unsafe-inline' http: https:; img-src https: data:;" />
    </head>
    <body>
      <div id="app">Webview placeholder</div>
      <script>
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
    </body>
  </html>`;
  panel.webview.onDidReceiveMessage(m => {
    // handle messages from webview
    console.log('webview message', m);
  });
  return panel;
}
