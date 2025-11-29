import type * as vscode from 'vscode';
import type { NuGetApiOptions, PackageSource } from '../domain/models/nugetApiOptions';
import { defaultNuGetApiOptions, defaultNuGetSource } from '../domain/models/nugetApiOptions';
import { discoverNuGetConfigs, mergeNuGetConfigs } from '../env/node/nugetConfigParser';

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
    semVerLevel: config.get<string>('semVerLevel', defaultNuGetApiOptions.semVerLevel),
    nugetConfigPath: config.get<string>('nugetConfigPath'),
  };
}
