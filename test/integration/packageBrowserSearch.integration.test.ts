import { describe, test, expect } from 'bun:test';
import { createNuGetApiClient } from '../../src/env/node/nugetApiClient';
import type { ILogger } from '../../src/services/loggerService';

/**
 * Mock logger for testing - captures logs without writing to output channel
 */
const createMockLogger = (): ILogger => ({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  show: () => {},
  isDebugEnabled: () => false,
  dispose: () => {},
});

/**
 * Integration test for Package Browser search with real NuGet API.
 *
 * These tests hit the actual NuGet.org API to validate end-to-end functionality.
 * Tests are marked as integration tests and may be slower than unit tests.
 */
describe('Package Browser Search Integration', () => {
  test(
    'should search real NuGet API for popular package',
    async () => {
      const logger = createMockLogger();
      const client = createNuGetApiClient(logger);

      const result = await client.searchPackages({
        query: 'Newtonsoft.Json',
        prerelease: false,
        skip: 0,
        take: 10,
      });

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.result.length).toBeGreaterThan(0);

        // Verify structure of first result
        const firstPackage = result.result[0];
        expect(firstPackage).toBeDefined();
        expect(firstPackage?.id).toBeTruthy();
        expect(firstPackage?.version).toBeTruthy();
        expect(typeof firstPackage?.downloadCount).toBe('number');
        expect(Array.isArray(firstPackage?.authors)).toBe(true);
      }
    },
    { timeout: 10000 },
  ); // 10s timeout for network request

  test(
    'should handle empty search results gracefully',
    async () => {
      const logger = createMockLogger();
      const client = createNuGetApiClient(logger);

      const result = await client.searchPackages({
        query: 'definitely-nonexistent-package-xyz-12345',
        prerelease: false,
        skip: 0,
        take: 10,
      });

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.result).toEqual([]);
      }
    },
    { timeout: 10000 },
  );

  test(
    'should search with prerelease flag enabled',
    async () => {
      const logger = createMockLogger();
      const client = createNuGetApiClient(logger);

      const result = await client.searchPackages({
        query: 'Microsoft.Extensions.Logging',
        prerelease: true,
        skip: 0,
        take: 5,
      });

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.result.length).toBeGreaterThan(0);
      }
    },
    { timeout: 10000 },
  );

  test(
    'should respect pagination parameters',
    async () => {
      const logger = createMockLogger();
      const client = createNuGetApiClient(logger);

      const result = await client.searchPackages({
        query: 'logging',
        prerelease: false,
        skip: 10,
        take: 5,
      });

      expect(result.success).toBe(true);

      if (result.success) {
        // Should return 5 or fewer results (depending on total matches)
        expect(result.result.length).toBeLessThanOrEqual(5);
      }
    },
    { timeout: 10000 },
  );

  test(
    'should handle cancellation via AbortSignal',
    async () => {
      const logger = createMockLogger();
      const client = createNuGetApiClient(logger);

      const controller = new AbortController();

      // Abort immediately
      controller.abort();

      const result = await client.searchPackages(
        {
          query: 'test',
          prerelease: false,
          skip: 0,
          take: 10,
        },
        controller.signal,
      );

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.code).toBe('Network');
        expect(result.error.message).toContain('cancel');
      }
    },
    { timeout: 5000 },
  );
});

