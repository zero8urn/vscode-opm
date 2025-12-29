/**
 * IPC message types for Package Browser webview communication.
 * Defines the typed contract between the webview client and the extension host.
 */

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
