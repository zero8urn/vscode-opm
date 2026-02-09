/**
 * Service Container
 *
 * Dependency Injection container with lifecycle management.
 * Coordinates service creation via Abstract Factory pattern.
 *
 * @example Production:
 * ```typescript
 * const container = new ServiceContainer(new NodeServiceFactory(), context);
 * await container.initialize();
 * const logger = container.getService('logger');
 * ```
 *
 * @example Tests:
 * ```typescript
 * const container = new ServiceContainer(new TestServiceFactory(), mockContext);
 * await container.initialize();
 * ```
 */

import type * as vscode from 'vscode';
import type { IServiceFactory } from './serviceFactory';
import type { ILogger } from '../services/loggerService';
import type { IEventBus } from '../core/eventBus';
import type { INuGetApiClient } from '../domain/nugetApiClient';
import type { DotnetProjectParser, IFileSystemWatcher } from '../services/cli/dotnetProjectParser';
import type { PackageCliService } from '../services/cli/packageCliService';
import type { IVsCodeRuntime } from '../core/vscodeRuntime';
import type { CacheInvalidationNotifier } from '../services/cache/cacheInvalidationNotifier';
import type { PackageBrowserCommand } from '../commands/packageBrowserCommand';
import type { InstallPackageCommand } from '../commands/installPackageCommand';
import type { UninstallPackageCommand } from '../commands/uninstallPackageCommand';

/**
 * Service identifiers for type-safe service retrieval
 */
export type ServiceId =
  | 'runtime'
  | 'logger'
  | 'eventBus'
  | 'nugetClient'
  | 'projectParser'
  | 'packageCliService'
  | 'cacheNotifier'
  | 'packageBrowserCommand'
  | 'installCommand'
  | 'uninstallCommand';

/**
 * Service type mapping for type-safe retrieval
 */
export interface ServiceTypeMap {
  runtime: IVsCodeRuntime;
  logger: ILogger;
  eventBus: IEventBus;
  nugetClient: INuGetApiClient;
  projectParser: DotnetProjectParser;
  packageCliService: PackageCliService;
  cacheNotifier: CacheInvalidationNotifier;
  packageBrowserCommand: PackageBrowserCommand;
  installCommand: InstallPackageCommand;
  uninstallCommand: UninstallPackageCommand;
}

/**
 * DI Container managing service lifecycle
 *
 * Pure orchestration - no VS Code dependencies.
 * All platform-specific wiring is handled by the factory.
 */
export class ServiceContainer implements vscode.Disposable {
  private readonly services = new Map<ServiceId, unknown>();
  private readonly disposables: vscode.Disposable[] = [];
  private initialized = false;

  constructor(private readonly factory: IServiceFactory, private readonly context: vscode.ExtensionContext) {}

  /**
   * Initialize container and create core services
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      throw new Error('ServiceContainer already initialized');
    }

    // Create runtime first (needed by other services)
    const runtime = this.factory.createRuntime();
    this.services.set('runtime', runtime);

    // Create logger (needed by all other services)
    const logger = this.factory.createLogger(this.context, runtime);
    this.services.set('logger', logger);
    this.disposables.push(logger);
    logger.debug('ServiceContainer initializing');

    // Create event bus
    const eventBus = this.factory.createEventBus();
    this.services.set('eventBus', eventBus);

    // Create API client
    const nugetClient = this.factory.createNuGetClient(logger, runtime);
    this.services.set('nugetClient', nugetClient);

    // Create project parser with watcher (factory handles VS Code wiring)
    const { parser: projectParser, disposables: parserDisposables } =
      this.factory.createProjectParserWithWatcher(logger);
    this.services.set('projectParser', projectParser);
    this.disposables.push(...parserDisposables);
    logger.info('Project parser initialized with file watcher');

    // Create cache notifier
    const cacheNotifier = this.factory.createCacheNotifier(logger);
    this.services.set('cacheNotifier', cacheNotifier);
    this.disposables.push({ dispose: () => cacheNotifier.dispose() });

    // Wire project parser to cache notifier
    projectParser.onProjectListChanged(() => {
      logger.debug('Project list changed, notifying webviews');
      cacheNotifier.notifyProjectsChanged();
    });

    // Create CLI service
    const packageCliService = this.factory.createPackageCliService(logger);
    this.services.set('packageCliService', packageCliService);

    // Create commands
    const packageBrowserCommand = this.factory.createPackageBrowserCommand(
      this.context,
      runtime,
      logger,
      nugetClient,
      projectParser,
      cacheNotifier,
    );
    this.services.set('packageBrowserCommand', packageBrowserCommand);

    const installCommand = this.factory.createInstallCommand(
      packageCliService,
      logger,
      projectParser,
      runtime,
      eventBus,
    );
    this.services.set('installCommand', installCommand);

    const uninstallCommand = this.factory.createUninstallCommand(
      packageCliService,
      logger,
      projectParser,
      runtime,
      eventBus,
    );
    this.services.set('uninstallCommand', uninstallCommand);

    this.initialized = true;
    logger.info('ServiceContainer initialized successfully');
  }

  /**
   * Get service by ID with type safety
   */
  getService<K extends ServiceId>(id: K): ServiceTypeMap[K] {
    if (!this.initialized) {
      throw new Error('ServiceContainer not initialized. Call initialize() first.');
    }

    const service = this.services.get(id);
    if (!service) {
      throw new Error(`Service not found: ${id}`);
    }

    return service as ServiceTypeMap[K];
  }

  /**
   * Register commands with VS Code
   * Delegates to factory for platform-specific command registration
   */
  registerCommands(): void {
    const logger = this.getService('logger');
    const packageBrowserCommand = this.getService('packageBrowserCommand');
    const installCommand = this.getService('installCommand');
    const uninstallCommand = this.getService('uninstallCommand');

    // Factory handles VS Code-specific command registration
    this.factory.registerCommands(this.context, packageBrowserCommand, installCommand, uninstallCommand, logger);
  }

  /**
   * Dispose all managed services
   */
  dispose(): void {
    const logger = this.services.get('logger') as ILogger | undefined;
    logger?.debug('ServiceContainer disposing');

    // Dispose in reverse order
    for (let i = this.disposables.length - 1; i >= 0; i--) {
      try {
        this.disposables[i]?.dispose();
      } catch (error) {
        logger?.error('Error disposing service', error instanceof Error ? error : undefined);
      }
    }

    this.disposables.length = 0;
    this.services.clear();
    this.initialized = false;

    logger?.info('ServiceContainer disposed');
  }
}
