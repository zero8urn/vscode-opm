import * as vscode from 'vscode';
import { PackageBrowserCommand } from './commands/packageBrowserCommand';
import { createLogger } from './services/loggerService';
import { getNuGetApiOptions } from './services/configurationService';
import { createSampleWebview } from './webviews/sampleWebview';
import { DomainProviderService } from './domain/domainProviderService';
import { createNuGetApiClient } from './env/node/nugetApiClient';

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
}

export function deactivate() {
  // Extension cleanup
}
