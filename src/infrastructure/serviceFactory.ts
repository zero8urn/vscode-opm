/**
 * Service Factory Interface
 *
 * Abstract Factory pattern for creating environment-specific service families.
 * Enables dependency injection and testability without manual wiring.
 *
 * @see NodeServiceFactory - Production implementation
 * @see TestServiceFactory - Test doubles implementation
 */

import type * as vscode from 'vscode';
import type { ILogger } from '../services/loggerService';
import type { INuGetApiClient } from '../domain/nugetApiClient';
import type { IEventBus } from '../core/eventBus';
import type { DotnetProjectParser } from '../services/cli/dotnetProjectParser';
import type { PackageCliService } from '../services/cli/packageCliService';
import type { PackageBrowserCommand } from '../commands/packageBrowserCommand';
import type { InstallPackageCommand } from '../commands/installPackageCommand';
import type { UninstallPackageCommand } from '../commands/uninstallPackageCommand';
import type { IVsCodeRuntime } from '../core/vscodeRuntime';
import type { CacheInvalidationNotifier } from '../services/cache/cacheInvalidationNotifier';

/**
 * Result of creating a project parser with watcher
 */
export interface ProjectParserWithWatcher {
  parser: DotnetProjectParser;
  disposables: vscode.Disposable[];
}

/**
 * Abstract Factory for creating all application services.
 * Implementations provide environment-specific service construction.
 */
export interface IServiceFactory {
  /**
   * Create logger service
   * @param context - VS Code extension context
   * @param runtime - VS Code runtime adapter
   */
  createLogger(context: vscode.ExtensionContext, runtime: IVsCodeRuntime): ILogger;

  /**
   * Create VS Code runtime adapter
   */
  createRuntime(): IVsCodeRuntime;

  /**
   * Create event bus for cross-component communication
   */
  createEventBus(): IEventBus;

  /**
   * Create NuGet API client with configuration
   * @param logger - Logger service
   * @param runtime - VS Code runtime adapter
   */
  createNuGetClient(logger: ILogger, runtime: IVsCodeRuntime): INuGetApiClient;

  /**
   * Create .csproj project parser
   * @param logger - Logger service
   */
  createProjectParser(logger: ILogger): DotnetProjectParser;

  /**
   * Create project parser with file watcher
   * Factory handles platform-specific watcher creation
   * @param logger - Logger service
   */
  createProjectParserWithWatcher(logger: ILogger): ProjectParserWithWatcher;

  /**
   * Create CLI service for package operations
   * @param logger - Logger service
   */
  createPackageCliService(logger: ILogger): PackageCliService;

  /**
   * Create cache invalidation notifier
   * @param logger - Logger service
   */
  createCacheNotifier(logger: ILogger): CacheInvalidationNotifier;

  /**
   * Create Package Browser command
   * @param context - VS Code extension context
   * @param runtime - VS Code runtime adapter
   * @param logger - Logger service
   * @param nugetClient - NuGet API client
   * @param projectParser - Project parser
   * @param cacheNotifier - Cache invalidation notifier
   */
  createPackageBrowserCommand(
    context: vscode.ExtensionContext,
    runtime: IVsCodeRuntime,
    logger: ILogger,
    nugetClient: INuGetApiClient,
    projectParser: DotnetProjectParser,
    cacheNotifier: CacheInvalidationNotifier,
  ): PackageBrowserCommand;

  /**
   * Create Install Package command
   * @param packageCliService - CLI service for package operations
   * @param logger - Logger service
   * @param projectParser - Project parser
   * @param runtime - VS Code runtime adapter
   * @param eventBus - Event bus for publishing package events
   */
  createInstallCommand(
    packageCliService: PackageCliService,
    logger: ILogger,
    projectParser: DotnetProjectParser,
    runtime: IVsCodeRuntime,
    eventBus: IEventBus,
  ): InstallPackageCommand;

  /**
   * Create Uninstall Package command
   * @param packageCliService - CLI service for package operations
   * @param logger - Logger service
   * @param projectParser - Project parser
   * @param runtime - VS Code runtime adapter
   * @param eventBus - Event bus for publishing package events
   */
  createUninstallCommand(
    packageCliService: PackageCliService,
    logger: ILogger,
    projectParser: DotnetProjectParser,
    runtime: IVsCodeRuntime,
    eventBus: IEventBus,
  ): UninstallPackageCommand;

  /**
   * Register commands with VS Code
   * Factory handles platform-specific command registration
   */
  registerCommands(
    context: vscode.ExtensionContext,
    packageBrowserCommand: PackageBrowserCommand,
    installCommand: InstallPackageCommand,
    uninstallCommand: UninstallPackageCommand,
    logger: ILogger,
  ): void;
}
