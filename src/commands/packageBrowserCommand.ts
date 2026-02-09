import type * as vscode from 'vscode';
import type { IVsCodeRuntime } from '../core/vscodeRuntime';
import type { ILogger } from '../services/loggerService';
import type { INuGetApiClient } from '../domain/nugetApiClient';
import { createSolutionDiscoveryService } from '../services/discovery/solutionDiscoveryService';
import { createDotnetSolutionParser } from '../services/cli/dotnetSolutionParser';
import { createSolutionContextService, type SolutionContextService } from '../services/context/solutionContextService';
import type { DotnetProjectParser } from '../services/cli/dotnetProjectParser';
import type { CacheInvalidationNotifier } from '../services/cache/cacheInvalidationNotifier';

/**
 * Abstraction for VS Code window API.
 * Enables unit testing by mocking the window.
 */
export interface IWindow {
  showErrorMessage(message: string): void;
}

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
    private runtime: IVsCodeRuntime,
    private logger: ILogger,
    private nugetClient: INuGetApiClient,
    private projectParser: DotnetProjectParser,
    private cacheNotifier: CacheInvalidationNotifier,
    private window: IWindow,
    private createWebview?: () => Promise<vscode.WebviewPanel>,
  ) {}

  async execute(): Promise<void> {
    try {
      this.logger.info('Opening NuGet Package Browser');

      // Use injected webview creator if available (for testing), otherwise load dynamically
      if (this.createWebview) {
        await this.createWebview();
      } else {
        // Lazy import to avoid loading vscode module in tests
        const { createPackageBrowserWebview } = await import('../webviews/packageBrowserWebview');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const vscodeApi: typeof import('vscode') = require('vscode');

        // Lazy initialize solution context service
        if (!this.solutionContext) {
          this.logger.debug('Creating solution context service');
          const discoveryService = createSolutionDiscoveryService(vscodeApi.workspace, this.logger);
          const solutionParser = createDotnetSolutionParser(this.logger);
          this.solutionContext = createSolutionContextService(
            vscodeApi.workspace,
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

        const panel = createPackageBrowserWebview(
          this.context,
          this.runtime,
          this.logger,
          this.nugetClient,
          this.solutionContext,
          this.projectParser,
          this.cacheNotifier,
        );

        this.logger.debug('Package Browser webview created', { viewType: panel.viewType });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to open Package Browser', error instanceof Error ? error : new Error(errorMessage));
      this.window.showErrorMessage(`Failed to open Package Browser: ${errorMessage}`);
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

/**
 * Factory to create PackageBrowserCommand with real VS Code APIs.
 * Call this from extension.ts activation where vscode module is available.
 */
export function createPackageBrowserCommand(
  context: vscode.ExtensionContext,
  runtime: IVsCodeRuntime,
  logger: ILogger,
  nugetClient: INuGetApiClient,
  projectParser: DotnetProjectParser,
  cacheNotifier: CacheInvalidationNotifier,
): PackageBrowserCommand {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const vscodeApi: typeof import('vscode') = require('vscode');

  const window: IWindow = {
    showErrorMessage: message => vscodeApi.window.showErrorMessage(message),
  };

  return new PackageBrowserCommand(context, runtime, logger, nugetClient, projectParser, cacheNotifier, window);
}
