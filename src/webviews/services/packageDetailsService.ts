import type { INuGetApiClient } from '../../domain/nugetApiClient';
import type { ILogger } from '../../services/loggerService';
import type { PackageIndex } from '../../domain/models/packageIndex';
import type { PackageVersionDetails } from '../../domain/models/packageVersionDetails';
import type { NuGetError } from '../../domain/models/nugetError';
import { sanitizeHtml } from '../sanitizer';
import { compareFrameworks } from '../../utils/frameworkComparator';

/**
 * Webview-friendly version summary.
 */
export interface VersionSummary {
  version: string;
  publishedDate?: string;
  isPrerelease: boolean;
  isDeprecated: boolean;
  downloads?: number;
  listed: boolean;
}

/**
 * Webview-friendly dependency group.
 */
export interface DependencyGroup {
  framework: string;
  dependencies: Dependency[];
}

/**
 * Webview-friendly dependency.
 */
export interface Dependency {
  id: string;
  versionRange: string;
}

/**
 * Webview-friendly vulnerability.
 */
export interface Vulnerability {
  severity: string;
  advisoryUrl?: string;
}

/**
 * Complete package details for the webview.
 */
export interface PackageDetailsData {
  /** Package ID */
  id: string;
  /** Selected version */
  version: string;
  /** Package description */
  description?: string;
  /** Package title */
  title?: string;
  /** Package authors */
  authors?: string;
  /** Package icon URL */
  iconUrl?: string;
  /** License expression */
  licenseExpression?: string;
  /** License URL */
  licenseUrl?: string;
  /** Project URL */
  projectUrl?: string;
  /** Total downloads */
  totalDownloads?: number;
  /** Tags */
  tags?: string[];
  /** Is verified publisher */
  verified?: boolean;
  /** Is deprecated */
  deprecated: boolean;
  /** Deprecation reasons */
  deprecationReasons?: string[];
  /** Alternative package */
  alternativePackage?: string;
  /** Vulnerabilities */
  vulnerabilities: Vulnerability[];
  /** All available versions */
  versions: VersionSummary[];
  /** Dependency groups */
  dependencies: DependencyGroup[];
  /** README URL (for lazy loading) */
  readmeUrl?: string;
  /** Publish date */
  published?: string;
}

/**
 * Result type for package details operations.
 */
export interface PackageDetailsResult {
  data?: PackageDetailsData;
  error?: NuGetError;
}

/**
 * Result type for README operations.
 */
export interface ReadmeResult {
  html?: string;
  error?: NuGetError;
}

/**
 * Service for fetching and caching package details.
 *
 * Orchestrates API calls, caching, and HTML sanitization for the package details panel.
 * Keeps webview components focused on rendering by handling all business logic here.
 *
 * @remarks
 * - Caches package index, version details, and README content separately
 * - Cache TTL: 10 minutes (aligns with STORY-001-01-012)
 * - Sanitizes README HTML before returning to webview
 * - Transforms domain models to webview-friendly types
 *
 * @example
 * ```typescript
 * const service = createPackageDetailsService(nugetClient, logger);
 *
 * // Fetch package details
 * const result = await service.getPackageDetails('Newtonsoft.Json', '13.0.3');
 * if (result.data) {
 *   console.log(`${result.data.versions.length} versions available`);
 * }
 *
 * // Lazy-load README
 * const readme = await service.getReadme('Newtonsoft.Json', '13.0.3');
 * if (readme.html) {
 *   // Already sanitized, safe to render
 * }
 * ```
 */
export interface IPackageDetailsService {
  /**
   * Fetch complete package details including all versions and selected version metadata.
   *
   * @param packageId - Package ID (e.g., "Newtonsoft.Json")
   * @param version - Optional version (defaults to latest)
   * @param signal - Optional AbortSignal for cancellation
   * @returns PackageDetailsResult with data or error
   */
  getPackageDetails(packageId: string, version?: string, signal?: AbortSignal): Promise<PackageDetailsResult>;

  /**
   * Fetch and sanitize README content for a specific version.
   *
   * @param packageId - Package ID
   * @param version - Version string
   * @param signal - Optional AbortSignal for cancellation
   * @returns ReadmeResult with sanitized HTML or error
   */
  getReadme(packageId: string, version: string, signal?: AbortSignal): Promise<ReadmeResult>;

  /**
   * Clear cache for a specific package or all packages.
   *
   * @param packageId - Optional package ID to clear (clears all if omitted)
   */
  clearCache(packageId?: string): void;
}

/**
 * Cache entry with expiration timestamp.
 */
interface CacheEntry<T> {
  data: T;
  expires: number;
}

/**
 * Cache TTL in milliseconds (10 minutes).
 */
const CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Implementation of IPackageDetailsService.
 */
export class PackageDetailsService implements IPackageDetailsService {
  private readonly cache = new Map<string, CacheEntry<unknown>>();

  constructor(
    private readonly nugetClient: INuGetApiClient,
    private readonly logger: ILogger,
    private readonly sanitizer: (html: string) => string = sanitizeHtml,
  ) {}

  async getPackageDetails(packageId: string, version?: string, signal?: AbortSignal): Promise<PackageDetailsResult> {
    try {
      // Fetch package index (all versions)
      const indexCacheKey = `${packageId}`;
      let packageIndex = this.getCachedValue<PackageIndex>(indexCacheKey);

      if (!packageIndex) {
        this.logger.debug(`[PackageDetailsService] Fetching package index for ${packageId}`);
        const indexResult = await this.nugetClient.getPackageIndex(packageId, signal);

        if (!indexResult.success) {
          return { error: indexResult.error };
        }

        packageIndex = indexResult.result;
        this.setCachedValue(indexCacheKey, packageIndex);
      } else {
        this.logger.debug(`[PackageDetailsService] Cache hit for package index: ${packageId}`);
      }

      // Determine version to fetch (use latest if not specified)
      const targetVersion = version || packageIndex.versions[0]?.version;
      if (!targetVersion) {
        return {
          error: {
            message: `No versions found for package ${packageId}`,
            code: 'PackageNotFound',
          },
        };
      }

      // Fetch specific version details
      const versionCacheKey = `${packageId}@${targetVersion}`;
      let versionDetails = this.getCachedValue<PackageVersionDetails>(versionCacheKey);

      if (!versionDetails) {
        this.logger.debug(`[PackageDetailsService] Fetching version details for ${packageId}@${targetVersion}`);
        const versionResult = await this.nugetClient.getPackageVersion(packageId, targetVersion, signal);

        if (!versionResult.success) {
          return { error: versionResult.error };
        }

        versionDetails = versionResult.result;
        this.setCachedValue(versionCacheKey, versionDetails);
      } else {
        this.logger.debug(`[PackageDetailsService] Cache hit for version details: ${packageId}@${targetVersion}`);
      }

      // Transform to webview-friendly format
      const data = this.transformToWebviewData(packageIndex, versionDetails);
      return { data };
    } catch (error) {
      this.logger.error(
        '[PackageDetailsService] Unexpected error fetching package details',
        error instanceof Error ? error : undefined,
      );
      return {
        error: {
          message: error instanceof Error ? error.message : 'Unknown error fetching package details',
          code: 'ApiError',
        },
      };
    }
  }

  async getReadme(packageId: string, version: string, signal?: AbortSignal): Promise<ReadmeResult> {
    try {
      const readmeCacheKey = `${packageId}@${version}:readme`;
      let sanitizedHtml = this.getCachedValue<string>(readmeCacheKey);

      if (!sanitizedHtml) {
        this.logger.debug(`[PackageDetailsService] Fetching README for ${packageId}@${version}`);
        const readmeResult = await this.nugetClient.getPackageReadme(packageId, version, signal);

        if (!readmeResult.success) {
          return { error: readmeResult.error };
        }

        // Sanitize the content (NuGet returns markdown as plain text, we'll render as-is for now)
        sanitizedHtml = this.sanitizer(readmeResult.result);
        this.setCachedValue(readmeCacheKey, sanitizedHtml);
      } else {
        this.logger.debug(`[PackageDetailsService] Cache hit for README: ${packageId}@${version}`);
      }

      return { html: sanitizedHtml };
    } catch (error) {
      this.logger.error(
        '[PackageDetailsService] Unexpected error fetching README',
        error instanceof Error ? error : undefined,
      );
      return {
        error: {
          message: error instanceof Error ? error.message : 'Unknown error fetching README',
          code: 'ApiError',
        },
      };
    }
  }

  clearCache(packageId?: string): void {
    if (packageId) {
      // Clear all entries for this package
      const keysToDelete: string[] = [];
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${packageId}@`) || key === packageId) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => this.cache.delete(key));
      this.logger.debug(`[PackageDetailsService] Cleared cache for ${packageId} (${keysToDelete.length} entries)`);
    } else {
      // Clear all cache
      const size = this.cache.size;
      this.cache.clear();
      this.logger.debug(`[PackageDetailsService] Cleared all cache (${size} entries)`);
    }
  }

  /**
   * Get cached value if not expired.
   */
  private getCachedValue<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Set cached value with expiration.
   */
  private setCachedValue<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      expires: Date.now() + CACHE_TTL_MS,
    });
  }

  /**
   * Transform domain models to webview-friendly types.
   */
  private transformToWebviewData(index: PackageIndex, details: PackageVersionDetails): PackageDetailsData {
    // Transform versions
    const versions: VersionSummary[] = index.versions.map(v => ({
      version: v.version,
      publishedDate: undefined, // Not available in PackageVersionSummary
      isPrerelease: this.isPrerelease(v.version),
      isDeprecated: false, // Would need to fetch each version's details to know this
      downloads: v.downloads,
      listed: v.listed,
    }));

    // Transform dependency groups and sort by framework preference (newest first)
    const dependencies: DependencyGroup[] =
      details.dependencyGroups
        ?.map(group => ({
          framework: group.targetFramework || 'Any',
          dependencies:
            group.dependencies?.map(dep => ({
              id: dep.id,
              versionRange: dep.range || '*',
            })) || [],
        }))
        .sort((a, b) => -compareFrameworks(a.framework, b.framework)) || []; // Negate for descending

    // Transform vulnerabilities
    const vulnerabilities: Vulnerability[] =
      details.vulnerabilities?.map(vuln => ({
        severity: vuln.severity,
        advisoryUrl: vuln.advisoryUrl,
      })) || [];

    // Extract deprecation info
    const deprecated = !!details.deprecation;
    const deprecationReasons = details.deprecation?.reasons || [];
    const alternativePackage = details.deprecation?.alternatePackage?.id;

    return {
      id: details.id,
      version: details.version,
      description: details.description,
      title: details.title,
      authors: details.authors,
      iconUrl: details.iconUrl,
      licenseExpression: details.licenseExpression,
      licenseUrl: details.licenseUrl,
      projectUrl: details.projectUrl,
      totalDownloads: details.totalDownloads,
      tags: details.tags,
      verified: false, // Not available in current API response
      deprecated,
      deprecationReasons,
      alternativePackage,
      vulnerabilities,
      versions,
      dependencies,
      readmeUrl: details.readmeUrl,
      published: details.published,
    };
  }

  /**
   * Check if a version string is a prerelease.
   */
  private isPrerelease(version: string): boolean {
    // SemVer prerelease versions contain a hyphen (e.g., "1.0.0-beta", "2.0.0-rc.1")
    return version.includes('-');
  }
}

/**
 * Factory function to create a PackageDetailsService instance.
 *
 * @param nugetClient - NuGet API client for fetching data
 * @param logger - Logger for debug and error messages
 * @returns Configured PackageDetailsService instance
 */
export function createPackageDetailsService(nugetClient: INuGetApiClient, logger: ILogger): IPackageDetailsService {
  return new PackageDetailsService(nugetClient, logger);
}
