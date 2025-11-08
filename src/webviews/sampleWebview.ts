import * as vscode from 'vscode';

export function createSampleWebview(context: vscode.ExtensionContext) {
  const panel = vscode.window.createWebviewPanel('scaffoldWebview', 'Scaffold Webview', vscode.ViewColumn.One, { enableScripts: true });
  panel.webview.html = `<!doctype html><html><body><div id="app">Webview placeholder</div><script>const vscode = acquireVsCodeApi();window.addEventListener('message', e => console.log('host ->', e.data));vscode.postMessage({ type: 'init' });</script></body></html>`;
  panel.webview.onDidReceiveMessage((m) => {
    // handle messages from webview
    console.log('webview message', m);
  });
  return panel;
}
