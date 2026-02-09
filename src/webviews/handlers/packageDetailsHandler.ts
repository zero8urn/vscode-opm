/**
 * PackageDetailsHandler — Handles package metadata detail requests.
 */

import type { IMessageHandler, MessageContext } from '../mediator/webviewMessageMediator';
import type { PackageDetailsRequestMessage, PackageDetailsResponseMessage } from '../apps/packageBrowser/types';
import { isPackageDetailsRequestMessage } from '../apps/packageBrowser/types';
import type { IPackageDetailsService } from '../services/packageDetailsService';

export class PackageDetailsHandler implements IMessageHandler<PackageDetailsRequestMessage, void> {
  readonly messageType = 'packageDetailsRequest';

  async handle(request: unknown, context: MessageContext): Promise<void> {
    if (!isPackageDetailsRequestMessage(request)) {
      context.logger.warn('Invalid packageDetailsRequest message', request);
      return;
    }

    const detailsService = context.services.detailsService as IPackageDetailsService | undefined;
    if (!detailsService) {
      context.logger.error('PackageDetailsService not available');
      return;
    }

    const { packageId, version, requestId, totalDownloads, iconUrl, sourceId } = request.payload;

    // Normalize sourceId: treat 'all' as undefined
    const normalizedSourceId = sourceId === 'all' ? undefined : sourceId;

    context.logger.info('Package details request received', {
      packageId,
      version,
      requestId,
      totalDownloads,
      iconUrl,
      sourceId,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const result = await detailsService.getPackageDetails(packageId, version, controller.signal, normalizedSourceId);

      clearTimeout(timeoutId);

      // Override totalDownloads and iconUrl with values from search results if provided
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

      await context.webview.postMessage(response);

      if (result.data) {
        context.logger.debug('Package details fetched successfully', {
          packageId,
          version: result.data.version,
          versionCount: result.data.versions.length,
        });
      } else if (result.error) {
        context.logger.warn('Package details fetch failed', {
          packageId,
          error: result.error.code,
        });
      }
    } catch (error) {
      clearTimeout(timeoutId);

      context.logger.error(
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

      await context.webview.postMessage(response);
    }
  }
}
