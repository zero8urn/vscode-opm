import * as vscode from 'vscode';
import { HelloCommand } from './commands/helloCommand';
import { SimpleViewProvider } from './views/SimpleViewProvider';
import ThemeService from './services/themeService';
import { createLogger } from './services/loggerService';
import { createSampleWebview } from './webviews/sampleWebview';
import { createPackageBrowser } from './webviews/apps/package-browser';
import { DomainProviderService } from './domain/domainProviderService';

export function activate(context: vscode.ExtensionContext) {
  // Initialize core services
  // Accessing ThemeService.instance ensures singleton is constructed and the theme change listener is registered
  ThemeService.instance;
  // Initialize logger and register for disposal
  const logger = createLogger(context);
  context.subscriptions.push(logger);
  logger.info('Extension activated');
  const domainService = new DomainProviderService();

  context.subscriptions.push(
    vscode.commands.registerCommand(HelloCommand.id, arg => new HelloCommand(domainService).execute(arg)),
  );

  const view = new SimpleViewProvider(domainService);
  context.subscriptions.push(vscode.window.registerTreeDataProvider('dpm.simpleView', view));

  context.subscriptions.push(
    vscode.commands.registerCommand('opm.openWebview', () => {
      // createSampleWebview registers with ThemeService internally
      createSampleWebview(context);
    }),
  );

  // Example: open the package browser view using the consumer we added
  context.subscriptions.push(
    vscode.commands.registerCommand('opm.openPackageBrowser', () => {
      // createPackageBrowser registers with ThemeService internally
      createPackageBrowser(context);
    }),
  );
}

export function deactivate() {
  // Dispose ThemeService on deactivate
  try {
    ThemeService.instance.dispose();
  } catch (e) {
    // swallow errors during shutdown
  }
}
