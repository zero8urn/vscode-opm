import * as vscode from 'vscode';

export function createPackageBrowser(context: vscode.ExtensionContext) {
  const panel = vscode.window.createWebviewPanel('packageBrowser', 'Package Browser', vscode.ViewColumn.One, {
    enableScripts: true,
  });

  panel.webview.html = `<!doctype html><html><head><meta charset="utf-8"/></head><body><div id="app">Package Browser</div></body></html>`;

  return panel;
}
