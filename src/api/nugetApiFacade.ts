import type { INuGetApiClient } from '../domain/nugetApiClient';
import type { PackageSearchResult } from '../domain/models/packageSearchResult';
import type { SearchOptions } from '../domain/models/searchOptions';
import type { NuGetResult } from '../domain/models/nugetError';
import type { PackageIndex } from '../domain/models/packageIndex';
import type { PackageVersionDetails } from '../domain/models/packageVersionDetails';
import type { NuGetApiOptions, PackageSource } from '../domain/models/nugetApiOptions';
import { defaultNuGetApiOptions } from '../domain/models/nugetApiOptions';
import type { ILogger } from '../services/loggerService';

import { ServiceIndexResolver } from './services/serviceIndexResolver';
import { SearchExecutor } from './services/searchExecutor';
import { MetadataFetcher } from './services/metadataFetcher';
import { ReadmeFetcher } from './services/readmeFetcher';
import { HttpPipeline, FetchHttpClient, RetryMiddleware, RateLimitMiddleware } from './httpPipeline';

/**
 * NuGet API facade implementation.
 *
 * Provides a simplified interface to the decomposed NuGet API services.
 * Delegates to specialized services for:
 * - Service index resolution (ServiceIndexResolver)
 * - Package search (SearchExecutor)
 * - Package metadata (MetadataFetcher)
 * - README download (ReadmeFetcher)
 *
 * Uses HTTP pipeline with retry and rate limiting middleware.
 *
 * @example
 * ```typescript
 * const facade = new NuGetApiFacade(logger);
 * const result = await facade.searchPackages({ query: 'Newtonsoft.Json' });
 * if (result.success) {
 *   console.log(`Found ${result.result.length} packages`);
 * }
 * ```
 */
export class NuGetApiFacade implements INuGetApiClient {
  private readonly options: NuGetApiOptions;
  private readonly logger: ILogger;
  private readonly httpClient: HttpPipeline;
  private readonly indexResolver: ServiceIndexResolver;
  private readonly searchExecutor: SearchExecutor;
  private readonly metadataFetcher: MetadataFetcher;
  private readonly readmeFetcher: ReadmeFetcher;

  constructor(logger: ILogger, options?: Partial<NuGetApiOptions>) {
    this.logger = logger;
    this.options = { ...defaultNuGetApiOptions, ...options };

    // Build HTTP pipeline with middleware
    const baseClient = new FetchHttpClient(logger, this.options.searchTimeout);
    this.httpClient = new HttpPipeline(baseClient, [new RetryMiddleware(logger), new RateLimitMiddleware(logger)]);

    // Create specialized services
    this.indexResolver = new ServiceIndexResolver(this.httpClient, logger);
    this.searchExecutor = new SearchExecutor(this.httpClient, this.indexResolver, logger, this.options.searchTimeout);
    this.metadataFetcher = new MetadataFetcher(this.httpClient, this.indexResolver, logger, this.options.searchTimeout);
    this.readmeFetcher = new ReadmeFetcher(this.httpClient, this.indexResolver, logger, 60000);
  }

  /**
   * Search for NuGet packages.
   *
   * @param options - Search parameters
   * @param signal - Optional AbortSignal for cancellation
   * @param sourceId - Optional source ID to search. Use 'all' or undefined to search all enabled sources
   * @returns Promise resolving to NuGetResult with PackageSearchResult array
   */
  async searchPackages(
    options: SearchOptions,
    signal?: AbortSignal,
    sourceId?: string | 'all',
  ): Promise<NuGetResult<PackageSearchResult[]>> {
    // Determine which sources to search
    const shouldSearchAll = !sourceId || sourceId === 'all';
    const sources = shouldSearchAll
      ? this.options.sources.filter(s => s.enabled)
      : this.options.sources.filter(s => s.id === sourceId && s.enabled);

    if (sources.length === 0) {
      return {
        success: false,
        error: {
          code: 'ApiError',
          message:
            sourceId && sourceId !== 'all'
              ? `Source '${sourceId}' not found or disabled`
              : 'No enabled package sources configured',
        },
      };
    }

    // Multi-source search (parallel aggregation)
    if (sources.length > 1) {
      const result = await this.searchExecutor.searchMultipleSources(sources, options, signal);
      return this.convertToNuGetResult(result);
    }

    // Single source search
    const source = sources[0]!;
    const result = await this.searchExecutor.search(source, options, signal);
    return this.convertToNuGetResult(result);
  }

  /**
   * Fetch package metadata index with all versions.
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
    const source = this.getSource(sourceId);
    if (!source.success) {
      return source;
    }

    const result = await this.metadataFetcher.getPackageIndex(packageId, source.result, signal);
    return this.convertToNuGetResult(result);
  }

  /**
   * Fetch detailed metadata for a specific package version.
   *
   * @param packageId - Package ID
   * @param version - Version string
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
    const source = this.getSource(sourceId);
    if (!source.success) {
      return source;
    }

    const result = await this.metadataFetcher.getPackageVersionDetails(packageId, version, source.result, signal);
    return this.convertToNuGetResult(result);
  }

  /**
   * Fetch package README content.
   *
   * @param packageId - Package ID
   * @param version - Version string
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
    const source = this.getSource(sourceId);
    if (!source.success) {
      return source;
    }

    const result = await this.readmeFetcher.getReadme(packageId, version, source.result, signal);
    return this.convertToNuGetResult(result);
  }

  /**
   * Get a package source by ID, or return the first enabled source.
   */
  private getSource(sourceId?: string): NuGetResult<PackageSource> {
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

    const selectedSource = sources[0]!;
    this.logger.debug('NuGetApiFacade: Selected source', {
      sourceId: selectedSource.id,
      sourceName: selectedSource.name,
      requestedSourceId: sourceId,
    });

    return { success: true, result: selectedSource };
  }

  /**
   * Convert unified Result<T, AppError> to legacy NuGetResult<T>.
   * Temporary bridge during migration.
   */
  private convertToNuGetResult<T>(
    result: { success: true; value: T } | { success: false; error: any },
  ): NuGetResult<T> {
    if (result.success) {
      return { success: true, result: result.value };
    }

    // Map AppError to legacy NuGetError
    const error = result.error;
    return {
      success: false,
      error: {
        code: error.code || 'Unknown',
        message: error.message || 'Unknown error',
        statusCode: error.statusCode,
        details: error.details || error.raw || error.cause,
        hint: error.hint,
        retryAfter: error.retryAfter,
      },
    };
  }
}

/**
 * Factory function to create NuGetApiFacade instance.
 *
 * @param logger - Logger service
 * @param options - Optional API options
 * @returns NuGetApiFacade instance implementing INuGetApiClient
 */
export function createNuGetApiFacade(logger: ILogger, options?: Partial<NuGetApiOptions>): INuGetApiClient {
  return new NuGetApiFacade(logger, options);
}
