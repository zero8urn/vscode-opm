import type { PackageSearchResult } from './models/packageSearchResult';
import type { SearchOptions } from './models/searchOptions';
import type { NuGetResult } from './models/nugetError';
import type { PackageIndex } from './models/packageIndex';
import type { PackageVersionDetails } from './models/packageVersionDetails';

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

  /**
   * Fetches package metadata index with all versions.
   *
   * Uses the NuGet Registration API to retrieve a package's complete version history.
   * For packages with ≤64 versions, the API inlines all data. For larger packages,
   * individual pages must be fetched separately.
   *
   * @param packageId - Package ID (e.g., 'Newtonsoft.Json')
   * @param signal - Optional AbortSignal for cancellation
   * @param sourceId - Optional source ID (defaults to first enabled source)
   * @returns Promise resolving to NuGetResult with PackageIndex
   *
   * @example
   * ```typescript
   * const result = await client.getPackageIndex('Newtonsoft.Json');
   * if (result.success) {
   *   console.log(`Found ${result.result.totalVersions} versions`);
   * }
   * ```
   */
  getPackageIndex(packageId: string, signal?: AbortSignal, sourceId?: string): Promise<NuGetResult<PackageIndex>>;

  /**
   * Fetches detailed metadata for a specific package version.
   *
   * Uses the NuGet Registration Leaf endpoint to retrieve complete metadata including
   * dependencies, deprecation warnings, vulnerabilities, and license information.
   *
   * @param packageId - Package ID (e.g., 'Newtonsoft.Json')
   * @param version - Version string (e.g., '13.0.1')
   * @param signal - Optional AbortSignal for cancellation
   * @param sourceId - Optional source ID (defaults to first enabled source)
   * @returns Promise resolving to NuGetResult with PackageVersionDetails
   *
   * @example
   * ```typescript
   * const result = await client.getPackageVersion('Newtonsoft.Json', '13.0.1');
   * if (result.success) {
   *   console.log(result.result.dependencyGroups);
   * }
   * ```
   */
  getPackageVersion(
    packageId: string,
    version: string,
    signal?: AbortSignal,
    sourceId?: string,
  ): Promise<NuGetResult<PackageVersionDetails>>;

  /**
   * Fetches package README content.
   *
   * Downloads raw README content from the flat container endpoint.
   * Content is returned as plain text and should be sanitized before rendering.
   *
   * @param packageId - Package ID (e.g., 'Newtonsoft.Json')
   * @param version - Version string (e.g., '13.0.1')
   * @param signal - Optional AbortSignal for cancellation
   * @param sourceId - Optional source ID (defaults to first enabled source)
   * @returns Promise resolving to NuGetResult with README content (Markdown or plain text)
   *
   * @example
   * ```typescript
   * const result = await client.getPackageReadme('Newtonsoft.Json', '13.0.1');
   * if (result.success) {
   *   const sanitized = sanitizeHtml(result.result);
   *   // Render sanitized README in webview
   * }
   * ```
   */
  getPackageReadme(
    packageId: string,
    version: string,
    signal?: AbortSignal,
    sourceId?: string,
  ): Promise<NuGetResult<string>>;
}
