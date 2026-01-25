import * as vscode from 'vscode';
import { PackageBrowserCommand, createPackageBrowserCommand } from './commands/packageBrowserCommand';
import { InstallPackageCommand, createInstallPackageCommand } from './commands/installPackageCommand';
import { UninstallPackageCommand, createUninstallPackageCommand } from './commands/uninstallPackageCommand';
import { createLogger } from './services/loggerService';
import { getNuGetApiOptions } from './services/configurationService';
import { createSampleWebview } from './webviews/sampleWebview';
import { DomainProviderService } from './domain/domainProviderService';
import { createNuGetApiClient } from './env/node/nugetApiClient';
import { createDotnetCliExecutor } from './services/cli/dotnetCliExecutor';
import { createPackageCliService } from './services/cli/packageCliService';
import { createTargetFrameworkParser } from './services/cli/parsers/targetFrameworkParser';
import { createPackageReferenceParser } from './services/cli/parsers/packageReferenceParser';
import { createDotnetProjectParser } from './services/cli/dotnetProjectParser';

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

  // Initialize CLI services for package operations
  const cliExecutor = createDotnetCliExecutor(logger);
  const packageCliService = createPackageCliService(cliExecutor, logger);

  // Create CLI executor and project parser for installed package detection
  const tfParser = createTargetFrameworkParser(cliExecutor, logger);
  const pkgParser = createPackageReferenceParser(cliExecutor, logger);
  const projectParser = createDotnetProjectParser(cliExecutor, tfParser, pkgParser, logger);
  logger.info('DotnetProjectParser initialized with 1-minute cache TTL');

  // Register Package Browser command with injected NuGet client and project parser
  const packageBrowserCommand = createPackageBrowserCommand(context, logger, nugetClient, projectParser);
  context.subscriptions.push(
    vscode.commands.registerCommand(PackageBrowserCommand.id, () => packageBrowserCommand.execute()),
  );

  // Register Install Package command (internal only, called by webview)
  const installPackageCommand = createInstallPackageCommand(packageCliService, logger, projectParser);
  context.subscriptions.push(
    vscode.commands.registerCommand(InstallPackageCommand.id, params => installPackageCommand.execute(params)),
  );
  logger.info('InstallPackageCommand registered (internal only, invoked by Package Browser webview)');

  // Register Uninstall Package command (internal only, called by webview)
  const uninstallPackageCommand = createUninstallPackageCommand(packageCliService, logger, projectParser);
  context.subscriptions.push(
    vscode.commands.registerCommand(UninstallPackageCommand.id, params => uninstallPackageCommand.execute(params)),
  );
  logger.info('UninstallPackageCommand registered (internal only, invoked by Package Browser webview)');
}

export function deactivate() {
  // Extension cleanup
}
