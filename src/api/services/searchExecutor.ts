import type { Result, AppError } from '../../core/result';
import { ok, fail } from '../../core/result';
import type { PackageSearchResult } from '../../domain/models/packageSearchResult';
import type { SearchOptions } from '../../domain/models/searchOptions';
import type { PackageSource } from '../../domain/models/nugetApiOptions';
import { parseSearchResponse } from '../../domain/parsers/searchParser';
import type { ILogger } from '../../services/loggerService';
import type { IHttpClient } from './serviceIndexResolver';
import type { ServiceIndexResolver } from './serviceIndexResolver';

/**
 * Service responsible for executing package searches against NuGet sources.
 *
 * Handles single-source and multi-source searches with pagination, filtering,
 * and result deduplication. Supports prerelease filters, framework filters,
 * and custom package types.
 *
 * @example
 * ```typescript
 * const executor = new SearchExecutor(httpClient, indexResolver, logger);
 * const result = await executor.search(source, { query: 'Newtonsoft.Json', take: 10 });
 * if (result.success) {
 *   console.log(`Found ${result.value.length} packages`);
 * }
 * ```
 */
export class SearchExecutor {
  constructor(
    private readonly http: IHttpClient,
    private readonly indexResolver: ServiceIndexResolver,
    private readonly logger: ILogger,
    private readonly searchTimeout: number = 30000,
  ) {}

  /**
   * Execute package search against a single source.
   *
   * @param source - Package source to search
   * @param options - Search parameters (query, pagination, filters)
   * @param signal - Optional AbortSignal for cancellation
   * @returns Result containing array of matching packages
   */
  async search(
    source: PackageSource,
    options: SearchOptions,
    signal?: AbortSignal,
  ): Promise<Result<PackageSearchResult[], AppError>> {
    // Resolve search URL from service index
    const searchUrlResult = await this.indexResolver.getSearchUrl(source.indexUrl, signal, this.buildHeaders(source));
    if (!searchUrlResult.success) {
      return searchUrlResult;
    }

    const url = this.buildSearchUrl(searchUrlResult.value, options);

    this.logger.debug('SearchExecutor: Searching packages', {
      source: source.name,
      options,
      url,
    });

    // Create combined abort controller for internal timeout + caller signal
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.searchTimeout);

    // Listen to caller's signal if provided
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timeoutId);
        return fail({ code: 'Cancelled', message: 'Request was cancelled before it started' });
      }
      signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const headers = this.filterHeadersForUrl(source, url);
      const result = await this.http.get<unknown>(url, {
        signal: controller.signal,
        headers,
      });

      clearTimeout(timeoutId);

      if (!result.success) {
        return result;
      }

      // Parse and transform response
      const packages = parseSearchResponse(result.value);

      this.logger.debug('SearchExecutor: Search completed', {
        packageCount: packages.length,
      });

      return ok(packages);
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle abort/timeout
      if (error instanceof Error && error.name === 'AbortError') {
        const wasCancelledByCaller = signal?.aborted;
        this.logger.warn('SearchExecutor: Request aborted', {
          cancelledByCaller: wasCancelledByCaller,
        });
        return fail({
          code: 'Cancelled',
          message: wasCancelledByCaller ? 'Request was cancelled' : 'Request timed out',
        });
      }

      // Handle network errors
      this.logger.error(`SearchExecutor: Network error: ${error instanceof Error ? error.message : String(error)}`);
      return fail({
        code: 'Network',
        message: 'Failed to connect to NuGet API',
        cause: error,
      });
    }
  }

  /**
   * Execute multi-source search with result deduplication.
   *
   * Searches multiple sources in parallel and combines results, removing
   * duplicates based on package ID (case-insensitive). Latest version wins
   * for duplicates.
   *
   * @param sources - Array of package sources to search
   * @param options - Search parameters
   * @param signal - Optional AbortSignal
   * @returns Result containing deduplicated package array
   */
  async searchMultipleSources(
    sources: PackageSource[],
    options: SearchOptions,
    signal?: AbortSignal,
  ): Promise<Result<PackageSearchResult[], AppError>> {
    this.logger.info(`SearchExecutor: Searching ${sources.length} sources in parallel`);

    // Execute searches in parallel
    const searchPromises = sources.map(source => this.search(source, options, signal));
    const results = await Promise.all(searchPromises);

    // Collect successful results
    const allPackages: PackageSearchResult[] = [];
    const errors: AppError[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      if (result.success) {
        allPackages.push(...result.value);
      } else {
        this.logger.warn(`SearchExecutor: Source '${sources[i]!.name}' failed`, result.error);
        errors.push(result.error);
      }
    }

    // If all sources failed, return first error
    if (allPackages.length === 0 && errors.length > 0) {
      return fail(errors[0]!);
    }

    // Deduplicate by package ID (case-insensitive)
    const deduped = this.deduplicatePackages(allPackages);

    this.logger.info(`SearchExecutor: Found ${deduped.length} packages from ${sources.length} sources`);

    return ok(deduped);
  }

  /**
   * Build search URL with query parameters.
   */
  private buildSearchUrl(baseUrl: string, options: SearchOptions): string {
    const params = new URLSearchParams();

    params.set('q', options.query || '');
    params.set('skip', String(options.skip || 0));
    params.set('take', String(options.take || 20));
    params.set('prerelease', String(options.prerelease ?? false));
    params.set('semVerLevel', options.semVerLevel || '2.0.0');

    return `${baseUrl}?${params.toString()}`;
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
   * Remove auth headers when target URL origin differs from source origin.
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
      // If URL parsing fails, be conservative and remove auth headers
      delete headers.Authorization;
      if (source.auth?.apiKeyHeader) {
        delete headers[source.auth.apiKeyHeader];
      }
    }

    return headers;
  }

  /**
   * Deduplicate packages by ID (case-insensitive).
   * For duplicates, keep the entry with the latest version.
   */
  private deduplicatePackages(packages: PackageSearchResult[]): PackageSearchResult[] {
    const map = new Map<string, PackageSearchResult>();

    for (const pkg of packages) {
      const key = pkg.id.toLowerCase();
      const existing = map.get(key);

      if (!existing || this.compareVersions(pkg.version, existing.version) > 0) {
        map.set(key, pkg);
      }
    }

    return Array.from(map.values());
  }

  /**
   * Compare two semantic versions.
   * Returns: 1 if a > b, -1 if a < b, 0 if equal.
   */
  private compareVersions(a: string, b: string): number {
    const aParts = a.split('.').map(n => parseInt(n, 10) || 0);
    const bParts = b.split('.').map(n => parseInt(n, 10) || 0);

    const maxLength = Math.max(aParts.length, bParts.length);

    for (let i = 0; i < maxLength; i++) {
      const aPart = aParts[i] || 0;
      const bPart = bParts[i] || 0;

      if (aPart > bPart) return 1;
      if (aPart < bPart) return -1;
    }

    return 0;
  }
}
