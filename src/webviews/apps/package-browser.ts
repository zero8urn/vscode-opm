import * as vscode from 'vscode';
import ThemeService from '../../services/themeService';

export function createPackageBrowser(context: vscode.ExtensionContext) {
  const panel = vscode.window.createWebviewPanel('packageBrowser', 'Package Browser', vscode.ViewColumn.One, {
    enableScripts: true,
  });
  ThemeService.instance.registerWebview(panel);
  panel.onDidDispose(() => ThemeService.instance.unregisterWebview(panel));

  panel.webview.html = `<!doctype html><html><head><meta charset="utf-8"/></head><body><div id="app">Package Browser</div><script>const vscode = acquireVsCodeApi();window.addEventListener('message',e=>{if(e.data?.name === 'themeChanged') {const tokens = e.data.args.tokens || {};Object.keys(tokens).forEach(k => document.documentElement.style.setProperty(k, tokens[k]));}});</script></body></html>`;

  return panel;
}
