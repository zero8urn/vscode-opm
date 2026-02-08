/**
 * Node.js Service Factory
 *
 * Production implementation of IServiceFactory.
 * Creates real VS Code services with actual dependencies.
 */

import type * as vscode from 'vscode';
import type { IServiceFactory, ProjectParserWithWatcher } from '../../infrastructure/serviceFactory';
import type { ILogger } from '../../services/loggerService';
import type { INuGetApiClient } from '../../domain/nugetApiClient';
import type { DotnetProjectParser, IFileSystemWatcher } from '../../services/cli/dotnetProjectParser';
import type { PackageCliService } from '../../services/cli/packageCliService';
import type { IVsCodeRuntime } from '../../core/vscodeRuntime';
import type { CacheInvalidationNotifier } from '../../services/cache/cacheInvalidationNotifier';
import type { PackageBrowserCommand } from '../../commands/packageBrowserCommand';
import type { InstallPackageCommand } from '../../commands/installPackageCommand';
import type { UninstallPackageCommand } from '../../commands/uninstallPackageCommand';

import { VsCodeRuntime } from '../../core/vscodeRuntime';
import { createLogger } from '../../services/loggerService';
import { createNuGetApiFacade } from '../../api';
import { getNuGetApiOptions } from '../../services/configurationService';
import { createDotnetCliExecutor } from '../../services/cli/dotnetCliExecutor';
import { createPackageCliService } from '../../services/cli/packageCliService';
import { createTargetFrameworkParser } from '../../services/cli/parsers/targetFrameworkParser';
import { createPackageReferenceParser } from '../../services/cli/parsers/packageReferenceParser';
import { createDotnetProjectParser } from '../../services/cli/dotnetProjectParser';
import { createCacheInvalidationNotifier } from '../../services/cache/cacheInvalidationNotifier';
import { createPackageBrowserCommand } from '../../commands/packageBrowserCommand';
import { createInstallPackageCommand } from '../../commands/installPackageCommand';
import { createUninstallPackageCommand } from '../../commands/uninstallPackageCommand';

/**
 * Production service factory using real VS Code APIs and Node.js dependencies.
 */
export class NodeServiceFactory implements IServiceFactory {
  createRuntime(): IVsCodeRuntime {
    return new VsCodeRuntime();
  }

  createLogger(context: vscode.ExtensionContext, runtime: IVsCodeRuntime): ILogger {
    return createLogger(context, runtime);
  }

  createNuGetClient(logger: ILogger, runtime: IVsCodeRuntime): INuGetApiClient {
    const apiOptions = getNuGetApiOptions(runtime);

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

    return createNuGetApiFacade(logger, apiOptions);
  }

  createProjectParser(logger: ILogger): DotnetProjectParser {
    const cliExecutor = createDotnetCliExecutor(logger);
    const tfParser = createTargetFrameworkParser(cliExecutor, logger);
    const pkgParser = createPackageReferenceParser(cliExecutor, logger);
    return createDotnetProjectParser(cliExecutor, tfParser, pkgParser, logger);
  }

  createProjectParserWithWatcher(logger: ILogger): ProjectParserWithWatcher {
    const projectParser = this.createProjectParser(logger);

    // Create VS Code file watcher
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vscodeApi: typeof import('vscode') = require('vscode');
    const csprojWatcher = vscodeApi.workspace.createFileSystemWatcher('**/*.csproj');

    // Adapter: wrap VS Code FileSystemWatcher to match interface
    const watcherAdapter: IFileSystemWatcher = {
      onDidChange: listener => csprojWatcher.onDidChange(listener as any),
      onDidCreate: listener => csprojWatcher.onDidCreate(listener as any),
      onDidDelete: listener => csprojWatcher.onDidDelete(listener as any),
    };

    projectParser.startWatching(watcherAdapter);

    logger.info('DotnetProjectParser initialized with file watcher and 1-minute cache TTL');

    return {
      parser: projectParser,
      disposables: [csprojWatcher, { dispose: () => projectParser.dispose() }],
    };
  }

  createPackageCliService(logger: ILogger): PackageCliService {
    const cliExecutor = createDotnetCliExecutor(logger);
    return createPackageCliService(cliExecutor, logger);
  }

  createCacheNotifier(logger: ILogger): CacheInvalidationNotifier {
    return createCacheInvalidationNotifier(logger);
  }

  createPackageBrowserCommand(
    context: vscode.ExtensionContext,
    runtime: IVsCodeRuntime,
    logger: ILogger,
    nugetClient: INuGetApiClient,
    projectParser: DotnetProjectParser,
    cacheNotifier: CacheInvalidationNotifier,
  ): PackageBrowserCommand {
    return createPackageBrowserCommand(context, runtime, logger, nugetClient, projectParser, cacheNotifier);
  }

  createInstallCommand(
    packageCliService: PackageCliService,
    logger: ILogger,
    projectParser: DotnetProjectParser,
    runtime: IVsCodeRuntime,
  ): InstallPackageCommand {
    return createInstallPackageCommand(packageCliService, logger, projectParser, runtime);
  }

  createUninstallCommand(
    packageCliService: PackageCliService,
    logger: ILogger,
    projectParser: DotnetProjectParser,
    runtime: IVsCodeRuntime,
  ): UninstallPackageCommand {
    return createUninstallPackageCommand(packageCliService, logger, projectParser, runtime);
  }

  registerCommands(
    context: vscode.ExtensionContext,
    packageBrowserCommand: PackageBrowserCommand,
    installCommand: InstallPackageCommand,
    uninstallCommand: UninstallPackageCommand,
    logger: ILogger,
  ): void {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vscodeApi: typeof import('vscode') = require('vscode');

    // Register Package Browser command
    context.subscriptions.push(
      vscodeApi.commands.registerCommand('opm.openPackageBrowser', () => packageBrowserCommand.execute()),
    );
    logger.info('PackageBrowserCommand registered');

    // Register Install Package command (internal only, called by webview)
    context.subscriptions.push(
      vscodeApi.commands.registerCommand('opm.installPackage', params => installCommand.execute(params)),
    );
    logger.info('InstallPackageCommand registered (internal only, invoked by Package Browser webview)');

    // Register Uninstall Package command (internal only, called by webview)
    context.subscriptions.push(
      vscodeApi.commands.registerCommand('opm.uninstallPackage', params => uninstallCommand.execute(params)),
    );
    logger.info('UninstallPackageCommand registered (internal only, invoked by Package Browser webview)');
  }
}
