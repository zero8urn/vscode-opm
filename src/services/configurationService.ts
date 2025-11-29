import type * as vscode from 'vscode';
import type { NuGetApiOptions, PackageSource } from '../domain/models/nugetApiOptions';
import { defaultNuGetApiOptions, defaultNuGetSource } from '../domain/models/nugetApiOptions';
import { discoverNuGetConfig, parseNuGetConfig } from '../env/node/nugetConfigParser';

/**
 * Reads NuGet API configuration from VS Code settings and nuget.config.
 *
 * Priority order:
 * 1. VS Code settings (`nugetPackageManager.api.sources`)
 * 2. nuget.config file (auto-discovered or specified path)
 * 3. Default nuget.org source
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
    // Try to load from nuget.config
    const configPath =
      config.get<string>('nugetConfigPath') ||
      (vscodeApi.workspace.workspaceFolders?.[0]
        ? discoverNuGetConfig(vscodeApi.workspace.workspaceFolders[0].uri.fsPath)
        : undefined);

    if (configPath) {
      sources = parseNuGetConfig(configPath);
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
