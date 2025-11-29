import type { ILogger } from '../../services/loggerService';
import type { PackageSearchResult } from '../../domain/models/packageSearchResult';
import type { SearchOptions } from '../../domain/models/searchOptions';
import type { NuGetResult } from '../../domain/models/nugetError';
import type { NuGetApiOptions } from '../../domain/models/nugetApiOptions';
import { defaultNuGetApiOptions } from '../../domain/models/nugetApiOptions';
import { parseSearchResponse } from '../../domain/parsers/searchParser';

/**
 * NuGet Search API v3 client.
 *
 * Provides methods for querying the NuGet package search service.
 * Uses native Node.js fetch with AbortController for timeout and cancellation support.
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

  constructor(private readonly logger: ILogger, options?: Partial<NuGetApiOptions>) {
    this.options = { ...defaultNuGetApiOptions, ...options };
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
    const url = this.buildSearchUrl(source.searchUrl, options);

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
