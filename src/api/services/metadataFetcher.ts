import type { Result, AppError } from '../../core/result';
import { ok, fail } from '../../core/result';
import type { PackageIndex } from '../../domain/models/packageIndex';
import type { PackageVersionDetails } from '../../domain/models/packageVersionDetails';
import type { PackageVersionSummary } from '../../domain/models/packageIndex';
import type { PackageSource } from '../../domain/models/nugetApiOptions';
import { parsePackageVersionDetails, parseVersionSummary } from '../../domain/parsers/packageDetailsParser';
import type { ILogger } from '../../services/loggerService';
import type { IHttpClient } from './serviceIndexResolver';
import type { ServiceIndexResolver } from './serviceIndexResolver';

/**
 * Service responsible for fetching package metadata from NuGet registration API.
 *
 * Handles:
 * - Package index (all versions)
 * - Individual version details
 * - Catalog entry resolution (when embedded vs URL)
 * - Dependency information
 *
 * @example
 * ```typescript
 * const fetcher = new MetadataFetcher(httpClient, indexResolver, logger);
 * const result = await fetcher.getPackageIndex('Newtonsoft.Json', source);
 * if (result.success) {
 *   console.log(`Found ${result.value.totalVersions} versions`);
 * }
 * ```
 */
export class MetadataFetcher {
  constructor(
    private readonly http: IHttpClient,
    private readonly indexResolver: ServiceIndexResolver,
    private readonly logger: ILogger,
    private readonly timeout: number = 30000,
  ) {}

  /**
   * Fetch package metadata index with all versions.
   *
   * @param packageId - Package ID (e.g., 'Newtonsoft.Json')
   * @param source - Package source
   * @param signal - Optional AbortSignal
   * @returns Result containing PackageIndex with all versions
   */
  async getPackageIndex(
    packageId: string,
    source: PackageSource,
    signal?: AbortSignal,
  ): Promise<Result<PackageIndex, AppError>> {
    // Resolve registration base URL
    const registrationUrlResult = await this.indexResolver.getRegistrationUrl(
      source.indexUrl,
      signal,
      this.buildHeaders(source),
    );

    if (!registrationUrlResult.success) {
      return registrationUrlResult;
    }

    // Remove trailing slash from base URL to avoid double slashes
    const baseUrl = registrationUrlResult.value.replace(/\/+$/, '');
    const indexUrl = `${baseUrl}/${packageId.toLowerCase()}/index.json`;

    this.logger.info('MetadataFetcher: Fetching package index', {
      packageId,
      url: indexUrl,
      source: source.name,
    });

    // Execute request
    const result = await this.http.get<unknown>(indexUrl, {
      signal,
      headers: this.filterHeadersForUrl(source, indexUrl),
    });

    if (!result.success) {
      // Map 404 to PackageNotFound
      if (result.error.code === 'ApiError' && result.error.statusCode === 404) {
        this.logger.warn('MetadataFetcher: Package not found (404)', {
          packageId,
          url: indexUrl,
        });
        return fail({
          code: 'NotFound',
          message: `Package '${packageId}' not found`,
          resource: packageId,
        });
      }
      this.logger.error(
        'MetadataFetcher: Failed to fetch package index',
        new Error(`Package: ${packageId}, Error: ${JSON.stringify(result.error)}`),
      );
      return result;
    }

    // Parse registration index
    const versions = await this.extractVersionsFromIndex(result.value, signal, source);

    this.logger.debug('MetadataFetcher: Package index fetched', {
      packageId,
      totalVersions: versions.length,
    });

    return ok({
      id: packageId,
      versions,
      totalVersions: versions.length,
    });
  }

  /**
   * Fetch details for a specific package version.
   *
   * @param packageId - Package ID
   * @param version - Version string
   * @param source - Package source
   * @param signal - Optional AbortSignal
   * @returns Result containing PackageVersionDetails
   */
  async getPackageVersionDetails(
    packageId: string,
    version: string,
    source: PackageSource,
    signal?: AbortSignal,
  ): Promise<Result<PackageVersionDetails, AppError>> {
    // Resolve registration base URL
    const registrationUrlResult = await this.indexResolver.getRegistrationUrl(
      source.indexUrl,
      signal,
      this.buildHeaders(source),
    );

    if (!registrationUrlResult.success) {
      return registrationUrlResult;
    }

    // Remove trailing slash from base URL to avoid double slashes
    const baseUrl = registrationUrlResult.value.replace(/\/+$/, '');
    const leafUrl = `${baseUrl}/${packageId.toLowerCase()}/${version.toLowerCase()}.json`;

    this.logger.debug('MetadataFetcher: Fetching package version details', {
      packageId,
      version,
      url: leafUrl,
    });

    // Execute request
    const result = await this.http.get<Record<string, unknown>>(leafUrl, {
      signal,
      headers: this.filterHeadersForUrl(source, leafUrl),
    });

    if (!result.success) {
      // Map 404 to NotFound
      if (result.error.code === 'ApiError' && result.error.statusCode === 404) {
        return fail({
          code: 'NotFound',
          message: `Version '${version}' of package '${packageId}' not found`,
          resource: `${packageId}@${version}`,
        });
      }
      return result;
    }

    let leafData = result.value;

    // Check if catalogEntry is a URL (needs to be fetched) or embedded object
    if (typeof leafData.catalogEntry === 'string') {
      this.logger.debug('MetadataFetcher: Fetching catalog entry', {
        url: leafData.catalogEntry,
      });

      const catalogResult = await this.http.get<unknown>(leafData.catalogEntry as string, {
        signal,
        headers: this.filterHeadersForUrl(source, leafData.catalogEntry as string),
      });

      if (!catalogResult.success) {
        return catalogResult;
      }

      // Merge catalog entry into leaf data
      leafData = {
        ...leafData,
        catalogEntry: catalogResult.value,
      };
    }

    // Parse registration leaf
    const details = parsePackageVersionDetails(leafData);

    this.logger.debug('MetadataFetcher: Package version details fetched', {
      packageId,
      version,
    });

    return ok(details);
  }

  /**
   * Extract version summaries from registration index response.
   * Handles both inline items and paged catalogs.
   */
  private async extractVersionsFromIndex(
    json: unknown,
    signal: AbortSignal | undefined,
    source: PackageSource,
  ): Promise<PackageVersionSummary[]> {
    const data = json as Record<string, unknown>;
    const items = data.items as Array<Record<string, unknown>> | undefined;

    if (!items || items.length === 0) {
      return [];
    }

    const versions: PackageVersionSummary[] = [];

    for (const page of items) {
      // Check if items are inline or need to be fetched
      const pageItems = page.items as Array<Record<string, unknown>> | undefined;

      if (pageItems) {
        // Inline items
        for (const item of pageItems) {
          try {
            versions.push(parseVersionSummary(item));
          } catch (error) {
            this.logger.warn('Failed to parse version summary', { error });
          }
        }
      } else if (typeof page['@id'] === 'string') {
        // Items are paged, fetch the page
        const pageUrl = page['@id'] as string;
        const pageResult = await this.http.get<Record<string, unknown>>(pageUrl, {
          signal,
          headers: this.filterHeadersForUrl(source, pageUrl),
        });

        if (pageResult.success) {
          const pageData = pageResult.value;
          const pagedItems = pageData.items as Array<Record<string, unknown>> | undefined;

          if (pagedItems) {
            for (const item of pagedItems) {
              try {
                versions.push(parseVersionSummary(item));
              } catch (error) {
                this.logger.warn('Failed to parse version summary from paged catalog', {
                  error,
                });
              }
            }
          }
        }
      }
    }

    return versions;
  }

  /**
   * Build HTTP headers for authenticated requests.
   */
  private buildHeaders(source: PackageSource): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'vscode-opm/1.0.0',
    };

    if (!source.auth || source.auth.type === 'none') {
      return headers;
    }

    const { type, username, password, apiKeyHeader } = source.auth;

    switch (type) {
      case 'basic':
        if (username && password) {
          const credentials = `${username}:${password}`;
          const encoded = Buffer.from(credentials, 'utf8').toString('base64');
          headers.Authorization = `Basic ${encoded}`;
        }
        break;

      case 'bearer':
        if (password) {
          headers.Authorization = `Bearer ${password}`;
        }
        break;

      case 'api-key':
        if (apiKeyHeader && password) {
          headers[apiKeyHeader] = password;
        }
        break;
    }

    return headers;
  }

  /**
   * Filter headers for cross-origin requests.
   */
  private filterHeadersForUrl(source: PackageSource, targetUrl: string): Record<string, string> {
    const headers = this.buildHeaders(source);

    try {
      const sourceOrigin = new URL(source.indexUrl).origin;
      const targetOrigin = new URL(targetUrl).origin;

      if (sourceOrigin !== targetOrigin) {
        delete headers.Authorization;
        if (source.auth?.apiKeyHeader) {
          delete headers[source.auth.apiKeyHeader];
        }
      }
    } catch {
      delete headers.Authorization;
      if (source.auth?.apiKeyHeader) {
        delete headers[source.auth.apiKeyHeader];
      }
    }

    return headers;
  }
}
