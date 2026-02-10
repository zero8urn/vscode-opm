import type { Result, AppError } from '../../core/result';
import { ok, fail } from '../../core/result';
import type { ServiceIndex } from '../../domain/models/serviceIndex';
import { findResource, ResourceTypes } from '../../domain/models/serviceIndex';
import type { ILogger } from '../../services/loggerService';
import type { PackageSource } from '../../domain/models/nugetApiOptions';
import { ProviderStrategyFactory } from '../strategies/ProviderStrategyFactory';
import { createResolutionContext } from '../strategies/ServiceIndexResolutionContext';

/**
 * HTTP client interface for network requests.
 * Minimal abstraction for fetching resources.
 */
export interface IHttpClient {
  get<T>(
    url: string,
    options?: { signal?: AbortSignal; headers?: Record<string, string> },
  ): Promise<Result<T, AppError>>;
}

/**
 * Service responsible for discovering and caching NuGet API endpoints.
 *
 * Fetches the service index (index.json) from package sources and extracts
 * resource URLs (SearchQueryService, RegistrationsBaseUrl, PackageBaseAddress).
 * Caches resolved indexes to minimize network calls.
 *
 * @example
 * ```typescript
 * const resolver = new ServiceIndexResolver(httpClient, logger);
 * const result = await resolver.resolve('https://api.nuget.org/v3/index.json');
 * if (result.success) {
 *   console.log(result.value.searchQueryService); // Search endpoint
 * }
 * ```
 */
export class ServiceIndexResolver {
  private readonly cache = new Map<string, ServiceIndex>();
  private readonly strategyFactory: ProviderStrategyFactory;

  constructor(
    private readonly http: IHttpClient,
    private readonly logger: ILogger,
    strategyFactory?: ProviderStrategyFactory,
  ) {
    this.strategyFactory = strategyFactory ?? new ProviderStrategyFactory();
  }

  /**
   * Resolve service index endpoints for a package source.
   * Caches results to avoid repeated network calls.
   *
   * Uses Strategy Pattern to delegate resolution to provider-specific strategies.
   * This handles quirks like Artifactory's non-standard URL patterns.
   *
   * @param indexUrl - URL to the service index (e.g., 'https://api.nuget.org/v3/index.json')
   * @param signal - Optional AbortSignal for request cancellation
   * @param headers - Optional HTTP headers (for authentication, deprecated - use source.auth)
   * @param source - Optional PackageSource for provider-specific resolution
   * @returns Result containing ServiceIndex with resolved endpoints
   */
  async resolve(
    indexUrl: string,
    signal?: AbortSignal,
    headers?: Record<string, string>,
    source?: PackageSource,
  ): Promise<Result<ServiceIndex, AppError>> {
    // Check cache first
    const cached = this.cache.get(indexUrl);
    if (cached) {
      this.logger.debug(`Using cached service index: ${indexUrl}`);
      return ok(cached);
    }

    // Determine provider type (default to 'custom' if source not provided)
    const provider = source?.provider ?? 'custom';
    const strategy = this.strategyFactory.getStrategy(provider);

    this.logger.debug(`Using ${strategy.provider} strategy for: ${indexUrl}`);

    // Create resolution context
    const context = createResolutionContext(
      indexUrl,
      source ?? {
        id: 'unknown',
        name: 'Unknown',
        provider: 'custom',
        indexUrl,
        enabled: true,
      },
      this.http,
      this.logger,
      signal,
    );

    // Delegate to strategy
    const result = await strategy.resolve(context);

    if (!result.success) {
      return result;
    }

    // Validate required resources
    const searchUrl = findResource(result.value, ResourceTypes.SearchQueryService);
    const registrationUrl = findResource(result.value, ResourceTypes.RegistrationsBaseUrl);

    if (!searchUrl) {
      this.logger.warn('SearchQueryService resource not found in service index');
      return fail({
        code: 'ApiError',
        message: 'SearchQueryService not found in service index',
        statusCode: 0,
      });
    }

    if (!registrationUrl) {
      this.logger.warn('RegistrationsBaseUrl resource not found in service index');
      return fail({
        code: 'ApiError',
        message: 'RegistrationsBaseUrl not found in service index',
        statusCode: 0,
      });
    }

    // Cache successful resolution
    this.cache.set(indexUrl, result.value);
    this.logger.debug(`Cached service index for ${indexUrl}`);

    return ok(result.value);
  }

  /**
   * Get search query service URL for a source.
   *
   * @param indexUrl - URL to the service index
   * @param signal - Optional AbortSignal
   * @param headers - Optional HTTP headers
   * @param source - Optional PackageSource for provider-specific resolution
   * @returns Result containing the search query service URL
   */
  async getSearchUrl(
    indexUrl: string,
    signal?: AbortSignal,
    headers?: Record<string, string>,
    source?: PackageSource,
  ): Promise<Result<string, AppError>> {
    const indexResult = await this.resolve(indexUrl, signal, headers, source);
    if (!indexResult.success) {
      return indexResult;
    }

    const searchUrl = findResource(indexResult.value, ResourceTypes.SearchQueryService);
    if (!searchUrl) {
      return fail({
        code: 'ApiError',
        message: 'SearchQueryService not found in service index',
        statusCode: 0,
      });
    }

    return ok(searchUrl);
  }

  /**
   * Get registration base URL for a source.
   *
   * @param indexUrl - URL to the service index
   * @param signal - Optional AbortSignal
   * @param headers - Optional HTTP headers
   * @param source - Optional PackageSource for provider-specific resolution
   * @returns Result containing the registration base URL
   */
  async getRegistrationUrl(
    indexUrl: string,
    signal?: AbortSignal,
    headers?: Record<string, string>,
    source?: PackageSource,
  ): Promise<Result<string, AppError>> {
    const indexResult = await this.resolve(indexUrl, signal, headers, source);
    if (!indexResult.success) {
      return indexResult;
    }

    const registrationUrl = findResource(indexResult.value, ResourceTypes.RegistrationsBaseUrl);
    if (!registrationUrl) {
      return fail({
        code: 'ApiError',
        message: 'RegistrationsBaseUrl not found in service index',
        statusCode: 0,
      });
    }

    return ok(registrationUrl);
  }

  /**
   * Get flat container (package content) base URL for a source.
   *
   * @param indexUrl - URL to the service index
   * @param signal - Optional AbortSignal
   * @param headers - Optional HTTP headers
   * @param source - Optional PackageSource for provider-specific resolution
   * @returns Result containing the flat container base URL (empty string if not available)
   */
  async getFlatContainerUrl(
    indexUrl: string,
    signal?: AbortSignal,
    headers?: Record<string, string>,
    source?: PackageSource,
  ): Promise<Result<string, AppError>> {
    const indexResult = await this.resolve(indexUrl, signal, headers, source);
    if (!indexResult.success) {
      return indexResult;
    }

    const flatContainerUrl = findResource(indexResult.value, ResourceTypes.PackageBaseAddress);
    return ok(flatContainerUrl || '');
  }

  /**
   * Invalidate cached service index for a source.
   *
   * @param indexUrl - URL to the service index to invalidate
   */
  invalidateCache(indexUrl: string): void {
    this.cache.delete(indexUrl);
    this.logger.debug(`Invalidated cache for ${indexUrl}`);
  }

  /**
   * Clear all cached service indexes.
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.debug('Cleared all service index caches');
  }
}
