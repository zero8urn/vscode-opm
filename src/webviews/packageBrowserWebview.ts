import * as vscode from 'vscode';
import type { ILogger } from '../services/loggerService';
import type { INuGetApiClient } from '../domain/nugetApiClient';
import type { NuGetError } from '../domain/models/nugetError';
import type { PackageSearchResult as DomainPackageSearchResult } from '../domain/models/packageSearchResult';
import { createNonce, buildHtmlTemplate, isWebviewMessage } from './webviewHelpers';
import type {
  SearchRequestMessage,
  WebviewReadyMessage,
  SearchResponseMessage,
  LoadMoreRequestMessage,
  PackageSearchResult as WebviewPackageSearchResult,
} from './apps/packageBrowser/types';
import { isSearchRequestMessage, isWebviewReadyMessage, isLoadMoreRequestMessage } from './apps/packageBrowser/types';
import { createSearchService, type ISearchService } from './services/searchService';

/**
 * Creates and configures the Package Browser webview panel.
 *
 * This factory function creates a webview panel for browsing and searching NuGet packages.
 * The webview implements a typed IPC protocol for communication between the host and client.
 *
 * @param context - Extension context for resource URIs and lifecycle management
 * @param logger - Logger instance for debug and error logging
 * @param nugetClient - NuGet API client instance for search operations
 * @returns The configured webview panel
 */
export function createPackageBrowserWebview(
  context: vscode.ExtensionContext,
  logger: ILogger,
  nugetClient: INuGetApiClient,
): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel('opmPackageBrowser', 'NuGet Package Browser', vscode.ViewColumn.One, {
    enableScripts: true,
    retainContextWhenHidden: true, // Preserve search state when panel is hidden
    localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'out')],
  });

  // Create SearchService instance for this webview
  const searchService = createSearchService(nugetClient, logger);

  // Clean up on disposal
  panel.onDidDispose(() => {
    searchService.resetPagination();
    logger.debug('Package Browser webview disposed');
  });

  // Build and set HTML content
  panel.webview.html = buildPackageBrowserHtml(context, panel.webview, logger);

  // Handle messages from webview - pass searchService to handlers
  panel.webview.onDidReceiveMessage(message => {
    if (!isWebviewMessage(message)) {
      logger.warn('Invalid webview message received', message);
      return;
    }
    void handleWebviewMessage(message, panel, logger, searchService);
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
): Promise<void> {
  const msg = message as { type: string; [key: string]: unknown };

  if (isWebviewReadyMessage(msg)) {
    handleWebviewReady(msg, panel, logger);
  } else if (isSearchRequestMessage(msg)) {
    await handleSearchRequest(msg, panel, logger, searchService);
  } else if (isLoadMoreRequestMessage(msg)) {
    await handleLoadMoreRequest(msg, panel, logger, searchService);
  } else {
    logger.warn('Unknown webview message type', msg);
  }
}

function handleWebviewReady(message: WebviewReadyMessage, panel: vscode.WebviewPanel, logger: ILogger): void {
  logger.debug('Webview ready - sending initial state if needed');
  // Future: send initial configuration (default source, prerelease preference, etc.)
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
