/**
 * SearchHandler — Handles package search requests.
 *
 * Executes NuGet package searches and returns paginated results.
 */

import type { IMessageHandler, MessageContext } from '../mediator/webviewMessageMediator';
import type { SearchRequestMessage, SearchResponseMessage } from '../apps/packageBrowser/types';
import { isSearchRequestMessage } from '../apps/packageBrowser/types';
import type { ISearchService } from '../services/searchService';
import type { NuGetError } from '../../domain/models/nugetError';
import { mapToWebviewPackage } from './handlerUtils';

/**
 * Handler for 'searchRequest' message from webview.
 */
export class SearchHandler implements IMessageHandler<SearchRequestMessage, void> {
  readonly messageType = 'searchRequest';

  async handle(request: unknown, context: MessageContext): Promise<void> {
    if (!isSearchRequestMessage(request)) {
      context.logger.warn('Invalid searchRequest message', request);
      return;
    }

    const searchService = context.services.searchService as ISearchService | undefined;
    if (!searchService) {
      context.logger.error('SearchService not available');
      return;
    }

    const { query, includePrerelease, requestId, sourceId } = request.payload;

    context.logger.info('Search request received', {
      query,
      includePrerelease,
      requestId,
      sourceId,
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
          sourceId: sourceId, // Pass sourceId for multi-source search
        },
        controller.signal,
      );

      clearTimeout(timeoutId);

      if (result.error) {
        // Handle API errors
        this.sendErrorResponse(result.error, query, requestId, context);
        return;
      }

      // Transform domain models to webview types
      const webviewResults = result.packages.map(mapToWebviewPackage);

      context.logger.debug('Search completed successfully', {
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

      await context.webview.postMessage(response);
    } catch (error) {
      clearTimeout(timeoutId);

      context.logger.error(
        'Unexpected error in search handler',
        error instanceof Error ? error : new Error(String(error)),
      );

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

      await context.webview.postMessage(response);
    }
  }

  private async sendErrorResponse(
    error: NuGetError,
    query: string,
    requestId: string | undefined,
    context: MessageContext,
  ): Promise<void> {
    let userMessage: string;
    let errorCode: string;

    switch (error.code) {
      case 'Network':
        context.logger.warn('Network error during search', { message: error.message });
        userMessage = 'Unable to connect to NuGet. Please check your internet connection.';
        errorCode = 'Network';
        break;

      case 'ApiError':
        context.logger.error(
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
        context.logger.warn('Rate limit exceeded', { retryAfter: error.retryAfter });
        userMessage = `Too many requests. Please wait ${error.retryAfter || 60} seconds.`;
        errorCode = 'RateLimit';
        break;

      case 'ParseError':
        context.logger.error('Failed to parse NuGet response', new Error(error.message));
        userMessage = 'Unable to process NuGet response. Please try again later.';
        errorCode = 'ParseError';
        break;

      case 'AuthRequired':
        context.logger.warn('Authentication required', { message: error.message });
        userMessage = 'This NuGet source requires authentication.';
        errorCode = 'AuthRequired';
        break;

      case 'PackageNotFound':
        context.logger.info('Package not found', { message: error.message });
        userMessage = 'Package not found.';
        errorCode = 'PackageNotFound';
        break;

      case 'VersionNotFound':
        context.logger.info('Version not found', { message: error.message });
        userMessage = 'Package version not found.';
        errorCode = 'VersionNotFound';
        break;

      case 'NotFound':
        context.logger.info('Not found', { message: error.message });
        userMessage = 'Resource not found.';
        errorCode = 'NotFound';
        break;

      default: {
        const _exhaustive: never = error;
        context.logger.error('Unknown error type', _exhaustive);
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

    await context.webview.postMessage(response);
  }
}
