import * as vscode from 'vscode';
import type { ILogger } from '../services/loggerService';
import type { INuGetApiClient } from '../domain/nugetApiClient';
import { createPackageBrowserWebview } from '../webviews/packageBrowserWebview';
import { createSolutionDiscoveryService } from '../services/discovery/solutionDiscoveryService';
import { createDotnetSolutionParser } from '../services/cli/dotnetSolutionParser';
import { createSolutionContextService, type SolutionContextService } from '../services/context/solutionContextService';

/**
 * Command to open the NuGet Package Browser webview.
 *
 * Registers a command that creates and displays the package browser webview panel,
 * which enables users to search, browse, and manage NuGet packages.
 * Also triggers async solution discovery to provide project context for package installation.
 */
export class PackageBrowserCommand {
  static id = 'opm.openPackageBrowser';

  /** Solution context service (lazy initialized on first command execution) */
  private solutionContext?: SolutionContextService;

  constructor(
    private context: vscode.ExtensionContext,
    private logger: ILogger,
    private nugetClient: INuGetApiClient,
  ) {}

  async execute(): Promise<void> {
    try {
      this.logger.info('Opening NuGet Package Browser');

      // Lazy initialize solution context service
      if (!this.solutionContext) {
        this.logger.debug('Creating solution context service');
        const discoveryService = createSolutionDiscoveryService(vscode.workspace, this.logger);
        const solutionParser = createDotnetSolutionParser(this.logger);
        this.solutionContext = createSolutionContextService(
          vscode.workspace,
          this.logger,
          discoveryService,
          solutionParser,
        );
        this.context.subscriptions.push(this.solutionContext);
      }

      // Start async discovery (non-blocking)
      this.solutionContext.discoverAsync().catch(error => {
        this.logger.error('Solution discovery failed', error as Error);
        // Don't block package browser on discovery failure
      });

      // Open package browser webview immediately
      const panel = createPackageBrowserWebview(this.context, this.logger, this.nugetClient, this.solutionContext);

      this.logger.debug('Package Browser webview created', { viewType: panel.viewType });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to open Package Browser', error instanceof Error ? error : new Error(errorMessage));
      vscode.window.showErrorMessage(`Failed to open Package Browser: ${errorMessage}`);
    }
  }

  /**
   * Get current solution context for package details card.
   * Returns synchronously; may return default state if discovery hasn't completed.
   */
  getSolutionContext() {
    return this.solutionContext?.getContext() ?? { solution: null, projects: [], mode: 'none' };
  }
}
