import * as vscode from 'vscode';
import { PackageBrowserCommand } from './commands/packageBrowserCommand';
import { InstallPackageCommand } from './commands/installPackageCommand';
import { createLogger } from './services/loggerService';
import { getNuGetApiOptions } from './services/configurationService';
import { createSampleWebview } from './webviews/sampleWebview';
import { DomainProviderService } from './domain/domainProviderService';
import { createNuGetApiClient } from './env/node/nugetApiClient';
import { createDotnetCliExecutor } from './services/cli/dotnetCliExecutor';
import { createPackageCliService } from './services/cli/packageCliService';

export async function activate(context: vscode.ExtensionContext) {
  // Initialize logger and register for disposal
  const logger = createLogger(context);
  context.subscriptions.push(logger);
  logger.debug('Extension activated');
  const domainService = new DomainProviderService();

  // Initialize NuGet API client with configuration
  const apiOptions = getNuGetApiOptions();
  const nugetClient = createNuGetApiClient(logger, apiOptions);

  // Log discovered sources (URLs only, no credentials)
  logger.info('NuGet API client initialized', {
    sourceCount: apiOptions.sources.length,
    sources: apiOptions.sources.map(s => ({
      name: s.name,
      url: s.indexUrl,
      provider: s.provider,
      enabled: s.enabled,
      hasAuth: s.auth?.type !== 'none',
    })),
  });

  // Register Package Browser command with injected NuGet client
  const packageBrowserCommand = new PackageBrowserCommand(context, logger, nugetClient);
  context.subscriptions.push(
    vscode.commands.registerCommand(PackageBrowserCommand.id, () => packageBrowserCommand.execute()),
  );

  // Initialize CLI services for package operations
  const cliExecutor = createDotnetCliExecutor(logger);
  const packageCliService = createPackageCliService(cliExecutor, logger);

  // Register Install Package command (internal only, called by webview)
  const installPackageCommand = new InstallPackageCommand(packageCliService, logger);
  context.subscriptions.push(
    vscode.commands.registerCommand(InstallPackageCommand.id, params => installPackageCommand.execute(params)),
  );
  logger.info('InstallPackageCommand registered (internal only, invoked by Package Browser webview)');
}

export function deactivate() {
  // Extension cleanup
}
