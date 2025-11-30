/**
 * Represents a single package from NuGet search results.
 *
 * This domain model maps to the NuGet Search API v3 response format,
 * extracting essential metadata for package discovery and display.
 */
export interface PackageSearchResult {
  /** Package identifier (e.g., "Newtonsoft.Json") */
  id: string;

  /** Latest stable or prerelease version */
  version: string;

  /** Package description text */
  description: string;

  /** Package authors (can be multiple) */
  authors: string[];

  /** Total download count across all versions */
  downloadCount: number;

  /** URL to package icon (may be default placeholder) */
  iconUrl: string;

  /** Whether package is from verified publisher */
  verified: boolean;

  /** Package tags for categorization */
  tags: string[];
}
