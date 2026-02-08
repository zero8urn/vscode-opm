/**
 * Unit tests for PackageDetailsHandler
 *
 * Tests package metadata fetching and details response handling.
 */

import { describe, test, expect, mock } from 'bun:test';
import { PackageDetailsHandler } from '../packageDetailsHandler';
import type { MessageContext } from '../../mediator/webviewMessageMediator';
import type { PackageDetailsRequestMessage } from '../../apps/packageBrowser/types';

function createMockContext(detailsService?: any): MessageContext {
  return {
    webview: {
      postMessage: mock(async () => true),
    } as any,
    logger: {
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
      debug: mock(() => {}),
    } as any,
    services: {
      detailsService,
    },
  };
}

describe('PackageDetailsHandler', () => {
  test('has correct message type', () => {
    const handler = new PackageDetailsHandler();
    expect(handler.messageType).toBe('packageDetailsRequest');
  });

  describe('Message Validation', () => {
    test('warns and returns early for invalid message format', async () => {
      const handler = new PackageDetailsHandler();
      const context = createMockContext();

      await handler.handle({ type: 'wrong' }, context);

      expect(context.logger.warn).toHaveBeenCalledWith('Invalid packageDetailsRequest message', { type: 'wrong' });
      expect(context.webview.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('Service Availability', () => {
    test('errors when detailsService is not available', async () => {
      const handler = new PackageDetailsHandler();
      const context = createMockContext(undefined);

      const message: PackageDetailsRequestMessage = {
        type: 'packageDetailsRequest',
        payload: {
          packageId: 'Newtonsoft.Json',
          requestId: 'req-1',
        },
      };

      await handler.handle(message, context);

      expect(context.logger.error).toHaveBeenCalledWith('PackageDetailsService not available');
      expect(context.webview.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('Successful Details Fetch', () => {
    test('logs info with package details', async () => {
      const detailsService = {
        getPackageDetails: mock(async () => ({
          data: {
            id: 'Newtonsoft.Json',
            version: '13.0.3',
            versions: ['13.0.3', '13.0.2'],
          },
          error: undefined,
        })),
      };

      const handler = new PackageDetailsHandler();
      const context = createMockContext(detailsService);

      const message: PackageDetailsRequestMessage = {
        type: 'packageDetailsRequest',
        payload: {
          packageId: 'Newtonsoft.Json',
          requestId: 'req-123',
        },
      };

      await handler.handle(message, context);

      expect(context.logger.info).toHaveBeenCalledWith('Package details request received', {
        packageId: 'Newtonsoft.Json',
        requestId: 'req-123',
      });
    });

    test('sends success response with package details', async () => {
      const mockDetails = {
        id: 'Package.Test',
        version: '1.0.0',
        versions: [{ version: '1.0.0' }, { version: '0.9.0' }],
        description: 'Test package',
        deprecated: false,
        vulnerabilities: [],
        dependencies: [],
      };

      const detailsService = {
        getPackageDetails: mock(async () => ({
          data: mockDetails,
          error: undefined,
        })),
      };

      const handler = new PackageDetailsHandler();
      const context = createMockContext(detailsService);

      const message: PackageDetailsRequestMessage = {
        type: 'packageDetailsRequest',
        payload: {
          packageId: 'Package.Test',
          requestId: 'req-details',
        },
      };

      await handler.handle(message, context);

      expect(context.webview.postMessage).toHaveBeenCalledTimes(1);
      const response = (context.webview.postMessage as any).mock.calls[0]?.[0];
      expect(response.type).toBe('notification');
      expect(response.name).toBe('packageDetailsResponse');
      expect(response.args.requestId).toBe('req-details');
      expect(response.args.data).toEqual(mockDetails);
    });
  });

  describe('Error Handling', () => {
    test('sends error response when service returns error', async () => {
      const detailsService = {
        getPackageDetails: mock(async () => ({
          error: {
            code: 'NotFound',
            message: 'Package not found',
          },
          packageDetails: null,
        })),
      };

      const handler = new PackageDetailsHandler();
      const context = createMockContext(detailsService);

      const message: PackageDetailsRequestMessage = {
        type: 'packageDetailsRequest',
        payload: {
          packageId: 'NonExistent.Package',
          requestId: 'req-error',
        },
      };

      await handler.handle(message, context);

      expect(context.webview.postMessage).toHaveBeenCalledTimes(1);
      const response = (context.webview.postMessage as any).mock.calls[0]?.[0];
      expect(response.args.error).toBeDefined();
      expect(response.args.requestId).toBe('req-error');
    });

    test('logs error on unexpected exception', async () => {
      const error = new Error('Service failure');
      const detailsService = {
        getPackageDetails: mock(async () => {
          throw error;
        }),
      };

      const handler = new PackageDetailsHandler();
      const context = createMockContext(detailsService);

      const message: PackageDetailsRequestMessage = {
        type: 'packageDetailsRequest',
        payload: {
          packageId: 'Test',
          requestId: 'req-1',
        },
      };

      await handler.handle(message, context);

      expect(context.logger.error).toHaveBeenCalledWith('Unexpected error in package details handler', error);
    });
  });
});
