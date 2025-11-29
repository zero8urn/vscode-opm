import { describe, test, expect } from 'bun:test';
import { createNuGetApiClient } from '../../src/env/node/nugetApiClient';
import type { ILogger } from '../../src/services/loggerService';

/**
 * Integration tests for NuGetApiClient against real NuGet.org API.
 *
 * These tests make real network requests and should be:
 * - Run conditionally (skip in CI if needed)
 * - Used to validate actual API behavior
 * - Kept minimal to avoid rate limiting
 */

// Mock logger for tests
const createMockLogger = (): ILogger => ({
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  show: () => {},
  isDebugEnabled: () => false,
  dispose: () => {},
});

describe('NuGetApiClient Integration Tests', () => {
  const logger = createMockLogger();
  const client = createNuGetApiClient(logger);

  test('should search for popular package (Newtonsoft.Json)', async () => {
    const result = await client.searchPackages({ query: 'Newtonsoft.Json' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result.length).toBeGreaterThan(0);
      const newtonsoftPkg = result.result.find(pkg => pkg.id === 'Newtonsoft.Json');
      expect(newtonsoftPkg).toBeDefined();
      expect(newtonsoftPkg!.verified).toBe(true);
      expect(newtonsoftPkg!.downloadCount).toBeGreaterThan(1000000);
    }
  });

  test('should search with prerelease filter', async () => {
    const result = await client.searchPackages({ query: 'Serilog', prerelease: true });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result.length).toBeGreaterThan(0);
    }
  });

  test('should support pagination (skip and take)', async () => {
    const result = await client.searchPackages({ query: 'Microsoft', skip: 5, take: 3 });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result.length).toBeLessThanOrEqual(3);
    }
  });

  test('should browse packages without query', async () => {
    const result = await client.searchPackages({ take: 5 });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result.length).toBeLessThanOrEqual(5);
      expect(result.result.length).toBeGreaterThan(0);
    }
  });

  test('should return empty results for non-existent package', async () => {
    const result = await client.searchPackages({
      query: 'ThisPackageDefinitelyDoesNotExist12345XYZ',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result.length).toBe(0);
    }
  });

  test('should support request cancellation', async () => {
    const controller = new AbortController();
    const resultPromise = client.searchPackages({ query: 'test' }, controller.signal);
    controller.abort();

    const result = await resultPromise;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('Network');
      expect(result.error.message).toContain('cancelled');
    }
  });

  test('should parse package metadata correctly', async () => {
    const result = await client.searchPackages({ query: 'Newtonsoft.Json', take: 1 });

    expect(result.success).toBe(true);
    if (result.success && result.result.length > 0) {
      const pkg = result.result[0]!;

      // Verify all required fields are present and valid
      expect(pkg.id).toBeTruthy();
      expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/); // Semantic version
      expect(typeof pkg.description).toBe('string');
      expect(Array.isArray(pkg.authors)).toBe(true);
      expect(typeof pkg.downloadCount).toBe('number');
      expect(typeof pkg.iconUrl).toBe('string');
      expect(typeof pkg.verified).toBe('boolean');
      expect(Array.isArray(pkg.tags)).toBe(true);
    }
  });
});
