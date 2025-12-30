import type { ILogger } from '../../services/loggerService';
import type { INuGetApiClient } from '../../domain/nugetApiClient';
import type { PackageSearchResult } from '../../domain/models/packageSearchResult';
import type { SearchOptions } from '../../domain/models/searchOptions';
import type { NuGetResult } from '../../domain/models/nugetError';
import type { NuGetApiOptions, PackageSource } from '../../domain/models/nugetApiOptions';
import type { ServiceIndex } from '../../domain/models/serviceIndex';
import type { PackageIndex } from '../../domain/models/packageIndex';
import type { PackageVersionDetails } from '../../domain/models/packageVersionDetails';
import type { PackageVersionSummary } from '../../domain/models/packageIndex';
import { defaultNuGetApiOptions } from '../../domain/models/nugetApiOptions';
import { parseSearchResponse } from '../../domain/parsers/searchParser';
import { parsePackageVersionDetails, parseVersionSummary } from '../../domain/parsers/packageDetailsParser';
import { findResource, ResourceTypes } from '../../domain/models/serviceIndex';
import { compareVersions } from '../../utils/versionComparator';

/**
 * NuGet Search API v3 client implementation.
 *
 * Provides methods for querying the NuGet package search service.
 * Uses native Node.js fetch with AbortController for timeout and cancellation support.
 * Automatically resolves search URLs from service index (index.json).
 *
 * @example
 * ```typescript
 * const client = createNuGetApiClient(logger);
 * const result = await client.searchPackages({ query: 'Newtonsoft.Json' });
 * if (result.success) {
 *   console.log(result.result); // PackageSearchResult[]
 * }
 * ```
 */
export class NuGetApiClient implements INuGetApiClient {
  private readonly options: NuGetApiOptions;
  /** Cache of resolved search URLs per source ID */
  private readonly searchUrlCache = new Map<string, string>();
  /** Cache of resolved registration base URLs per source ID */
  private readonly registrationUrlCache = new Map<string, string>();
  /** Cache of resolved flat container URLs per source ID */
  private readonly flatContainerUrlCache = new Map<string, string>();

  constructor(private readonly logger: ILogger, options?: Partial<NuGetApiOptions>) {
    this.options = { ...defaultNuGetApiOptions, ...options };
  }

  /**
   * Fetches and parses NuGet v3 service index.
   *
   * The service index is the entry point for NuGet package sources,
   * listing available resources (search, metadata, package publish, etc.).
   *
   * @param indexUrl - URL to index.json (e.g., 'https://api.nuget.org/v3/index.json')
   * @param signal - Optional AbortSignal for cancellation
   * @returns Promise resolving to NuGetResult with ServiceIndex
   */
  private async fetchServiceIndex(indexUrl: string, signal?: AbortSignal): Promise<NuGetResult<ServiceIndex>> {
    this.logger.debug(`Fetching service index: ${indexUrl}`);

    // Check if already aborted
    if (signal?.aborted) {
      this.logger.debug('Request already aborted');
      return {
        success: false,
        error: { code: 'Network', message: 'Request was cancelled' },
      };
    }

    // Create timeout controller
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), this.options.serviceIndexTimeout);

    // Combine timeout and caller signals
    let combinedSignal = timeoutController.signal;
    if (signal) {
      if (typeof AbortSignal.any === 'function') {
        combinedSignal = AbortSignal.any([signal, timeoutController.signal]);
      } else {
        // Fallback: listen to caller signal manually
        signal.addEventListener('abort', () => timeoutController.abort());
        combinedSignal = timeoutController.signal;
      }
    }

    try {
      const response = await fetch(indexUrl, { signal: combinedSignal });

      if (!response.ok) {
        this.logger.warn(`Service index request failed: HTTP ${response.status}`);
        return {
          success: false,
          error: {
            code: 'ApiError',
            message: `HTTP ${response.status}: ${response.statusText}`,
          },
        };
      }

      const data = (await response.json()) as ServiceIndex;

      this.logger.debug(`Service index fetched successfully (${data.resources.length} resources)`);

      return { success: true, result: data };
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          this.logger.debug('Service index request cancelled or timed out');
          return {
            success: false,
            error: { code: 'Network', message: 'Request was cancelled or timed out' },
          };
        }

        if (error instanceof SyntaxError) {
          this.logger.error('Service index response is not valid JSON', error);
          return {
            success: false,
            error: { code: 'ParseError', message: 'Invalid JSON response' },
          };
        }

        this.logger.error('Service index request failed', error);
        return {
          success: false,
          error: { code: 'Network', message: error.message },
        };
      }

      this.logger.error('Service index request failed with unknown error');
      return {
        success: false,
        error: { code: 'Network', message: 'Unknown error' },
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Fetches service index and extracts search URL.
   *
   * @param indexUrl - URL to index.json
   * @param signal - Optional AbortSignal for cancellation
   * @returns Promise resolving to NuGetResult with search URL
   */
  private async getSearchUrl(indexUrl: string, signal?: AbortSignal): Promise<NuGetResult<string>> {
    const indexResult = await this.fetchServiceIndex(indexUrl, signal);

    if (!indexResult.success) {
      return indexResult;
    }

    const searchUrl = findResource(indexResult.result, ResourceTypes.SearchQueryService);

    if (!searchUrl) {
      this.logger.warn('SearchQueryService resource not found in service index');
      return {
        success: false,
        error: {
          code: 'ApiError',
          message: 'SearchQueryService not found in service index',
        },
      };
    }

    this.logger.debug(`Resolved search URL: ${searchUrl}`);

    return { success: true, result: searchUrl };
  }

  /**
   * Resolves the search URL for a package source.
   * Fetches service index if not cached.
   *
   * @param source - Package source
   * @param signal - Optional AbortSignal for cancellation
   * @returns Promise resolving to NuGetResult with search URL
   */
  private async resolveSearchUrl(
    source: { id: string; indexUrl: string },
    signal?: AbortSignal,
  ): Promise<NuGetResult<string>> {
    // Check cache first
    const cached = this.searchUrlCache.get(source.id);
    if (cached) {
      this.logger.debug(`Using cached search URL for ${source.id}`);
      return { success: true, result: cached };
    }

    // Fetch service index and extract search URL
    this.logger.debug(`Fetching service index for ${source.id}: ${source.indexUrl}`);
    const result = await this.getSearchUrl(source.indexUrl, signal);

    if (result.success) {
      // Cache the resolved URL
      this.searchUrlCache.set(source.id, result.result);
    }

    return result;
  }

  /**
   * Builds HTTP headers for authenticated requests.
   *
   * **Security Note**: This method handles sensitive credentials.
   * Ensure returned headers are NEVER logged to prevent credential leaks.
   *
   * @param source - Package source with auth configuration
   * @returns Headers object with authentication headers
   */
  private buildRequestHeaders(source: PackageSource): Record<string, string> {
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
          const encoded = Buffer.from(`${username}:${password}`).toString('base64');
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
   * Search for NuGet packages.
   *
   * @param options - Search parameters
   * @param signal - Optional AbortSignal for caller-controlled cancellation
   * @param sourceId - Optional source ID to search (searches all enabled sources if omitted)
   * @returns Promise resolving to NuGetResult with PackageSearchResult array
   *
   * @example
   * ```typescript
   * // Basic search (all sources)
   * const result = await client.searchPackages({ query: 'json' });
   *
   * // Search specific source
   * const result = await client.searchPackages({ query: 'json' }, undefined, 'nuget.org');
   *
   * // Search with prerelease and pagination
   * const result = await client.searchPackages({
   *   query: 'serilog',
   *   prerelease: true,
   *   skip: 20,
   *   take: 10
   * });
   *
   * // Cancellable search
   * const controller = new AbortController();
   * const result = await client.searchPackages({ query: 'test' }, controller.signal);
   * // Later: controller.abort();
   * ```
   */
  async searchPackages(
    options: SearchOptions,
    signal?: AbortSignal,
    sourceId?: string,
  ): Promise<NuGetResult<PackageSearchResult[]>> {
    // Determine which sources to search
    const sources = sourceId
      ? this.options.sources.filter(s => s.id === sourceId && s.enabled)
      : this.options.sources.filter(s => s.enabled);

    if (sources.length === 0) {
      return {
        success: false,
        error: {
          code: 'ApiError',
          message: sourceId ? `Source '${sourceId}' not found or disabled` : 'No enabled package sources configured',
        },
      };
    }

    // For now, search first source only (multi-source aggregation in future story)
    const source = sources[0]!;

    // Resolve search URL from service index
    const searchUrlResult = await this.resolveSearchUrl(source, signal);
    if (!searchUrlResult.success) {
      return searchUrlResult;
    }

    const url = this.buildSearchUrl(searchUrlResult.result, options);

    this.logger.debug('NuGetApiClient: Searching packages', { source: source.name, options, url });

    // Create combined abort controller for internal timeout + caller signal
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.searchTimeout);

    // Listen to caller's signal if provided
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timeoutId);
        return {
          success: false,
          error: {
            code: 'Network',
            message: 'Request was cancelled before it started',
          },
        };
      }
      signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const headers = this.buildRequestHeaders(source);
      const response = await fetch(url, { signal: controller.signal, headers });

      clearTimeout(timeoutId);

      // Handle authentication errors
      if (response.status === 401 || response.status === 403) {
        this.logger.error(`NuGetApiClient: Authentication required for ${source.name} (${response.status})`);
        return {
          success: false,
          error: {
            code: 'AuthRequired',
            message: `Authentication required for source '${source.name}'`,
            statusCode: response.status,
            hint: `Configure credentials in nuget.config: <packageSourceCredentials><${source.id}><add key="Username" value="..."/><add key="ClearTextPassword" value="..."/></packageSourceCredentials>`,
          },
        };
      }

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        this.logger.warn('NuGetApiClient: Rate limited', { retryAfter });
        return {
          success: false,
          error: {
            code: 'RateLimit',
            message: 'Too many requests. Please try again later.',
            retryAfter: retryAfter ? parseInt(retryAfter, 10) : undefined,
          },
        };
      }

      // Handle HTTP errors
      if (!response.ok) {
        this.logger.error(`NuGetApiClient: HTTP error ${response.status} ${response.statusText}`);
        return {
          success: false,
          error: {
            code: 'ApiError',
            message: `NuGet API returned ${response.status}: ${response.statusText}`,
            statusCode: response.status,
          },
        };
      }

      // Parse JSON response
      let json: unknown;
      try {
        json = await response.json();
      } catch (parseError) {
        this.logger.error(
          `NuGetApiClient: Failed to parse JSON: ${
            parseError instanceof Error ? parseError.message : String(parseError)
          }`,
        );
        return {
          success: false,
          error: {
            code: 'ParseError',
            message: 'Invalid JSON response from NuGet API',
            details: parseError instanceof Error ? parseError.message : String(parseError),
          },
        };
      }

      // Transform to domain model
      const packages = parseSearchResponse(json);

      this.logger.debug('NuGetApiClient: Search completed', {
        packageCount: packages.length,
      });

      return {
        success: true,
        result: packages,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle abort/timeout
      if (error instanceof Error && error.name === 'AbortError') {
        const wasCancelledByCaller = signal?.aborted;
        this.logger.warn('NuGetApiClient: Request aborted', {
          cancelledByCaller: wasCancelledByCaller,
        });
        return {
          success: false,
          error: {
            code: 'Network',
            message: wasCancelledByCaller ? 'Request was cancelled' : 'Request timed out',
          },
        };
      }

      // Handle network errors
      this.logger.error(`NuGetApiClient: Network error: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: false,
        error: {
          code: 'Network',
          message: 'Failed to connect to NuGet API',
          details: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Fetches package metadata index with all versions.
   *
   * @param packageId - Package ID (e.g., 'Newtonsoft.Json')
   * @param signal - Optional AbortSignal for cancellation
   * @param sourceId - Optional source ID (defaults to first enabled source)
   * @returns Promise resolving to NuGetResult with PackageIndex
   */
  async getPackageIndex(
    packageId: string,
    signal?: AbortSignal,
    sourceId?: string,
  ): Promise<NuGetResult<PackageIndex>> {
    // Determine source
    const sources = sourceId
      ? this.options.sources.filter(s => s.id === sourceId && s.enabled)
      : this.options.sources.filter(s => s.enabled);

    if (sources.length === 0) {
      return {
        success: false,
        error: {
          code: 'ApiError',
          message: sourceId ? `Source '${sourceId}' not found or disabled` : 'No enabled package sources configured',
        },
      };
    }

    const source = sources[0]!;

    // Resolve registration base URL
    const registrationUrlResult = await this.resolveRegistrationUrl(source, signal);
    if (!registrationUrlResult.success) {
      return registrationUrlResult;
    }

    const indexUrl = `${registrationUrlResult.result}/${packageId.toLowerCase()}/index.json`;

    this.logger.debug('NuGetApiClient: Fetching package index', { packageId, url: indexUrl });

    // Create timeout controller
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.searchTimeout);

    if (signal) {
      if (signal.aborted) {
        clearTimeout(timeoutId);
        return {
          success: false,
          error: { code: 'Network', message: 'Request was cancelled before it started' },
        };
      }
      signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const headers = this.buildRequestHeaders(source);
      const response = await fetch(indexUrl, { signal: controller.signal, headers });

      clearTimeout(timeoutId);

      if (response.status === 404) {
        return {
          success: false,
          error: { code: 'PackageNotFound', message: `Package '${packageId}' not found` },
        };
      }

      if (!response.ok) {
        this.logger.error(`NuGetApiClient: HTTP error ${response.status} ${response.statusText}`);
        return {
          success: false,
          error: {
            code: 'ApiError',
            message: `NuGet API returned ${response.status}: ${response.statusText}`,
            statusCode: response.status,
          },
        };
      }

      const json = (await response.json()) as unknown;

      // Parse registration index
      const versions = await this.extractVersionsFromIndex(json, signal);

      this.logger.debug('NuGetApiClient: Package index fetched', { packageId, totalVersions: versions.length });

      return {
        success: true,
        result: {
          id: packageId,
          versions,
          totalVersions: versions.length,
        },
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        const wasCancelledByCaller = signal?.aborted;
        return {
          success: false,
          error: {
            code: 'Network',
            message: wasCancelledByCaller ? 'Request was cancelled' : 'Request timed out',
          },
        };
      }

      this.logger.error(
        `NuGetApiClient: Error fetching package index: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        success: false,
        error: {
          code: 'Network',
          message: 'Failed to fetch package index',
          details: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Fetches detailed metadata for a specific package version.
   *
   * @param packageId - Package ID (e.g., 'Newtonsoft.Json')
   * @param version - Version string (e.g., '13.0.1')
   * @param signal - Optional AbortSignal for cancellation
   * @param sourceId - Optional source ID (defaults to first enabled source)
   * @returns Promise resolving to NuGetResult with PackageVersionDetails
   */
  async getPackageVersion(
    packageId: string,
    version: string,
    signal?: AbortSignal,
    sourceId?: string,
  ): Promise<NuGetResult<PackageVersionDetails>> {
    // Determine source
    const sources = sourceId
      ? this.options.sources.filter(s => s.id === sourceId && s.enabled)
      : this.options.sources.filter(s => s.enabled);

    if (sources.length === 0) {
      return {
        success: false,
        error: {
          code: 'ApiError',
          message: sourceId ? `Source '${sourceId}' not found or disabled` : 'No enabled package sources configured',
        },
      };
    }

    const source = sources[0]!;

    // Resolve registration base URL
    const registrationUrlResult = await this.resolveRegistrationUrl(source, signal);
    if (!registrationUrlResult.success) {
      return registrationUrlResult;
    }

    const leafUrl = `${registrationUrlResult.result}/${packageId.toLowerCase()}/${version.toLowerCase()}.json`;

    this.logger.debug('NuGetApiClient: Fetching package version', { packageId, version, url: leafUrl });

    // Create timeout controller
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.searchTimeout);

    if (signal) {
      if (signal.aborted) {
        clearTimeout(timeoutId);
        return {
          success: false,
          error: { code: 'Network', message: 'Request was cancelled before it started' },
        };
      }
      signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const headers = this.buildRequestHeaders(source);
      const response = await fetch(leafUrl, { signal: controller.signal, headers });

      clearTimeout(timeoutId);

      if (response.status === 404) {
        return {
          success: false,
          error: { code: 'VersionNotFound', message: `Version '${version}' of package '${packageId}' not found` },
        };
      }

      if (!response.ok) {
        this.logger.error(`NuGetApiClient: HTTP error ${response.status} ${response.statusText}`);
        return {
          success: false,
          error: {
            code: 'ApiError',
            message: `NuGet API returned ${response.status}: ${response.statusText}`,
            statusCode: response.status,
          },
        };
      }

      this.logger.debug('NuGetApiClient: Parsing JSON response');

      const json = await response.json().catch((parseError: Error) => {
        const contentType = response.headers.get('content-type');
        this.logger.error('Failed to parse registration leaf response as JSON', parseError);
        this.logger.debug('Response content-type', { contentType });
        throw new Error(`Failed to parse JSON: ${parseError.message}`);
      });

      this.logger.debug('NuGetApiClient: JSON parsed successfully');

      // Check if catalogEntry is a URL (needs to be fetched) or embedded object
      const data = json as Record<string, unknown>;
      this.logger.debug('NuGetApiClient: Leaf response received', {
        hasCatalogEntry: 'catalogEntry' in data,
        catalogEntryType: typeof data.catalogEntry,
        keys: Object.keys(data),
      });
      let leafData = json;

      if (typeof data.catalogEntry === 'string') {
        // catalogEntry is a URL, fetch it
        this.logger.debug('NuGetApiClient: Fetching catalog entry', { url: data.catalogEntry });
        const catalogResponse = await fetch(data.catalogEntry as string, { signal: controller.signal, headers });

        if (!catalogResponse.ok) {
          this.logger.error(`NuGetApiClient: Failed to fetch catalog entry: HTTP ${catalogResponse.status}`);
          return {
            success: false,
            error: {
              code: 'ApiError',
              message: `Failed to fetch catalog entry: ${catalogResponse.status}`,
              statusCode: catalogResponse.status,
            },
          };
        }

        const catalogJson = await catalogResponse.json();

        this.logger.debug('NuGetApiClient: Catalog entry fetched', {
          hasCatalogData: !!catalogJson,
          catalogKeys: Object.keys(catalogJson as object),
        });

        // Merge catalog entry data into the leaf data
        leafData = {
          ...json,
          catalogEntry: catalogJson,
        };

        this.logger.debug('NuGetApiClient: Merged leaf data', {
          hasCatalogEntry: 'catalogEntry' in leafData,
          catalogEntryType: typeof leafData.catalogEntry,
        });
      }

      // Parse registration leaf
      const details = parsePackageVersionDetails(leafData);

      this.logger.debug('NuGetApiClient: Package version fetched', { packageId, version });

      return { success: true, result: details };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        const wasCancelledByCaller = signal?.aborted;
        return {
          success: false,
          error: {
            code: 'Network',
            message: wasCancelledByCaller ? 'Request was cancelled' : 'Request timed out',
          },
        };
      }

      this.logger.error(
        `NuGetApiClient: Error fetching package version: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        success: false,
        error: {
          code: error instanceof Error && error.message.includes('Invalid') ? 'ParseError' : 'Network',
          message: 'Failed to fetch package version details',
          details: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Fetches package README content.
   *
   * @param packageId - Package ID (e.g., 'Newtonsoft.Json')
   * @param version - Version string (e.g., '13.0.1')
   * @param signal - Optional AbortSignal for cancellation
   * @param sourceId - Optional source ID (defaults to first enabled source)
   * @returns Promise resolving to NuGetResult with README content
   */
  async getPackageReadme(
    packageId: string,
    version: string,
    signal?: AbortSignal,
    sourceId?: string,
  ): Promise<NuGetResult<string>> {
    // Determine source
    const sources = sourceId
      ? this.options.sources.filter(s => s.id === sourceId && s.enabled)
      : this.options.sources.filter(s => s.enabled);

    if (sources.length === 0) {
      return {
        success: false,
        error: {
          code: 'ApiError',
          message: sourceId ? `Source '${sourceId}' not found or disabled` : 'No enabled package sources configured',
        },
      };
    }

    const source = sources[0]!;

    // Resolve flat container base URL
    const flatContainerUrlResult = await this.resolveFlatContainerUrl(source, signal);
    if (!flatContainerUrlResult.success) {
      return flatContainerUrlResult;
    }

    const readmeUrl = `${flatContainerUrlResult.result}/${packageId.toLowerCase()}/${version.toLowerCase()}/readme`;

    this.logger.debug('NuGetApiClient: Fetching package README', { packageId, version, url: readmeUrl });

    // Create timeout controller (60s for README download)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    if (signal) {
      if (signal.aborted) {
        clearTimeout(timeoutId);
        return {
          success: false,
          error: { code: 'Network', message: 'Request was cancelled before it started' },
        };
      }
      signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const headers = this.buildRequestHeaders(source);
      const response = await fetch(readmeUrl, { signal: controller.signal, headers });

      clearTimeout(timeoutId);

      if (response.status === 404) {
        return {
          success: false,
          error: { code: 'NotFound', message: 'Package README not found' },
        };
      }

      if (!response.ok) {
        this.logger.error(`NuGetApiClient: HTTP error ${response.status} ${response.statusText}`);
        return {
          success: false,
          error: {
            code: 'ApiError',
            message: `NuGet API returned ${response.status}: ${response.statusText}`,
            statusCode: response.status,
          },
        };
      }

      // Read response with size limit (500KB)
      const MAX_README_SIZE = 500 * 1024;
      const reader = response.body?.getReader();

      if (!reader) {
        return {
          success: false,
          error: { code: 'ApiError', message: 'Failed to read README response' },
        };
      }

      const chunks: Uint8Array[] = [];
      let totalSize = 0;
      let done = false;

      while (!done) {
        const result = await reader.read();
        done = result.done;

        if (done || !result.value) break;

        totalSize += result.value.length;

        if (totalSize > MAX_README_SIZE) {
          reader.cancel();
          this.logger.warn('README exceeded size limit', { packageId, version, size: totalSize });
          return {
            success: false,
            error: {
              code: 'ApiError',
              message: 'README too large (>500KB). View full README at nuget.org.',
            },
          };
        }

        chunks.push(result.value);
      }

      const content = Buffer.concat(chunks).toString('utf-8');

      this.logger.debug('NuGetApiClient: README fetched', { packageId, version, size: content.length });

      return { success: true, result: content };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        const wasCancelledByCaller = signal?.aborted;
        return {
          success: false,
          error: {
            code: 'Network',
            message: wasCancelledByCaller ? 'Request was cancelled' : 'Request timed out',
          },
        };
      }

      this.logger.error(
        `NuGetApiClient: Error fetching README: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        success: false,
        error: {
          code: 'Network',
          message: 'Failed to fetch package README',
          details: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Resolves registration base URL for a package source.
   * Fetches service index if not cached.
   *
   * @param source - Package source
   * @param signal - Optional AbortSignal for cancellation
   * @returns Promise resolving to NuGetResult with registration base URL
   */
  private async resolveRegistrationUrl(
    source: { id: string; indexUrl: string },
    signal?: AbortSignal,
  ): Promise<NuGetResult<string>> {
    // Check cache first
    const cached = this.registrationUrlCache.get(source.id);
    if (cached) {
      this.logger.debug(`Using cached registration URL for ${source.id}`);
      return { success: true, result: cached };
    }

    // Fetch service index
    this.logger.debug(`Fetching service index for ${source.id}: ${source.indexUrl}`);
    const indexResult = await this.fetchServiceIndex(source.indexUrl, signal);

    if (!indexResult.success) {
      return indexResult;
    }

    // Try to find RegistrationsBaseUrl/3.6.0 (prefer for SemVer 2.0 + vulnerabilities)
    let registrationUrl =
      findResource(indexResult.result, 'RegistrationsBaseUrl/3.6.0') ||
      findResource(indexResult.result, 'RegistrationsBaseUrl/Versioned') ||
      findResource(indexResult.result, 'RegistrationsBaseUrl/3.4.0') ||
      findResource(indexResult.result, ResourceTypes.RegistrationsBaseUrl);

    if (!registrationUrl) {
      this.logger.warn('RegistrationsBaseUrl not found in service index');
      return {
        success: false,
        error: { code: 'ApiError', message: 'RegistrationsBaseUrl not found in service index' },
      };
    }

    // Remove trailing slash
    registrationUrl = registrationUrl.replace(/\/$/, '');

    // Cache the resolved URL
    this.registrationUrlCache.set(source.id, registrationUrl);

    this.logger.debug(`Resolved registration URL: ${registrationUrl}`);

    return { success: true, result: registrationUrl };
  }

  /**
   * Resolves flat container base URL for a package source.
   * Fetches service index if not cached.
   *
   * @param source - Package source
   * @param signal - Optional AbortSignal for cancellation
   * @returns Promise resolving to NuGetResult with flat container base URL
   */
  private async resolveFlatContainerUrl(
    source: { id: string; indexUrl: string },
    signal?: AbortSignal,
  ): Promise<NuGetResult<string>> {
    // Check cache first
    const cached = this.flatContainerUrlCache.get(source.id);
    if (cached) {
      this.logger.debug(`Using cached flat container URL for ${source.id}`);
      return { success: true, result: cached };
    }

    // Fetch service index
    this.logger.debug(`Fetching service index for ${source.id}: ${source.indexUrl}`);
    const indexResult = await this.fetchServiceIndex(source.indexUrl, signal);

    if (!indexResult.success) {
      return indexResult;
    }

    let flatContainerUrl = findResource(indexResult.result, ResourceTypes.PackageBaseAddress);

    if (!flatContainerUrl) {
      this.logger.warn('PackageBaseAddress not found in service index');
      return {
        success: false,
        error: { code: 'ApiError', message: 'PackageBaseAddress not found in service index' },
      };
    }

    // Remove trailing slash
    flatContainerUrl = flatContainerUrl.replace(/\/$/, '');

    // Cache the resolved URL
    this.flatContainerUrlCache.set(source.id, flatContainerUrl);

    this.logger.debug(`Resolved flat container URL: ${flatContainerUrl}`);

    return { success: true, result: flatContainerUrl };
  }

  /**
   * Extracts version summaries from registration index response.
   * Handles both inlined pages (≤64 versions) and external pages (>64 versions).
   *
   * @param indexResponse - Raw registration index JSON
   * @param signal - Optional AbortSignal for cancellation
   * @returns Promise resolving to array of PackageVersionSummary
   */
  private async extractVersionsFromIndex(
    indexResponse: unknown,
    signal?: AbortSignal,
  ): Promise<PackageVersionSummary[]> {
    if (!indexResponse || typeof indexResponse !== 'object') {
      throw new Error('Invalid registration index response');
    }

    const data = indexResponse as Record<string, unknown>;
    const items = data.items as unknown[] | undefined;

    if (!items || !Array.isArray(items)) {
      throw new Error('Invalid registration index: missing items array');
    }

    const allVersions: PackageVersionSummary[] = [];

    for (const page of items) {
      const pageData = page as Record<string, unknown>;

      // Check if page has inlined items (small packages ≤64 versions)
      if (pageData.items && Array.isArray(pageData.items)) {
        // Parse inlined items
        for (const item of pageData.items) {
          allVersions.push(parseVersionSummary(item));
        }
      } else {
        // Page URL is in @id, must fetch separately (large packages >64 versions)
        const pageUrl = pageData['@id'] as string;
        if (!pageUrl) {
          throw new Error('Invalid registration page: missing @id');
        }

        // Fetch page
        const pageResponse = await fetch(pageUrl, { signal });
        if (!pageResponse.ok) {
          throw new Error(`Failed to fetch registration page: HTTP ${pageResponse.status}`);
        }

        const pageJson = (await pageResponse.json()) as Record<string, unknown>;
        const pageItems = pageJson.items as unknown[] | undefined;

        if (pageItems && Array.isArray(pageItems)) {
          for (const item of pageItems) {
            allVersions.push(parseVersionSummary(item));
          }
        }
      }
    }

    // Sort versions newest to oldest using proper SemVer comparison
    allVersions.sort((a, b) => compareVersions(b.version, a.version));

    return allVersions;
  }

  /**
   * Builds search URL with query parameters.
   */
  private buildSearchUrl(baseUrl: string, options: SearchOptions): string {
    const params = new URLSearchParams();

    if (options.query) {
      params.set('q', options.query);
    }

    if (options.prerelease !== undefined) {
      params.set('prerelease', String(options.prerelease));
    }

    if (options.skip !== undefined) {
      params.set('skip', String(options.skip));
    }

    if (options.take !== undefined) {
      params.set('take', String(options.take));
    }

    // Default to SemVer level from options
    params.set('semVerLevel', options.semVerLevel ?? this.options.semVerLevel);

    return `${baseUrl}?${params.toString()}`;
  }
}

/**
 * Factory function for creating NuGetApiClient with logger injection.
 * Use this in extension.ts activation to create the client instance.
 *
 * @param logger - Logger instance
 * @param options - Optional configuration overrides (defaults read from VS Code settings)
 * @returns INuGetApiClient instance
 */
export function createNuGetApiClient(logger: ILogger, options?: Partial<NuGetApiOptions>): INuGetApiClient {
  return new NuGetApiClient(logger, options);
}
/* force reload */
