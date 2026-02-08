/**
 * GetPackageSourcesHandler — Handles package source listing requests.
 *
 * Returns the list of enabled NuGet package sources configured for the workspace.
 */

import type { IMessageHandler, MessageContext } from '../mediator/webviewMessageMediator';
import type { IVsCodeRuntime } from '../../core/vscodeRuntime';
import type { GetPackageSourcesRequestMessage, GetPackageSourcesResponseMessage } from '../apps/packageBrowser/types';
import { isGetPackageSourcesRequestMessage } from '../apps/packageBrowser/types';
import { formatSourcesForUI, getEnabledSources, getNuGetApiOptions } from '../../services/configurationService';

/**
 * Handler for 'getPackageSourcesRequest' message from webview.
 */
export class GetPackageSourcesHandler implements IMessageHandler<GetPackageSourcesRequestMessage, void> {
  readonly messageType = 'getPackageSourcesRequest';

  constructor(private readonly runtime: IVsCodeRuntime) {}

  async handle(request: unknown, context: MessageContext): Promise<void> {
    if (!isGetPackageSourcesRequestMessage(request)) {
      context.logger.warn('Invalid getPackageSourcesRequest message', request);
      return;
    }

    const { requestId } = request.payload;

    context.logger.debug('Get package sources request received', { requestId });

    try {
      // Get NuGet configuration with all sources
      const config = getNuGetApiOptions(this.runtime);

      // Get enabled sources and format for UI
      const enabledSources = getEnabledSources(config.sources);
      const sources = formatSourcesForUI(enabledSources);

      const response: GetPackageSourcesResponseMessage = {
        type: 'notification',
        name: 'packageSourcesResponse',
        args: {
          requestId,
          sources,
        },
      };

      await context.webview.postMessage(response);

      context.logger.info('Package sources sent to webview', {
        sourceCount: sources.length,
        requestId,
      });
    } catch (error) {
      context.logger.error('Failed to get package sources', error instanceof Error ? error : new Error(String(error)));

      // Send empty sources on error
      const response: GetPackageSourcesResponseMessage = {
        type: 'notification',
        name: 'packageSourcesResponse',
        args: {
          requestId,
          sources: [],
        },
      };

      await context.webview.postMessage(response);
    }
  }
}
