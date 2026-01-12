/**
 * Unit tests for Package Browser webview IPC integration - Install Package flow
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import type { InstallPackageRequestMessage, InstallPackageResponseMessage } from '../apps/packageBrowser/types';
import { isInstallPackageRequestMessage, isInstallPackageResponseMessage } from '../apps/packageBrowser/types';

describe('Install Package IPC Integration', () => {
  describe('Type Guards', () => {
    test('isInstallPackageRequestMessage validates correct message', () => {
      const message: InstallPackageRequestMessage = {
        type: 'installPackageRequest',
        payload: {
          packageId: 'Newtonsoft.Json',
          version: '13.0.3',
          projectPaths: ['/workspace/App.csproj'],
          requestId: 'test-123',
        },
      };

      expect(isInstallPackageRequestMessage(message)).toBe(true);
    });

    test('isInstallPackageRequestMessage rejects invalid message', () => {
      const invalidMessage = {
        type: 'wrongType',
        payload: {},
      };

      expect(isInstallPackageRequestMessage(invalidMessage)).toBe(false);
    });

    test('isInstallPackageRequestMessage rejects missing payload', () => {
      const invalidMessage = {
        type: 'installPackageRequest',
      };

      expect(isInstallPackageRequestMessage(invalidMessage)).toBe(false);
    });

    test('isInstallPackageResponseMessage validates correct response', () => {
      const response: InstallPackageResponseMessage = {
        type: 'notification',
        name: 'installPackageResponse',
        args: {
          packageId: 'Newtonsoft.Json',
          version: '13.0.3',
          success: true,
          results: [
            {
              projectPath: '/workspace/App.csproj',
              success: true,
            },
          ],
          requestId: 'test-123',
        },
      };

      expect(isInstallPackageResponseMessage(response)).toBe(true);
    });

    test('isInstallPackageResponseMessage rejects invalid response', () => {
      const invalidResponse = {
        type: 'notification',
        name: 'wrongName',
        args: {},
      };

      expect(isInstallPackageResponseMessage(invalidResponse)).toBe(false);
    });
  });

  describe('Message Structure', () => {
    test('InstallPackageRequestMessage has required fields', () => {
      const message: InstallPackageRequestMessage = {
        type: 'installPackageRequest',
        payload: {
          packageId: 'Serilog',
          version: '3.1.1',
          projectPaths: ['/workspace/App1.csproj', '/workspace/App2.csproj'],
          requestId: 'multi-project-123',
        },
      };

      expect(message.type).toBe('installPackageRequest');
      expect(message.payload.packageId).toBe('Serilog');
      expect(message.payload.version).toBe('3.1.1');
      expect(message.payload.projectPaths).toHaveLength(2);
      expect(message.payload.requestId).toBe('multi-project-123');
    });

    test('InstallPackageResponseMessage includes per-project results', () => {
      const response: InstallPackageResponseMessage = {
        type: 'notification',
        name: 'installPackageResponse',
        args: {
          packageId: 'Serilog',
          version: '3.1.1',
          success: false, // Partial failure
          results: [
            {
              projectPath: '/workspace/App1.csproj',
              success: true,
            },
            {
              projectPath: '/workspace/App2.csproj',
              success: false,
              error: 'Package not found',
            },
          ],
          requestId: 'multi-project-123',
        },
      };

      expect(response.args.success).toBe(false);
      expect(response.args.results).toHaveLength(2);
      expect(response.args.results[0]?.success).toBe(true);
      expect(response.args.results[1]?.success).toBe(false);
      expect(response.args.results[1]?.error).toBe('Package not found');
    });

    test('InstallPackageResponseMessage includes error for total failure', () => {
      const response: InstallPackageResponseMessage = {
        type: 'notification',
        name: 'installPackageResponse',
        args: {
          packageId: 'NonExistent.Package',
          version: '1.0.0',
          success: false,
          results: [],
          requestId: 'error-123',
          error: {
            message: 'Command execution failed',
            code: 'CommandExecutionError',
          },
        },
      };

      expect(response.args.success).toBe(false);
      expect(response.args.results).toHaveLength(0);
      expect(response.args.error).toBeDefined();
      expect(response.args.error?.code).toBe('CommandExecutionError');
    });
  });
});
