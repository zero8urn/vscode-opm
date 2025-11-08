import * as vscode from 'vscode';
import { HelloCommand } from './commands/helloCommand';
import { SimpleViewProvider } from './views/SimpleViewProvider';
import { DomainProviderService } from './domain/domainProviderService';

export function activate(context: vscode.ExtensionContext) {
  const domainService = new DomainProviderService();

  context.subscriptions.push(
    vscode.commands.registerCommand(HelloCommand.id, (arg) => new HelloCommand(domainService).execute(arg))
  );

  const view = new SimpleViewProvider(domainService);
  context.subscriptions.push(vscode.window.registerTreeDataProvider('dpm.simpleView', view));

  context.subscriptions.push(
    vscode.commands.registerCommand('dpm.openWebview', () => {
      const panel = vscode.window.createWebviewPanel('scaffoldWebview', 'Scaffold Webview', vscode.ViewColumn.One, { enableScripts: true });
      panel.webview.html = `<!doctype html><html><body><div id="app">Webview placeholder</div><script>window.addEventListener('message',e=>console.log('msg',e.data));acquireVsCodeApi().postMessage({type:'init'});</script></body></html>`;
    })
  );
}

export function deactivate() { }
