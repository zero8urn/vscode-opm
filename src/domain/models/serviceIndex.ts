/**
 * NuGet v3 Service Index models.
 *
 * The service index is the entry point for a NuGet package source.
 * It lists available resources (endpoints) and their capabilities.
 *
 * @see https://learn.microsoft.com/en-us/nuget/api/service-index
 */

/**
 * Service index resource type.
 */
export interface ServiceIndexResource {
  /** URL to the resource endpoint */
  '@id': string;
  /** Resource type identifier (e.g., 'SearchQueryService/3.0.0-rc') */
  '@type': string;
  /** Optional human-readable description */
  comment?: string;
}

/**
 * NuGet v3 Service Index response.
 */
export interface ServiceIndex {
  /** Schema version (e.g., '3.0.0') */
  version: string;
  /** Available resources/endpoints */
  resources: ServiceIndexResource[];
}

/**
 * Well-known NuGet v3 resource types.
 */
export const ResourceTypes = {
  /** Search packages by keyword */
  SearchQueryService: 'SearchQueryService',
  /** Autocomplete package IDs and versions */
  SearchAutocompleteService: 'SearchAutocompleteService',
  /** Get package metadata */
  RegistrationsBaseUrl: 'RegistrationsBaseUrl',
  /** Get package content (.nupkg) */
  PackageBaseAddress: 'PackageBaseAddress',
  /** Push and delete packages */
  PackagePublish: 'PackagePublish',
  /** Repository signatures */
  RepositorySignatures: 'RepositorySignatures',
} as const;

/**
 * Finds a resource URL by type prefix from service index.
 *
 * @param serviceIndex - Parsed service index
 * @param resourceType - Resource type to find (e.g., 'SearchQueryService')
 * @returns Resource URL or undefined if not found
 *
 * @example
 * ```typescript
 * const searchUrl = findResource(index, ResourceTypes.SearchQueryService);
 * // 'https://azuresearch-usnc.nuget.org/query'
 * ```
 */
export function findResource(serviceIndex: ServiceIndex, resourceType: string): string | undefined {
  // Find resource where @type starts with the requested type
  // e.g., 'SearchQueryService/3.0.0-rc' matches 'SearchQueryService'
  const resource = serviceIndex.resources.find(r => r['@type'].startsWith(resourceType));

  return resource?.['@id'];
}
