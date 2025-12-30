import type * as vscode from 'vscode';
import type { NuGetApiOptions, PackageSource } from '../domain/models/nugetApiOptions';
import { defaultNuGetApiOptions, defaultNuGetSource } from '../domain/models/nugetApiOptions';
import { discoverNuGetConfigs, mergeNuGetConfigs } from '../env/node/nugetConfigParser';

/**
 * Discovers and merges NuGet package sources from nuget.config files.
 *
 * Searches for nuget.config files in the standard NuGet hierarchy:
 * 1. Workspace folder → parent directories → drive root
 * 2. User-level config (~/.nuget/NuGet/NuGet.Config)
 * 3. Additional user configs (~/.nuget/config/*.config)
 * 4. Computer-level config
 *
 * @param workspaceRoot - Workspace root path (from vscode.workspace.workspaceFolders)
 * @returns Merged array of package sources with credentials
 */
export function discoverNuGetSources(workspaceRoot: string): PackageSource[] {
  try {
    const configPaths = discoverNuGetConfigs(workspaceRoot);

    if (configPaths.length === 0) {
      return []; // No configs found, caller will use defaults
    }

    return mergeNuGetConfigs(configPaths);
  } catch (error) {
    // Log error but don't throw - extension should remain functional
    // Note: No logger available in this function - error is silently handled
    // to keep extension functional even if NuGet source discovery fails
    return [];
  }
}

/**
 * Merges discovered NuGet sources with VS Code settings sources.
 *
 * Priority order (highest to lowest):
 * 1. nuget.config sources (workspace, user, computer hierarchy)
 * 2. VS Code settings sources (user/workspace settings.json)
 * 3. Hardcoded default (nuget.org)
 *
 * @param discoveredSources - Sources from nuget.config files
 * @param settingsSources - Sources from VS Code settings
 * @returns Merged sources (discoveredSources override settingsSources by ID)
 */
export function mergePackageSources(
  discoveredSources: PackageSource[],
  settingsSources: PackageSource[],
): PackageSource[] {
  if (discoveredSources.length === 0) {
    return settingsSources; // No discovered sources, use settings
  }

  // Create map of discovered sources by ID for O(1) lookup
  const discoveredMap = new Map(discoveredSources.map(s => [s.id, s]));

  // Filter out settings sources that are overridden by discovered sources
  const nonOverriddenSettings = settingsSources.filter(s => !discoveredMap.has(s.id));

  // Combine: discovered sources first (higher priority), then non-overridden settings
  return [...discoveredSources, ...nonOverriddenSettings];
}

/**
 * Reads NuGet API configuration from VS Code settings and nuget.config.
 *
 * Priority order:
 * 1. VS Code settings (`nugetPackageManager.api.sources`)
 * 2. nuget.config hierarchy (workspace → parent folders → user → computer)
 * 3. Default nuget.org source
 *
 * When using nuget.config files, all configs in the hierarchy are discovered
 * and merged following NuGet's standard behavior.
 *
 * @returns NuGet API options merged with defaults
 */
export function getNuGetApiOptions(): NuGetApiOptions {
  // Dynamic import to avoid loading vscode in tests
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const vscodeApi: typeof vscode = require('vscode');

  const config = vscodeApi.workspace.getConfiguration('nugetPackageManager.api');

  // Get sources from settings or nuget.config
  let sources: PackageSource[] = config.get<PackageSource[]>('sources', []);

  if (sources.length === 0) {
    // Try to load from nuget.config hierarchy
    const explicitConfigPath = config.get<string>('nugetConfigPath');

    if (explicitConfigPath) {
      // Use explicit config path if specified
      sources = mergeNuGetConfigs([explicitConfigPath]);
    } else if (vscodeApi.workspace.workspaceFolders?.[0]) {
      // Discover and merge all configs in hierarchy
      const configPaths = discoverNuGetConfigs(vscodeApi.workspace.workspaceFolders[0].uri.fsPath);
      if (configPaths.length > 0) {
        sources = mergeNuGetConfigs(configPaths);
      }
    }

    // Fallback to default nuget.org
    if (sources.length === 0) {
      sources = [defaultNuGetSource];
    }
  }

  return {
    sources,
    timeout: config.get<number>('timeout', defaultNuGetApiOptions.timeout),
    serviceIndexTimeout: config.get<number>('serviceIndexTimeout', defaultNuGetApiOptions.serviceIndexTimeout),
    searchTimeout: config.get<number>('searchTimeout', defaultNuGetApiOptions.searchTimeout),
    semVerLevel: defaultNuGetApiOptions.semVerLevel,
    nugetConfigPath: config.get<string>('nugetConfigPath'),
    disableCache: defaultNuGetApiOptions.disableCache,
  };
}
