/**
 * LoadMoreHandler — Handles pagination requests for search results.
 */

import type { IMessageHandler, MessageContext } from '../mediator/webviewMessageMediator';
import type { LoadMoreRequestMessage, SearchResponseMessage } from '../apps/packageBrowser/types';
import { isLoadMoreRequestMessage } from '../apps/packageBrowser/types';
import type { ISearchService } from '../services/searchService';
import { mapToWebviewPackage } from './handlerUtils';

export class LoadMoreHandler implements IMessageHandler<LoadMoreRequestMessage, void> {
  readonly messageType = 'loadMoreRequest';

  async handle(request: unknown, context: MessageContext): Promise<void> {
    if (!isLoadMoreRequestMessage(request)) {
      context.logger.warn('Invalid loadMoreRequest message', request);
      return;
    }

    const searchService = context.services.searchService as ISearchService | undefined;
    if (!searchService) {
      context.logger.error('SearchService not available');
      return;
    }

    const { requestId } = request.payload;

    context.logger.info('Load more request received', { requestId });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const result = await searchService.loadNextPage(controller.signal);
      clearTimeout(timeoutId);

      if (result.error) {
        const state = searchService.getState();
        const response: SearchResponseMessage = {
          type: 'notification',
          name: 'searchResponse',
          args: {
            query: '',
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
        await context.webview.postMessage(response);
        return;
      }

      const webviewResults = result.packages.map(mapToWebviewPackage);

      const response: SearchResponseMessage = {
        type: 'notification',
        name: 'searchResponse',
        args: {
          query: '',
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
        'Unexpected error in load more handler',
        error instanceof Error ? error : new Error(String(error)),
      );

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

      await context.webview.postMessage(response);
    }
  }
}
