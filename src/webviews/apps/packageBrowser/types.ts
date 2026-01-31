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
    totalDownloads?: number;
    iconUrl?: string | null;
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
 * Webview → Host: Request workspace projects with installed package check
 */
export interface GetProjectsRequestMessage {
  type: 'getProjects';
  payload: {
    requestId?: string;
    /** Package ID to check for installed status (optional) */
    packageId?: string;
  };
}

/**
 * Webview → Host: Manual refresh of project cache and installed packages
 *  Trigger cache invalidation and re-parse all projects
 */
export interface RefreshProjectCacheRequestMessage {
  type: 'refreshProjectCache';
  payload: {
    requestId?: string;
  };
}

/**
 * Host → Webview: Workspace projects response
 */
export interface GetProjectsResponseMessage {
  type: 'notification';
  name: 'getProjectsResponse';
  args: {
    requestId?: string;
    projects: ProjectInfo[];
    error?: {
      message: string;
      code: string;
    };
  };
}

/**
 * Type guard for GetProjectsRequestMessage
 */
export function isGetProjectsRequestMessage(msg: unknown): msg is GetProjectsRequestMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type: unknown }).type === 'getProjects' &&
    typeof (msg as { payload?: unknown }).payload === 'object'
  );
}

/**
 * Type guard for RefreshProjectCacheRequestMessage
 *  Validates manual cache refresh requests
 */
export function isRefreshProjectCacheRequestMessage(msg: unknown): msg is RefreshProjectCacheRequestMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type: unknown }).type === 'refreshProjectCache' &&
    typeof (msg as { payload?: unknown }).payload === 'object'
  );
}

/**
 * Type guard for GetProjectsResponseMessage
 */
export function isGetProjectsResponseMessage(msg: unknown): msg is GetProjectsResponseMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type: unknown }).type === 'notification' &&
    (msg as { name: unknown }).name === 'getProjectsResponse'
  );
}

/**
 * Type definitions for project selection UI state
 */

/**
 * Represents a discovered .NET project in the workspace
 */
export interface ProjectInfo {
  /** Project display name (e.g., "MyApp.Web") */
  name: string;
  /** Absolute path to the .csproj file */
  path: string;
  /** Workspace-relative path for display (e.g., "src/MyApp.Web/MyApp.Web.csproj") */
  relativePath: string;
  /** Target frameworks (e.g., ["net8.0", "netstandard2.0"]) */
  frameworks: string[];
  /** Installed version of the package (undefined if not installed) */
  installedVersion?: string;
}

/**
 * Real-time progress updates during multi-project installation
 */
export interface InstallProgress {
  /** Name of the project currently being installed */
  currentProject: string;
  /** Number of projects completed */
  completed: number;
  /** Total number of projects to install */
  total: number;
  /** Current operation status */
  status: 'installing' | 'completed' | 'failed';
  /** Error message if status is 'failed' */
  error?: string;
}

/**
 * Result of a single project installation
 */
export interface InstallResult {
  /** Path to the project file */
  projectPath: string;
  /** Whether the installation succeeded */
  success: boolean;
  /** Error details if installation failed */
  error?: { code: string; message: string };
}

/**
 * Selection state for "Select All" checkbox
 */
export type SelectAllState = 'unchecked' | 'indeterminate' | 'checked';

/**
 * Webview → Host: Install package request
 */
export interface InstallPackageRequestMessage {
  type: 'installPackageRequest';
  payload: {
    packageId: string;
    version: string;
    projectPaths: string[];
    requestId: string;
  };
}

/**
 * Host → Webview: Install package response
 */
export interface InstallPackageResponseMessage {
  type: 'notification';
  name: 'installPackageResponse';
  args: {
    packageId: string;
    version: string;
    success: boolean;
    results: Array<{
      projectPath: string;
      success: boolean;
      error?: string;
    }>;
    /** Optional: per-project authoritative updates to avoid re-querying full project state */
    updatedProjects?: Array<{
      projectPath: string;
      installedVersion?: string;
      name?: string;
      relativePath?: string;
      frameworks?: string[];
    }>;
    requestId: string;
    error?: {
      message: string;
      code: string;
    };
  };
}

/**
 * Type guard for InstallPackageRequestMessage
 */
export function isInstallPackageRequestMessage(msg: unknown): msg is InstallPackageRequestMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type: unknown }).type === 'installPackageRequest' &&
    typeof (msg as { payload?: unknown }).payload === 'object'
  );
}

/**
 * Type guard for InstallPackageResponseMessage
 */
export function isInstallPackageResponseMessage(msg: unknown): msg is InstallPackageResponseMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type: unknown }).type === 'notification' &&
    (msg as { name: unknown }).name === 'installPackageResponse'
  );
}

/**
 * Webview → Host: Uninstall package request
 */
export interface UninstallPackageRequestMessage {
  type: 'uninstallPackageRequest';
  payload: {
    packageId: string;
    projectPaths: string[];
    requestId: string;
  };
}

/**
 * Host → Webview: Uninstall package response
 */
export interface UninstallPackageResponseMessage {
  type: 'notification';
  name: 'uninstallPackageResponse';
  args: {
    packageId: string;
    success: boolean;
    results: Array<{
      projectPath: string;
      success: boolean;
      error?: string;
    }>;
    /** Optional: per-project authoritative updates to avoid re-querying full project state */
    updatedProjects?: Array<{
      projectPath: string;
      installedVersion?: string;
      name?: string;
      relativePath?: string;
      frameworks?: string[];
    }>;
    requestId: string;
    error?: {
      message: string;
      code: string;
    };
  };
}

/**
 * Type guard for UninstallPackageRequestMessage
 */
export function isUninstallPackageRequestMessage(msg: unknown): msg is UninstallPackageRequestMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type: unknown }).type === 'uninstallPackageRequest' &&
    typeof (msg as { payload?: unknown }).payload === 'object'
  );
}

/**
 * Type guard for UninstallPackageResponseMessage
 */
export function isUninstallPackageResponseMessage(msg: unknown): msg is UninstallPackageResponseMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type: unknown }).type === 'notification' &&
    (msg as { name: unknown }).name === 'uninstallPackageResponse'
  );
}

/**
 * Host → Webview: Notification that projects have changed (file watcher)
 * Used to invalidate frontend cache when .csproj files change externally.
 */
export interface ProjectsChangedNotification {
  type: 'notification';
  name: 'projectsChanged';
  args: {
    /** Optional: specific project paths that changed */
    changedPaths?: string[];
  };
}

/**
 * Type guard for ProjectsChangedNotification
 */
export function isProjectsChangedNotification(msg: unknown): msg is ProjectsChangedNotification {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type: unknown }).type === 'notification' &&
    (msg as { name: unknown }).name === 'projectsChanged'
  );
}
