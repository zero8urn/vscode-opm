import type { PackageSearchResult } from '../models/packageSearchResult';
import type { SearchOptions } from '../models/searchOptions';
import type { NuGetResult } from '../models/nugetError';

/**
 * NuGet API client contract.
 *
 * Defines methods for querying NuGet package feeds following the NuGet v3 API protocol.
 * Implementations should handle service index discovery, request authentication,
 * and response parsing.
 *
 * @remarks This interface enables dependency injection and testability.
 * Use the factory function `createNuGetApiClient()` to create instances.
 */
export interface INuGetApiClient {
  /**
   * Search for NuGet packages across configured sources.
   *
   * @param options - Search parameters (query, prerelease, skip, take)
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
  searchPackages(
    options: SearchOptions,
    signal?: AbortSignal,
    sourceId?: string,
  ): Promise<NuGetResult<PackageSearchResult[]>>;
}
