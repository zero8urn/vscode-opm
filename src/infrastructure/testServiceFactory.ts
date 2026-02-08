/**
 * Test Service Factory
 *
 * Test implementation of IServiceFactory.
 * Creates mock/stub services for testing without VS Code dependencies.
 */

import type * as vscode from 'vscode';
import type { IServiceFactory, ProjectParserWithWatcher } from './serviceFactory';
import type { ILogger } from '../services/loggerService';
import type { INuGetApiClient } from '../domain/nugetApiClient';
import type { DotnetProjectParser } from '../services/cli/dotnetProjectParser';
import type { PackageCliService } from '../services/cli/packageCliService';
import type { IVsCodeRuntime } from '../core/vscodeRuntime';
import type { CacheInvalidationNotifier } from '../services/cache/cacheInvalidationNotifier';
import type { PackageBrowserCommand } from '../commands/packageBrowserCommand';
import type { InstallPackageCommand } from '../commands/installPackageCommand';
import type { UninstallPackageCommand } from '../commands/uninstallPackageCommand';
import { MockVsCodeRuntime } from '../core/vscodeRuntime';

/**
 * Mock Logger for testing
 */
class MockLogger implements ILogger {
  readonly logs: Array<{ level: string; message: string; args?: unknown[] }> = [];

  isDebugEnabled(): boolean {
    return true;
  }

  info(message: string, ...args: unknown[]): void {
    this.logs.push({ level: 'info', message, args });
  }

  warn(message: string, ...args: unknown[]): void {
    this.logs.push({ level: 'warn', message, args });
  }

  error(message: string, error?: Error): void {
    this.logs.push({ level: 'error', message, args: [error] });
  }

  debug(message: string, ...args: unknown[]): void {
    this.logs.push({ level: 'debug', message, args });
  }

  show(): void {
    // No-op for tests
  }

  dispose(): void {
    this.logs.length = 0;
  }
}

/**
 * Stub NuGet API Client for testing
 */
class StubNuGetClient implements INuGetApiClient {
  async searchPackages(): Promise<any> {
    return { success: true, packages: [], totalCount: 0 };
  }

  async getPackageDetails(): Promise<any> {
    return { success: true, package: null };
  }

  async getPackageVersions(): Promise<any> {
    return { success: true, versions: [] };
  }

  async getPackageReadme(): Promise<any> {
    return { success: true, content: '' };
  }

  async getPackageIndex(): Promise<any> {
    return { success: true, catalogEntry: null };
  }

  async getPackageVersion(): Promise<any> {
    return { success: true, version: null };
  }
}

/**
 * Stub Project Parser for testing
 */
class StubProjectParser implements DotnetProjectParser {
  onProjectListChanged(): vscode.Disposable {
    return { dispose: () => {} };
  }

  startWatching(): void {}

  async getAllProjects(): Promise<any> {
    return { success: true, projects: [] };
  }

  async getInstalledPackages(): Promise<any> {
    return { success: true, packages: [] };
  }

  async parseProject(): Promise<any> {
    return { success: true, project: null };
  }

  async parseProjects(): Promise<any> {
    return { success: true, projects: [] };
  }

  invalidateCache(): void {}

  clearAllCaches(): void {}

  dispose(): void {}
}

/**
 * Stub CLI Service for testing
 */
class StubPackageCliService implements PackageCliService {
  async addPackage(): Promise<any> {
    return { success: true };
  }

  async removePackage(): Promise<any> {
    return { success: true };
  }
}

/**
 * Stub Cache Notifier for testing
 */
class StubCacheNotifier implements CacheInvalidationNotifier {
  onProjectsChanged(): vscode.Disposable {
    return { dispose: () => {} };
  }

  notifyProjectsChanged(): void {}

  registerPanel(): void {}

  unregisterPanel(): void {}

  dispose(): void {}
}

/**
 * Stub Package Browser Command for testing
 */
class StubPackageBrowserCommand {
  static readonly id = 'opm.openPackageBrowser';

  async execute(): Promise<void> {}
}

/**
 * Stub Install Command for testing
 */
class StubInstallCommand {
  static readonly id = 'opm.installPackage';

  async execute(): Promise<any> {
    return { successCount: 0, failureCount: 0 };
  }
}

/**
 * Stub Uninstall Command for testing
 */
class StubUninstallCommand {
  static readonly id = 'opm.uninstallPackage';

  async execute(): Promise<any> {
    return { successCount: 0, failureCount: 0 };
  }
}

/**
 * Test service factory using mocks and stubs.
 * Enables testing without VS Code Extension Host.
 */
export class TestServiceFactory implements IServiceFactory {
  createRuntime(): IVsCodeRuntime {
    return new MockVsCodeRuntime();
  }

  createLogger(): ILogger {
    return new MockLogger();
  }

  createNuGetClient(): INuGetApiClient {
    return new StubNuGetClient();
  }

  createProjectParser(): DotnetProjectParser {
    return new StubProjectParser();
  }

  createProjectParserWithWatcher(): ProjectParserWithWatcher {
    return {
      parser: new StubProjectParser(),
      disposables: [], // No real watchers in test mode
    };
  }

  createPackageCliService(): PackageCliService {
    return new StubPackageCliService();
  }

  createCacheNotifier(): CacheInvalidationNotifier {
    return new StubCacheNotifier();
  }

  createPackageBrowserCommand(): PackageBrowserCommand {
    return new StubPackageBrowserCommand() as unknown as PackageBrowserCommand;
  }

  createInstallCommand(): InstallPackageCommand {
    return new StubInstallCommand() as unknown as InstallPackageCommand;
  }

  createUninstallCommand(): UninstallPackageCommand {
    return new StubUninstallCommand() as unknown as UninstallPackageCommand;
  }

  registerCommands(): void {
    // No-op for tests - commands don't need registration in test environment
  }
}
