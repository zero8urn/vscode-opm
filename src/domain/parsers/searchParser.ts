import type { PackageSearchResult } from '../models/packageSearchResult';

/**
 * NuGet Search API v3 response schema.
 */
interface NuGetSearchResponse {
  totalHits: number;
  data: Array<{
    id: string;
    version: string;
    description: string;
    authors?: string | string[];
    totalDownloads?: number;
    iconUrl?: string;
    verified?: boolean;
    tags?: string[];
  }>;
}

/**
 * Parses NuGet Search API v3 JSON response into domain model.
 *
 * @param apiResponse - Raw API response (unknown type for safety)
 * @returns Array of PackageSearchResult objects
 * @throws Never throws - returns empty array for invalid input
 *
 * @example
 * ```typescript
 * const response = await fetch('https://azuresearch-usnc.nuget.org/query?q=Newtonsoft');
 * const json = await response.json();
 * const packages = parseSearchResponse(json);
 * ```
 */
export function parseSearchResponse(apiResponse: unknown): PackageSearchResult[] {
  // Guard against invalid input
  if (!apiResponse || typeof apiResponse !== 'object') {
    return [];
  }

  const response = apiResponse as Partial<NuGetSearchResponse>;

  if (!Array.isArray(response.data)) {
    return [];
  }

  return response.data
    .filter(pkg => pkg && typeof pkg.id === 'string' && typeof pkg.version === 'string')
    .map(pkg => ({
      id: pkg.id,
      version: pkg.version,
      description: typeof pkg.description === 'string' ? pkg.description : '',
      authors: normalizeAuthors(pkg.authors),
      downloadCount: typeof pkg.totalDownloads === 'number' ? pkg.totalDownloads : 0,
      iconUrl:
        typeof pkg.iconUrl === 'string'
          ? pkg.iconUrl
          : 'https://www.nuget.org/Content/gallery/img/default-package-icon.svg',
      verified: pkg.verified === true,
      tags: normalizeTags(pkg.tags),
    }));
}

/**
 * Normalizes authors field which can be string or string[] in API response.
 */
function normalizeAuthors(authors: unknown): string[] {
  if (typeof authors === 'string') {
    return authors
      .split(',')
      .map(a => a.trim())
      .filter(Boolean);
  }
  if (Array.isArray(authors)) {
    return authors.filter(a => typeof a === 'string');
  }
  return [];
}

/**
 * Normalizes tags field to string array.
 */
function normalizeTags(tags: unknown): string[] {
  if (Array.isArray(tags)) {
    return tags.filter(t => typeof t === 'string');
  }
  return [];
}
