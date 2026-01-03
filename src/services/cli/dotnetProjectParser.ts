/**
 * High-level project metadata parser service.
 *
 * Orchestrates target framework and package reference parsers to extract complete
 * project metadata. Implements in-memory caching with TTL and batch parsing support.
 * Automatically invalidates cache when project files change via file watcher.
 *
 * @module services/cli/dotnetProjectParser
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import type * as vscode from 'vscode';
import type { ILogger } from '../loggerService';
import type { ProjectMetadata, ProjectParseResult, ProjectParseError } from './types/projectMetadata';
import { ProjectParseErrorCode } from './types/projectMetadata';
import type { DotnetCliExecutor } from './dotnetCliExecutor';
import type { TargetFrameworkParser } from './parsers/targetFrameworkParser';
import type { PackageReferenceParser } from './parsers/packageReferenceParser';

interface CachedMetadata {
  readonly metadata: ProjectMetadata;
  readonly timestamp: number;
}

export interface DotnetProjectParser {
  /**
   * Parse metadata from a single project file.
   *
   * Extracts target framework(s), installed packages, and optional properties.
   * Results are cached in-memory with 1-minute TTL.
   *
   * @param projectPath - Absolute path to .csproj file
   * @returns Success result with metadata or error result
   */
  parseProject(projectPath: string): Promise<ProjectParseResult>;

  /**
   * Parse metadata from multiple project files in parallel.
   *
   * Executes 5 projects concurrently for optimal performance. Each project
   * is parsed independently - one failure doesn't block others.
   *
   * @param projectPaths - Array of absolute paths to .csproj files
   * @returns Map of projectPath → ProjectParseResult
   */
  parseProjects(projectPaths: string[]): Promise<Map<string, ProjectParseResult>>;

  /**
   * Invalidate cached metadata for a specific project.
   *
   * @param projectPath - Absolute path to .csproj file
   */
  invalidateCache(projectPath: string): void;

  /**
   * Clear all cached metadata.
   */
  clearAllCaches(): void;

  /**
   * Start watching project files for changes to auto-invalidate cache.
   * Must be called after parseProject/parseProjects to watch discovered projects.
   *
   * @param fileSystemWatcher - VS Code file system watcher instance
   */
  startWatching(fileSystemWatcher: vscode.FileSystemWatcher): void;

  /**
   * Stop watching project files and dispose resources.
   */
  dispose(): void;
}

export function createDotnetProjectParser(
  cliExecutor: DotnetCliExecutor,
  targetFrameworkParser: TargetFrameworkParser,
  packageReferenceParser: PackageReferenceParser,
  logger: ILogger,
): DotnetProjectParser {
  // Cache: Map<projectPath, { metadata: ProjectMetadata, timestamp: number }>
  const cache = new Map<string, CachedMetadata>();
  const CACHE_TTL_MS = 60_000; // 1 minute
  let fileWatcherDisposable: vscode.Disposable | undefined;

  /**
   * Check if cached metadata is still valid (not expired).
   */
  function isCacheValid(cached: CachedMetadata): boolean {
    return Date.now() - cached.timestamp < CACHE_TTL_MS;
  }

  /**
   * Parse a single project without caching.
   */
  async function parseProjectUncached(projectPath: string): Promise<ProjectParseResult> {
    logger.debug('Parsing project metadata', { projectPath });

    // Validate project file exists
    try {
      await fs.access(projectPath);
    } catch {
      const error: ProjectParseError = {
        code: ProjectParseErrorCode.ProjectNotFound,
        message: `Project file not found: ${projectPath}`,
        details: projectPath,
      };
      return { success: false, error };
    }

    // Verify dotnet CLI is available
    const isDotnetAvailable = await cliExecutor.isDotnetAvailable();
    if (!isDotnetAvailable) {
      const error: ProjectParseError = {
        code: ProjectParseErrorCode.DotnetNotFound,
        message: 'dotnet CLI not found in PATH. Please install .NET SDK.',
        details: 'https://dotnet.microsoft.com/download',
      };
      return { success: false, error };
    }

    // Parse target framework(s)
    const targetFrameworks = await targetFrameworkParser.parseTargetFrameworks(projectPath);
    if (!targetFrameworks) {
      const error: ProjectParseError = {
        code: ProjectParseErrorCode.NoTargetFramework,
        message: 'No target framework defined in project',
        details: projectPath,
      };
      return { success: false, error };
    }

    // Parse package references (may throw for packages.config)
    let packageReferences;
    try {
      packageReferences = await packageReferenceParser.parsePackageReferences(projectPath);
    } catch (err) {
      if (err instanceof Error && err.name === ProjectParseErrorCode.PackagesConfigNotSupported) {
        const error: ProjectParseError = {
          code: ProjectParseErrorCode.PackagesConfigNotSupported,
          message: err.message,
          details: projectPath,
        };
        return { success: false, error };
      }
      throw err; // Re-throw unexpected errors
    }

    // Parse optional properties (OutputType, UseArtifactsOutput)
    const outputTypeResult = await cliExecutor.execute({
      args: ['msbuild', projectPath, '-getProperty:OutputType', '-noLogo'],
    });
    const outputType = outputTypeResult.exitCode === 0 ? outputTypeResult.stdout.trim() : undefined;

    const artifactsResult = await cliExecutor.execute({
      args: ['msbuild', projectPath, '-getProperty:UseArtifactsOutput', '-noLogo'],
    });
    const useArtifactsOutput = artifactsResult.exitCode === 0 && artifactsResult.stdout.trim().toLowerCase() === 'true';

    // Build project metadata
    const metadata: ProjectMetadata = {
      path: projectPath,
      name: path.basename(projectPath, '.csproj'),
      targetFrameworks,
      packageReferences,
      outputType: outputType && outputType.length > 0 ? outputType : undefined,
      useArtifactsOutput: useArtifactsOutput ? true : undefined,
    };

    logger.debug('Successfully parsed project metadata', {
      projectPath,
      targetFrameworks,
      packageCount: packageReferences.length,
    });

    return { success: true, metadata };
  }

  return {
    async parseProject(projectPath: string): Promise<ProjectParseResult> {
      // Check cache first
      const cached = cache.get(projectPath);
      if (cached && isCacheValid(cached)) {
        logger.debug('Returning cached project metadata', { projectPath });
        return { success: true, metadata: cached.metadata };
      }

      // Parse fresh metadata
      const result = await parseProjectUncached(projectPath);

      // Cache successful results
      if (result.success) {
        cache.set(projectPath, {
          metadata: result.metadata,
          timestamp: Date.now(),
        });
      }

      return result;
    },

    async parseProjects(projectPaths: string[]): Promise<Map<string, ProjectParseResult>> {
      logger.debug(`Parsing ${projectPaths.length} project(s) in parallel`);

      const results = new Map<string, ProjectParseResult>();

      // Process in batches of 5 for optimal concurrency
      const BATCH_SIZE = 5;
      for (let i = 0; i < projectPaths.length; i += BATCH_SIZE) {
        const batch = projectPaths.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(batch.map(projectPath => this.parseProject(projectPath)));

        batch.forEach((projectPath, index) => {
          results.set(projectPath, batchResults[index]!);
        });
      }

      return results;
    },

    invalidateCache(projectPath: string): void {
      cache.delete(projectPath);
      logger.debug('Invalidated cache for project', { projectPath });
    },

    clearAllCaches(): void {
      cache.clear();
      logger.debug('Cleared all project metadata caches');
    },

    startWatching(fileSystemWatcher: vscode.FileSystemWatcher): void {
      // Dispose existing watcher if any
      if (fileWatcherDisposable) {
        fileWatcherDisposable.dispose();
      }

      // Watch for changes to .csproj files
      fileWatcherDisposable = fileSystemWatcher.onDidChange(uri => {
        const projectPath = uri.fsPath;
        if (cache.has(projectPath)) {
          this.invalidateCache(projectPath);
          logger.debug('Auto-invalidated cache due to file change', { projectPath });
        }
      });

      logger.debug('Started watching project files for changes');
    },

    dispose(): void {
      if (fileWatcherDisposable) {
        fileWatcherDisposable.dispose();
        fileWatcherDisposable = undefined;
        logger.debug('Stopped watching project files');
      }
    },
  };
}
