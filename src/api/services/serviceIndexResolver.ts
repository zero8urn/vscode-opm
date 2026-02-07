import type { Result, AppError } from '../../core/result';
import { ok, fail } from '../../core/result';
import type { ServiceIndex } from '../../domain/models/serviceIndex';
import { findResource, ResourceTypes } from '../../domain/models/serviceIndex';
import type { ILogger } from '../../services/loggerService';

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

  constructor(private readonly http: IHttpClient, private readonly logger: ILogger) {}

  /**
   * Resolve service index endpoints for a package source.
   * Caches results to avoid repeated network calls.
   *
   * @param indexUrl - URL to the service index (e.g., 'https://api.nuget.org/v3/index.json')
   * @param signal - Optional AbortSignal for request cancellation
   * @param headers - Optional HTTP headers (for authentication)
   * @returns Result containing ServiceIndex with resolved endpoints
   */
  async resolve(
    indexUrl: string,
    signal?: AbortSignal,
    headers?: Record<string, string>,
  ): Promise<Result<ServiceIndex, AppError>> {
    // Check cache first
    const cached = this.cache.get(indexUrl);
    if (cached) {
      this.logger.debug(`Using cached service index: ${indexUrl}`);
      return ok(cached);
    }

    this.logger.debug(`Fetching service index: ${indexUrl}`);

    // Check if already aborted
    if (signal?.aborted) {
      return fail({ code: 'Network', message: 'Request was cancelled' });
    }

    // Fetch service index
    const response = await this.http.get<ServiceIndex>(indexUrl, { signal, headers });

    if (!response.success) {
      return response;
    }

    const { resources, version } = response.value;

    // Validate structure
    if (!Array.isArray(resources)) {
      return fail({
        code: 'ApiError',
        message: 'Invalid service index: resources not an array',
        statusCode: 0,
      });
    }

    // Extract endpoints
    const searchUrl = findResource(response.value, ResourceTypes.SearchQueryService);
    const registrationUrl = findResource(response.value, ResourceTypes.RegistrationsBaseUrl);
    const packageUrl = findResource(response.value, ResourceTypes.PackageBaseAddress);

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

    const serviceIndex: ServiceIndex = {
      version,
      resources,
    };

    // Cache for future requests
    this.cache.set(indexUrl, serviceIndex);
    this.logger.debug(`Cached service index for ${indexUrl}`);

    return ok(serviceIndex);
  }

  /**
   * Get search query service URL for a source.
   *
   * @param indexUrl - URL to the service index
   * @param signal - Optional AbortSignal
   * @param headers - Optional HTTP headers
   * @returns Result containing the search query service URL
   */
  async getSearchUrl(
    indexUrl: string,
    signal?: AbortSignal,
    headers?: Record<string, string>,
  ): Promise<Result<string, AppError>> {
    const indexResult = await this.resolve(indexUrl, signal, headers);
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
   * @returns Result containing the registration base URL
   */
  async getRegistrationUrl(
    indexUrl: string,
    signal?: AbortSignal,
    headers?: Record<string, string>,
  ): Promise<Result<string, AppError>> {
    const indexResult = await this.resolve(indexUrl, signal, headers);
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
   * @returns Result containing the flat container base URL (empty string if not available)
   */
  async getFlatContainerUrl(
    indexUrl: string,
    signal?: AbortSignal,
    headers?: Record<string, string>,
  ): Promise<Result<string, AppError>> {
    const indexResult = await this.resolve(indexUrl, signal, headers);
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
