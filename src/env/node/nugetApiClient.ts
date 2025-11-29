import type { ILogger } from '../../services/loggerService';
import type { PackageSearchResult } from '../../domain/models/packageSearchResult';
import type { SearchOptions } from '../../domain/models/searchOptions';
import type { NuGetResult } from '../../domain/models/nugetError';
import type { NuGetApiOptions } from '../../domain/models/nugetApiOptions';
import { defaultNuGetApiOptions } from '../../domain/models/nugetApiOptions';
import { parseSearchResponse } from '../../domain/parsers/searchParser';
import { getSearchUrl } from './serviceIndexClient';

/**
 * NuGet Search API v3 client.
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
export class NuGetApiClient {
  private readonly options: NuGetApiOptions;
  /** Cache of resolved search URLs per source ID */
  private readonly searchUrlCache = new Map<string, string>();

  constructor(private readonly logger: ILogger, options?: Partial<NuGetApiOptions>) {
    this.options = { ...defaultNuGetApiOptions, ...options };
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
    const result = await getSearchUrl(source.indexUrl, this.logger, this.options.timeout, signal);

    if (result.success) {
      // Cache the resolved URL
      this.searchUrlCache.set(source.id, result.result);
    }

    return result;
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
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

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
      const response = await fetch(url, { signal: controller.signal });

      clearTimeout(timeoutId);

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
 */
export function createNuGetApiClient(logger: ILogger, options?: Partial<NuGetApiOptions>): NuGetApiClient {
  return new NuGetApiClient(logger, options);
}
