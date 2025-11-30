/**
 * Package source provider types.
 */
export type PackageSourceProvider = 'nuget.org' | 'artifactory' | 'azure-artifacts' | 'github' | 'myget' | 'custom';

/**
 * Authentication configuration for package sources.
 */
export interface PackageSourceAuth {
  /** Authentication type */
  type: 'none' | 'basic' | 'bearer' | 'api-key';

  /** Username for basic auth */
  username?: string;

  /** Password/token (loaded from nuget.config into memory) */
  password?: string;

  /** API key header name (e.g., 'X-NuGet-ApiKey') */
  apiKeyHeader?: string;
}

/**
 * Individual package source configuration.
 */
export interface PackageSource {
  /** Unique identifier for this source */
  id: string;

  /** Display name */
  name: string;

  /** Provider type */
  provider: PackageSourceProvider;

  /** Service index URL (index.json) - entry point for NuGet v3 API */
  indexUrl: string;

  /** Whether this source is enabled */
  enabled: boolean;

  /** Authentication configuration */
  auth?: PackageSourceAuth;

  /** Provider-specific options */
  metadata?: Record<string, unknown>;
}

/**
 * Configuration options for NuGet API client.
 * Maps to VS Code settings under `nugetPackageManager.api.*`
 */
export interface NuGetApiOptions {
  /** Package sources to search (default includes nuget.org) */
  sources: PackageSource[];

  /** Request timeout in milliseconds (default: 30000) */
  timeout: number;

  /** Service index fetch timeout in milliseconds (default: 5000) */
  serviceIndexTimeout: number;

  /** Search request timeout in milliseconds (default: 30000) */
  searchTimeout: number;

  /** SemVer level support (default: 2.0.0) */
  semVerLevel: string;

  /** Path to nuget.config file (optional, auto-discovered if not set) */
  nugetConfigPath?: string;
}

/**
 * Default NuGet.org package source.
 */
export const defaultNuGetSource: PackageSource = {
  id: 'nuget.org',
  name: 'nuget.org',
  provider: 'nuget.org',
  indexUrl: 'https://api.nuget.org/v3/index.json',
  enabled: true,
};

/**
 * Default NuGet API options.
 */
export const defaultNuGetApiOptions: NuGetApiOptions = {
  sources: [defaultNuGetSource],
  timeout: 30000,
  serviceIndexTimeout: 5000,
  searchTimeout: 30000,
  semVerLevel: '2.0.0',
};
