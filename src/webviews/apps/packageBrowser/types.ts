/**
 * IPC message types for Package Browser webview communication.
 * Defines the typed contract between the webview client and the extension host.
 */

import type { PackageDetailsData } from '../../services/packageDetailsService';

/**
 * Webview → Host: Webview initialization complete
 */
export interface WebviewReadyMessage {
  type: 'ready';
}

/**
 * Webview → Host: Search request from user input
 */
export interface SearchRequestMessage {
  type: 'searchRequest';
  payload: {
    query: string;
    includePrerelease?: boolean;
    skip?: number;
    take?: number;
    requestId?: string;
  };
}

/**
 * Webview → Host: Load more results for current search
 */
export interface LoadMoreRequestMessage {
  type: 'loadMoreRequest';
  payload: {
    requestId?: string;
  };
}

/**
 * Host → Webview: Search results response
 */
export interface SearchResponseMessage {
  type: 'notification';
  name: 'searchResponse';
  args: {
    results: PackageSearchResult[];
    totalCount: number;
    totalHits: number;
    hasMore: boolean;
    requestId?: string;
    query: string;
    error?: {
      message: string;
      code: string;
    };
  };
}

/**
 * Simplified package search result (placeholder for NuGet API integration)
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

/**
 * Type guard for SearchRequestMessage
 */
export function isSearchRequestMessage(msg: unknown): msg is SearchRequestMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type: unknown }).type === 'searchRequest' &&
    typeof (msg as { payload?: unknown }).payload === 'object'
  );
}

/**
 * Type guard for LoadMoreRequestMessage
 */
export function isLoadMoreRequestMessage(msg: unknown): msg is LoadMoreRequestMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type: unknown }).type === 'loadMoreRequest' &&
    typeof (msg as { payload?: unknown }).payload === 'object'
  );
}

/**
 * Type guard for WebviewReadyMessage
 */
export function isWebviewReadyMessage(msg: unknown): msg is WebviewReadyMessage {
  return typeof msg === 'object' && msg !== null && (msg as { type: unknown }).type === 'ready';
}

/**
 * Type guard for SearchResponseMessage
 */
export function isSearchResponseMessage(msg: unknown): msg is SearchResponseMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type: unknown }).type === 'notification' &&
    (msg as { name: unknown }).name === 'searchResponse'
  );
}

/**
 * Webview → Host: Request package details
 */
export interface PackageDetailsRequestMessage {
  type: 'packageDetailsRequest';
  payload: {
    packageId: string;
    version?: string;
    requestId?: string;
  };
}

/**
 * Host → Webview: Package details response
 */
export interface PackageDetailsResponseMessage {
  type: 'notification';
  name: 'packageDetailsResponse';
  args: {
    packageId: string;
    version?: string;
    requestId?: string;
    data?: PackageDetailsData;
    error?: {
      message: string;
      code: string;
    };
  };
}

/**
 * Webview → Host: Request README content (lazy loading)
 */
export interface ReadmeRequestMessage {
  type: 'readmeRequest';
  payload: {
    packageId: string;
    version: string;
    requestId?: string;
  };
}

/**
 * Host → Webview: README content response
 */
export interface ReadmeResponseMessage {
  type: 'notification';
  name: 'readmeResponse';
  args: {
    packageId: string;
    version: string;
    requestId?: string;
    html?: string;
    error?: {
      message: string;
      code: string;
    };
  };
}

/**
 * Type guard for PackageDetailsRequestMessage
 */
export function isPackageDetailsRequestMessage(msg: unknown): msg is PackageDetailsRequestMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type: unknown }).type === 'packageDetailsRequest' &&
    typeof (msg as { payload?: unknown }).payload === 'object'
  );
}

/**
 * Type guard for PackageDetailsResponseMessage
 */
export function isPackageDetailsResponseMessage(msg: unknown): msg is PackageDetailsResponseMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type: unknown }).type === 'notification' &&
    (msg as { name: unknown }).name === 'packageDetailsResponse'
  );
}

/**
 * Type guard for ReadmeRequestMessage
 */
export function isReadmeRequestMessage(msg: unknown): msg is ReadmeRequestMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type: unknown }).type === 'readmeRequest' &&
    typeof (msg as { payload?: unknown }).payload === 'object'
  );
}

/**
 * Type guard for ReadmeResponseMessage
 */
export function isReadmeResponseMessage(msg: unknown): msg is ReadmeResponseMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type: unknown }).type === 'notification' &&
    (msg as { name: unknown }).name === 'readmeResponse'
  );
}
