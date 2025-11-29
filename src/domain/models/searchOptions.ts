/**
 * Options for NuGet package search API requests.
 *
 * Maps to NuGet Search API v3 query parameters.
 */
export interface SearchOptions {
  /** Search query string (omit for browsing all packages) */
  query?: string;

  /** Include prerelease versions in results */
  prerelease?: boolean;

  /** Number of results to skip (for pagination) */
  skip?: number;

  /** Maximum number of results to return (default 20, max 1000) */
  take?: number;

  /** SemVer level support (default "2.0.0") */
  semVerLevel?: string;
}
