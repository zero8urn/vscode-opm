/**
 * RefreshProjectCacheHandler — Handles manual project cache refresh requests.
 */

import type { IMessageHandler, MessageContext } from '../mediator/webviewMessageMediator';
import type { RefreshProjectCacheRequestMessage } from '../apps/packageBrowser/types';
import { isRefreshProjectCacheRequestMessage } from '../apps/packageBrowser/types';
import type { DotnetProjectParser } from '../../services/cli/dotnetProjectParser';
import type { CacheInvalidationNotifier } from '../../services/cache/cacheInvalidationNotifier';

export class RefreshProjectCacheHandler implements IMessageHandler<RefreshProjectCacheRequestMessage, void> {
  readonly messageType = 'refreshProjectCacheRequest';

  async handle(request: unknown, context: MessageContext): Promise<void> {
    if (!isRefreshProjectCacheRequestMessage(request)) {
      context.logger.warn('Invalid refreshProjectCacheRequest message', request);
      return;
    }

    const projectParser = context.services.projectParser as DotnetProjectParser | undefined;
    const cacheNotifier = context.services.cacheNotifier as CacheInvalidationNotifier | undefined;

    if (!projectParser || !cacheNotifier) {
      context.logger.error('Required services not available');
      return;
    }

    const { requestId } = request.payload;

    context.logger.info('Manual project cache refresh requested', { requestId });

    try {
      // Invalidate DotnetProjectParser cache
      (projectParser as any).cache?.clear();

      context.logger.info('Project cache cleared successfully', { requestId });

      // Notify all webviews to refresh their frontend caches
      cacheNotifier.notifyProjectsChanged();

      context.logger.debug('projectsChanged notification sent to all webviews');
    } catch (error) {
      context.logger.error('Error refreshing project cache', error instanceof Error ? error : new Error(String(error)));
    }
  }
}
