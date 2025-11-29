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
  
  /** Password/token (stored securely, not in settings) */
  passwordKey?: string; // Key to retrieve from VS Code SecretStorage
  
  /** API key for api-key auth */
  apiKeyHeader?: string; // e.g., 'X-NuGet-ApiKey'
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
  
  /** Search API endpoint URL */
  searchUrl: string;
  
  /** Registration/metadata API endpoint URL (optional) */
  registrationUrl?: string;
  
  /** Package download endpoint URL (optional) */
  packageBaseUrl?: string;
  
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
  searchUrl: 'https://azuresearch-usnc.nuget.org/query',
  registrationUrl: 'https://api.nuget.org/v3/registration5-semver1',
  packageBaseUrl: 'https://api.nuget.org/v3-flatcontainer',
  enabled: true,
};

/**
 * Default NuGet API options.
 */
export const defaultNuGetApiOptions: NuGetApiOptions = {
  sources: [defaultNuGetSource],
  timeout: 30000,
  semVerLevel: '2.0.0',
};
