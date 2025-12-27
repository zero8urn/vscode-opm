/**
 * Type definitions for the Package Browser webview application.
 */

/**
 * Package search result from NuGet Search API.
 */
export interface PackageSearchResult {
  /** Package ID (e.g., "Newtonsoft.Json") */
  id: string;

  /** Latest stable version */
  version: string;

  /** Package description */
  description: string | null;

  /** Package authors */
  authors: string[];

  /** Total download count across all versions */
  totalDownloads: number;

  /** Icon URL or null for default icon */
  iconUrl: string | null;

  /** Tags/keywords */
  tags?: string[];

  /** Verified publisher badge */
  verified?: boolean;
}
