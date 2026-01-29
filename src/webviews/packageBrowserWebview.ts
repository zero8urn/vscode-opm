import * as vscode from 'vscode';
import * as path from 'node:path';
import type { ILogger } from '../services/loggerService';
import type { INuGetApiClient } from '../domain/nugetApiClient';
import type { NuGetError } from '../domain/models/nugetError';
import type { PackageSearchResult as DomainPackageSearchResult } from '../domain/models/packageSearchResult';
import { createNonce, buildHtmlTemplate, isWebviewMessage } from './webviewHelpers';
import type { SolutionContextService } from '../services/context/solutionContextService';
import type {
  SearchRequestMessage,
  WebviewReadyMessage,
  SearchResponseMessage,
  LoadMoreRequestMessage,
  PackageSearchResult as WebviewPackageSearchResult,
  PackageDetailsRequestMessage,
  PackageDetailsResponseMessage,
  GetProjectsRequestMessage,
  GetProjectsResponseMessage,
  ProjectInfo,
  InstallPackageRequestMessage,
  InstallPackageResponseMessage,
  UninstallPackageRequestMessage,
  UninstallPackageResponseMessage,
} from './apps/packageBrowser/types';
import type { CacheInvalidationNotifier } from '../services/cache/cacheInvalidationNotifier';
import {
  isSearchRequestMessage,
  isWebviewReadyMessage,
  isLoadMoreRequestMessage,
  isPackageDetailsRequestMessage,
  isGetProjectsRequestMessage,
  isInstallPackageRequestMessage,
  isUninstallPackageRequestMessage,
} from './apps/packageBrowser/types';
import { createSearchService, type ISearchService } from './services/searchService';
import { createPackageDetailsService, type IPackageDetailsService } from './services/packageDetailsService';
import {
  InstallPackageCommand,
  type InstallPackageParams,
  type InstallPackageResult,
} from '../commands/installPackageCommand';
import {
  UninstallPackageCommand,
  type UninstallPackageParams,
  type UninstallPackageResult,
} from '../commands/uninstallPackageCommand';
import type { DotnetProjectParser } from '../services/cli/dotnetProjectParser';
import type { PackageReference } from '../services/cli/types/projectMetadata';

/**
 * Creates and configures the Package Browser webview panel.
 *
 * This factory function creates a webview panel for browsing and searching NuGet packages.
 * The webview implements a typed IPC protocol for communication between the host and client.
 *
 * @param context - Extension context for resource URIs and lifecycle management
 * @param logger - Logger instance for debug and error logging
 * @param nugetClient - NuGet API client instance for search operations
 * @param solutionContext - Solution context service for project discovery
 * @returns The configured webview panel
 */
export function createPackageBrowserWebview(
  context: vscode.ExtensionContext,
  logger: ILogger,
  nugetClient: INuGetApiClient,
  solutionContext: SolutionContextService,
  projectParser: DotnetProjectParser,
  cacheNotifier: CacheInvalidationNotifier,
): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel('opmPackageBrowser', 'NuGet Package Browser', vscode.ViewColumn.One, {
    enableScripts: true,
    retainContextWhenHidden: true, // Preserve search state and panel content when hidden
    localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'out')],
  });

  // Create service instances for this webview
  const searchService = createSearchService(nugetClient, logger);
  const detailsService = createPackageDetailsService(nugetClient, logger);

  cacheNotifier.registerPanel(panel);

  // Clean up on disposal
  panel.onDidDispose(() => {
    searchService.resetPagination();
    logger.debug('Package Browser webview disposed');
  });

  // Build and set HTML content
  panel.webview.html = buildPackageBrowserHtml(context, panel.webview, logger);

  // Handle messages from webview - pass services to handlers
  panel.webview.onDidReceiveMessage(message => {
    if (!isWebviewMessage(message)) {
      logger.warn('Invalid webview message received', message);
      return;
    }
    void handleWebviewMessage(message, panel, logger, searchService, detailsService, solutionContext, projectParser);
  });

  logger.debug('Package Browser webview initialized');

  return panel;
}

/**
 * Handle typed messages from the webview client.
 */
async function handleWebviewMessage(
  message: unknown,
  panel: vscode.WebviewPanel,
  logger: ILogger,
  searchService: ISearchService,
  detailsService: IPackageDetailsService,
  solutionContext: SolutionContextService,
  projectParser: DotnetProjectParser,
): Promise<void> {
  const msg = message as { type: string; [key: string]: unknown };

  if (isWebviewReadyMessage(msg)) {
    await handleWebviewReady(msg, panel, logger, solutionContext);
  } else if (isSearchRequestMessage(msg)) {
    await handleSearchRequest(msg, panel, logger, searchService);
  } else if (isLoadMoreRequestMessage(msg)) {
    await handleLoadMoreRequest(msg, panel, logger, searchService);
  } else if (isPackageDetailsRequestMessage(msg)) {
    await handlePackageDetailsRequest(msg, panel, logger, detailsService);
  } else if (isGetProjectsRequestMessage(msg)) {
    await handleGetProjectsRequest(msg, panel, logger, solutionContext, projectParser);
  } else if (isInstallPackageRequestMessage(msg)) {
    await handleInstallPackageRequest(msg, panel, logger);
  } else if (isUninstallPackageRequestMessage(msg)) {
    await handleUninstallPackageRequest(msg, panel, logger);
  } else {
    logger.warn('Unknown webview message type', msg);
  }
}

/**
 * Handle webview ready signal.
 * Waits for discovery to complete, then pushes discovered projects.
 */
async function handleWebviewReady(
  _message: WebviewReadyMessage,
  panel: vscode.WebviewPanel,
  logger: ILogger,
  solutionContext: SolutionContextService,
): Promise<void> {
  logger.debug('Webview ready - waiting for discovery then pushing projects');

  // Wait for any in-progress discovery to complete before pushing
  // This ensures we push actual projects, not an empty list
  try {
    await solutionContext.waitForDiscovery();

    const context = solutionContext.getContext();
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const workspaceRoot = workspaceFolder?.uri.fsPath ?? '';

    const projects: ProjectInfo[] = context.projects.map(project => {
      const relativePath = workspaceRoot ? path.relative(workspaceRoot, project.path) : project.path;

      return {
        name: project.name,
        path: project.path,
        relativePath,
        frameworks: [],
        installedVersion: undefined, // No packageId yet, so no installed status
      };
    });

    const response: GetProjectsResponseMessage = {
      type: 'notification',
      name: 'getProjectsResponse',
      args: {
        requestId: 'initial-push',
        projects,
      },
    };

    await panel.webview.postMessage(response);

    logger.info('Projects pushed to webview on ready', {
      projectCount: projects.length,
    });
  } catch (error) {
    logger.error('Failed to push projects on webview ready', error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Handle search request from webview.
 * Calls SearchService, transforms results, and sends response message.
 */
async function handleSearchRequest(
  message: SearchRequestMessage,
  panel: vscode.WebviewPanel,
  logger: ILogger,
  searchService: ISearchService,
): Promise<void> {
  const { query, includePrerelease, requestId } = message.payload;

  logger.info('Search request received', {
    query,
    includePrerelease,
    requestId,
  });

  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s total timeout

  try {
    // Call SearchService (resets pagination and fetches first page)
    const result = await searchService.search(
      query,
      {
        prerelease: includePrerelease ?? false,
      },
      controller.signal,
    );

    clearTimeout(timeoutId);

    if (result.error) {
      // Handle API errors
      await handleSearchError(result.error, panel, logger, query, requestId);
      return;
    }

    // Transform domain models to webview types
    const webviewResults = result.packages.map(mapToWebviewPackage);

    logger.debug('Search completed successfully', {
      packageCount: webviewResults.length,
      totalHits: result.totalHits,
      hasMore: result.hasMore,
      requestId,
    });

    // Send success response
    const response: SearchResponseMessage = {
      type: 'notification',
      name: 'searchResponse',
      args: {
        query,
        results: webviewResults,
        totalCount: webviewResults.length,
        totalHits: result.totalHits,
        hasMore: result.hasMore,
        requestId,
      },
    };

    await panel.webview.postMessage(response);
  } catch (error) {
    clearTimeout(timeoutId);

    logger.error('Unexpected error in search handler', error instanceof Error ? error : new Error(String(error)));

    // Send generic error response
    const response: SearchResponseMessage = {
      type: 'notification',
      name: 'searchResponse',
      args: {
        query,
        results: [],
        totalCount: 0,
        totalHits: 0,
        hasMore: false,
        requestId,
        error: {
          message: 'An unexpected error occurred. Please try again.',
          code: 'Unknown',
        },
      },
    };

    await panel.webview.postMessage(response);
  }
}

/**
 * Handle load more request from webview for pagination.
 * Calls SearchService to load next page and sends response.
 */
async function handleLoadMoreRequest(
  message: LoadMoreRequestMessage,
  panel: vscode.WebviewPanel,
  logger: ILogger,
  searchService: ISearchService,
): Promise<void> {
  const { requestId } = message.payload;

  logger.info('Load more request received', { requestId });

  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    // Call SearchService to load next page
    const result = await searchService.loadNextPage(controller.signal);

    clearTimeout(timeoutId);

    if (result.error) {
      // Send error response
      const state = searchService.getState();
      const response: SearchResponseMessage = {
        type: 'notification',
        name: 'searchResponse',
        args: {
          query: '', // No query for pagination continuation
          results: [],
          totalCount: state.loadedCount,
          totalHits: state.totalHits,
          hasMore: state.hasMore,
          requestId,
          error: {
            message: result.error.message,
            code: result.error.code,
          },
        },
      };
      await panel.webview.postMessage(response);
      return;
    }

    // Transform all accumulated packages to webview types
    const webviewResults = result.packages.map(mapToWebviewPackage);

    logger.debug('Load more completed successfully', {
      totalPackages: webviewResults.length,
      totalHits: result.totalHits,
      hasMore: result.hasMore,
      requestId,
    });

    // Send success response with all accumulated packages
    const response: SearchResponseMessage = {
      type: 'notification',
      name: 'searchResponse',
      args: {
        query: '', // Pagination continuation, no query needed
        results: webviewResults,
        totalCount: webviewResults.length,
        totalHits: result.totalHits,
        hasMore: result.hasMore,
        requestId,
      },
    };

    await panel.webview.postMessage(response);
  } catch (error) {
    clearTimeout(timeoutId);

    logger.error('Unexpected error in load more handler', error instanceof Error ? error : new Error(String(error)));

    const state = searchService.getState();
    const response: SearchResponseMessage = {
      type: 'notification',
      name: 'searchResponse',
      args: {
        query: '',
        results: [],
        totalCount: state.loadedCount,
        totalHits: state.totalHits,
        hasMore: false,
        requestId,
        error: {
          message: 'An unexpected error occurred while loading more packages.',
          code: 'Unknown',
        },
      },
    };

    await panel.webview.postMessage(response);
  }
}

/**
 * Handle package details request from webview.
 * Fetches package metadata and sends response message.
 */
async function handlePackageDetailsRequest(
  message: PackageDetailsRequestMessage,
  panel: vscode.WebviewPanel,
  logger: ILogger,
  detailsService: IPackageDetailsService,
): Promise<void> {
  const { packageId, version, requestId, totalDownloads, iconUrl } = message.payload;

  logger.info('Package details request received', {
    packageId,
    version,
    requestId,
    totalDownloads,
    iconUrl,
  });

  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

  try {
    const result = await detailsService.getPackageDetails(packageId, version, controller.signal);

    clearTimeout(timeoutId);

    // Override totalDownloads and iconUrl with values from search results if provided
    // (Registration API doesn't always include these)
    if (result.data) {
      if (totalDownloads !== undefined) {
        result.data.totalDownloads = totalDownloads;
      }
      if (iconUrl !== undefined && iconUrl !== null) {
        result.data.iconUrl = iconUrl;
      }
    }

    const response: PackageDetailsResponseMessage = {
      type: 'notification',
      name: 'packageDetailsResponse',
      args: {
        packageId,
        version,
        requestId,
        data: result.data,
        error: result.error
          ? {
              message: result.error.message,
              code: result.error.code,
            }
          : undefined,
      },
    };

    await panel.webview.postMessage(response);

    if (result.data) {
      logger.debug('Package details fetched successfully', {
        packageId,
        version: result.data.version,
        versionCount: result.data.versions.length,
      });
    } else if (result.error) {
      logger.warn('Package details fetch failed', {
        packageId,
        error: result.error.code,
      });
    }
  } catch (error) {
    clearTimeout(timeoutId);

    logger.error(
      'Unexpected error in package details handler',
      error instanceof Error ? error : new Error(String(error)),
    );

    const response: PackageDetailsResponseMessage = {
      type: 'notification',
      name: 'packageDetailsResponse',
      args: {
        packageId,
        version,
        requestId,
        error: {
          message: 'An unexpected error occurred while fetching package details.',
          code: 'Unknown',
        },
      },
    };

    await panel.webview.postMessage(response);
  }
}

/**
 * Maps domain PackageSearchResult to webview PackageSearchResult.
 */
function mapToWebviewPackage(domain: DomainPackageSearchResult): WebviewPackageSearchResult {
  return {
    id: domain.id,
    version: domain.version,
    description: domain.description || null,
    authors: domain.authors,
    totalDownloads: domain.downloadCount,
    iconUrl: domain.iconUrl || null,
    tags: domain.tags,
    verified: domain.verified,
  };
}

/**
 * Handle all NuGetError types with user-friendly messages.
 */
async function handleSearchError(
  error: NuGetError,
  panel: vscode.WebviewPanel,
  logger: ILogger,
  query: string,
  requestId?: string,
): Promise<void> {
  let userMessage: string;
  let errorCode: string;

  switch (error.code) {
    case 'Network':
      logger.warn('Network error during search', { message: error.message });
      userMessage = 'Unable to connect to NuGet. Please check your internet connection.';
      errorCode = 'Network';
      break;

    case 'ApiError':
      logger.error(
        'NuGet API error',
        new Error(`${error.message}${error.statusCode ? ` (HTTP ${error.statusCode})` : ''}`),
      );
      userMessage =
        error.statusCode === 503
          ? 'NuGet service is temporarily unavailable. Please try again later.'
          : 'NuGet API error. Please try again later.';
      errorCode = 'ApiError';
      break;

    case 'RateLimit':
      logger.warn('Rate limit exceeded', { retryAfter: error.retryAfter });
      userMessage = `Too many requests. Please wait ${error.retryAfter || 60} seconds.`;
      errorCode = 'RateLimit';
      break;

    case 'ParseError':
      logger.error('Failed to parse NuGet response', new Error(error.message));
      userMessage = 'Unable to process NuGet response. Please try again later.';
      errorCode = 'ParseError';
      break;

    case 'AuthRequired':
      logger.warn('Authentication required', { message: error.message });
      userMessage = 'This NuGet source requires authentication.';
      errorCode = 'AuthRequired';
      break;

    case 'PackageNotFound':
      logger.info('Package not found', { message: error.message });
      userMessage = 'Package not found.';
      errorCode = 'PackageNotFound';
      break;

    case 'VersionNotFound':
      logger.info('Version not found', { message: error.message });
      userMessage = 'Package version not found.';
      errorCode = 'VersionNotFound';
      break;

    case 'NotFound':
      logger.info('Not found', { message: error.message });
      userMessage = 'Resource not found.';
      errorCode = 'NotFound';
      break;

    default: {
      const _exhaustive: never = error;
      logger.error('Unknown error type', _exhaustive);
      userMessage = 'An unexpected error occurred.';
      errorCode = 'Unknown';
    }
  }

  const response: SearchResponseMessage = {
    type: 'notification',
    name: 'searchResponse',
    args: {
      query,
      results: [],
      totalCount: 0,
      totalHits: 0,
      hasMore: false,
      requestId,
      error: {
        message: userMessage,
        code: errorCode,
      },
    },
  };

  await panel.webview.postMessage(response);
}

/**
 * Handle get projects request from webview.
 * Fetches workspace projects and checks installed packages when packageId provided.
 */
async function handleGetProjectsRequest(
  message: GetProjectsRequestMessage,
  panel: vscode.WebviewPanel,
  logger: ILogger,
  solutionContext: SolutionContextService,
  projectParser: DotnetProjectParser,
): Promise<void> {
  const { requestId, packageId } = message.payload;

  logger.info('Get projects request received', {
    requestId,
    packageId: packageId ?? 'none',
    checkInstalled: !!packageId,
  });

  try {
    const context = solutionContext.getContext();
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const workspaceRoot = workspaceFolder?.uri.fsPath ?? '';

    // Parse all projects in parallel if packageId provided
    const projectPaths = context.projects.map(p => p.path);
    const parseResults = packageId ? await projectParser.parseProjects(projectPaths) : new Map();

    logger.debug('Project parsing completed', {
      totalProjects: projectPaths.length,
      parsedProjects: parseResults.size,
      requestId,
    });

    const projects: ProjectInfo[] = context.projects.map(project => {
      const relativePath = workspaceRoot ? path.relative(workspaceRoot, project.path) : project.path;

      // Check if package is installed in this project
      let installedVersion: string | undefined;
      if (packageId) {
        const parseResult = parseResults.get(project.path);
        if (parseResult?.success) {
          const pkg = parseResult.metadata.packageReferences.find(
            (ref: PackageReference) => ref.id.toLowerCase() === packageId.toLowerCase(),
          );
          installedVersion = pkg?.resolvedVersion;

          if (installedVersion) {
            logger.debug('Package installed in project', {
              projectName: project.name,
              packageId,
              installedVersion,
            });
          }
        }
      }

      return {
        name: project.name,
        path: project.path,
        relativePath,
        frameworks: [], // TODO: Extract from parseResult.metadata.targetFrameworks
        installedVersion,
      };
    });

    const installedCount = projects.filter(p => p.installedVersion).length;

    logger.info('Projects fetched successfully', {
      projectCount: projects.length,
      installedCount,
      mode: context.mode,
      requestId,
    });

    const response: GetProjectsResponseMessage = {
      type: 'notification',
      name: 'getProjectsResponse',
      args: {
        requestId,
        projects,
      },
    };

    await panel.webview.postMessage(response);
  } catch (error) {
    logger.error('Unexpected error in get projects handler', error instanceof Error ? error : new Error(String(error)));

    const response: GetProjectsResponseMessage = {
      type: 'notification',
      name: 'getProjectsResponse',
      args: {
        requestId,
        projects: [],
        error: {
          message: 'Failed to discover workspace projects.',
          code: 'ProjectDiscoveryError',
        },
      },
    };

    await panel.webview.postMessage(response);
  }
}

/**
 * Handle install package request from webview.
 * Invokes the InstallPackageCommand via vscode.commands.executeCommand.
 */
async function handleInstallPackageRequest(
  message: InstallPackageRequestMessage,
  panel: vscode.WebviewPanel,
  logger: ILogger,
): Promise<void> {
  const { packageId, version, projectPaths, requestId } = message.payload;

  logger.info('Install package request received', {
    packageId,
    version,
    projectCount: projectPaths.length,
    requestId,
  });

  try {
    // Invoke the internal install command
    const result = await vscode.commands.executeCommand<InstallPackageResult>(InstallPackageCommand.id, {
      packageId,
      version,
      projectPaths,
    } as InstallPackageParams);

    const successCount = result.results.filter(r => r.success).length;

    logger.info('Install command completed', {
      packageId,
      success: result.success,
      successCount,
      totalCount: result.results.length,
      requestId,
    });

    // Send success response to webview
    const response: InstallPackageResponseMessage = {
      type: 'notification',
      name: 'installPackageResponse',
      args: {
        packageId,
        version,
        success: result.success,
        results: result.results.map(r => ({
          projectPath: r.projectPath,
          success: r.success,
          error: r.error,
        })),
        requestId,
      },
    };

    await panel.webview.postMessage(response);
  } catch (error) {
    logger.error('Error executing install command', error instanceof Error ? error : new Error(String(error)));

    // Send error response to webview
    const response: InstallPackageResponseMessage = {
      type: 'notification',
      name: 'installPackageResponse',
      args: {
        packageId,
        version,
        success: false,
        results: [],
        requestId,
        error: {
          message: error instanceof Error ? error.message : 'Failed to install package',
          code: 'CommandExecutionError',
        },
      },
    };

    await panel.webview.postMessage(response);
  }
}

/**
 * Handle uninstall package request from webview.
 * Invokes the UninstallPackageCommand via vscode.commands.executeCommand.
 */
async function handleUninstallPackageRequest(
  message: UninstallPackageRequestMessage,
  panel: vscode.WebviewPanel,
  logger: ILogger,
): Promise<void> {
  const { packageId, projectPaths, requestId } = message.payload;

  logger.info('Uninstall package request received', {
    packageId,
    projectCount: projectPaths.length,
    requestId,
  });

  try {
    // Invoke the internal uninstall command
    const result = await vscode.commands.executeCommand<UninstallPackageResult>(UninstallPackageCommand.id, {
      packageId,
      projectPaths,
    } as UninstallPackageParams);

    const successCount = result.results.filter(r => r.success).length;

    logger.info('Uninstall command completed', {
      packageId,
      success: result.success,
      successCount,
      totalCount: result.results.length,
      requestId,
    });

    // Send success response to webview
    const response: UninstallPackageResponseMessage = {
      type: 'notification',
      name: 'uninstallPackageResponse',
      args: {
        packageId,
        success: result.success,
        results: result.results.map(r => ({
          projectPath: r.projectPath,
          success: r.success,
          error: r.error,
        })),
        requestId,
      },
    };

    await panel.webview.postMessage(response);

    // Show toast notifications
    if (result.success && result.results.every(r => r.success)) {
      vscode.window.showInformationMessage(`Successfully uninstalled ${packageId}`);
    } else if (!result.success) {
      vscode.window.showErrorMessage(`Failed to uninstall ${packageId}`, 'View Logs');
    } else {
      // Partial success
      vscode.window.showWarningMessage(
        `Uninstalled ${packageId} from ${successCount} of ${result.results.length} projects`,
      );
    }
  } catch (error) {
    logger.error('Error executing uninstall command', error instanceof Error ? error : new Error(String(error)));

    // Send error response to webview
    const response: UninstallPackageResponseMessage = {
      type: 'notification',
      name: 'uninstallPackageResponse',
      args: {
        packageId,
        success: false,
        results: [],
        requestId,
        error: {
          message: error instanceof Error ? error.message : 'Failed to uninstall package',
          code: 'CommandExecutionError',
        },
      },
    };

    await panel.webview.postMessage(response);
  }
}

/**
 * Build the HTML document for the Package Browser webview.
 * Loads the bundled Lit component from out/webviews/packageBrowser.js.
 */
function buildPackageBrowserHtml(context: vscode.ExtensionContext, webview: vscode.Webview, logger: ILogger): string {
  const nonce = createNonce();

  // Get URI for bundled webview script
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'out', 'webviews', 'packageBrowser.js'),
  );

  logger.debug('Loading webview script from:', scriptUri.toString());

  // Build HTML with bundled Lit component
  // Note: Use scripts array instead of inline script to avoid sanitization
  return buildHtmlTemplate({
    title: 'NuGet Package Browser',
    nonce,
    webview,
    bodyHtml: '<package-browser-app></package-browser-app>',
    scripts: [scriptUri],
  });
}
