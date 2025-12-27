import * as vscode from 'vscode';
import type { ILogger } from '../services/loggerService';
import { createPackageBrowserWebview } from '../webviews/packageBrowserWebview';
import { createNuGetApiClient } from '../env/node/nugetApiClient';

/**
 * Command to open the NuGet Package Browser webview.
 *
 * Registers a command that creates and displays the package browser webview panel,
 * which enables users to search, browse, and manage NuGet packages.
 */
export class PackageBrowserCommand {
  static id = 'opm.openPackageBrowser';

  constructor(private context: vscode.ExtensionContext, private logger: ILogger) {}

  async execute(): Promise<void> {
    try {
      this.logger.info('Opening NuGet Package Browser');

      // Create NuGet API client with default options
      const nugetClient = createNuGetApiClient(this.logger);

      // Create webview with injected dependencies
      const panel = createPackageBrowserWebview(this.context, this.logger, nugetClient);

      this.logger.debug('Package Browser webview created', { viewType: panel.viewType });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to open Package Browser', error instanceof Error ? error : new Error(errorMessage));
      vscode.window.showErrorMessage(`Failed to open Package Browser: ${errorMessage}`);
    }
  }
}
