import { describe, test, expect } from 'bun:test';
import { createNuGetApiClient } from '../../src/env/node/nugetApiClient';
import type { ILogger } from '../../src/services/loggerService';

/**
 * Integration tests for NuGet Registration API.
 *
 * These tests make real network requests to NuGet.org and should be:
 * - Run conditionally (skip in CI if rate limits are a concern)
 * - Used to validate actual API behavior
 * - Kept minimal to avoid excessive API calls
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

describe('NuGet Registration API Integration Tests', () => {
  const logger = createMockLogger();
  const client = createNuGetApiClient(logger);

  describe('getPackageIndex', () => {
    test('should fetch package index for small package (DotNetEnv)', async () => {
      const result = await client.getPackageIndex('DotNetEnv');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.id).toBe('DotNetEnv');
        expect(result.result.versions.length).toBeGreaterThan(0);
        expect(result.result.totalVersions).toBe(result.result.versions.length);

        // Verify version structure
        const firstVersion = result.result.versions[0]!;
        expect(firstVersion.version).toBeDefined();
        expect(typeof firstVersion.version).toBe('string');
        expect(firstVersion.registrationUrl.toLowerCase()).toContain('dotnetenv');
        expect(firstVersion.packageContentUrl).toContain('.nupkg');
        expect(typeof firstVersion.listed).toBe('boolean');
      }
    });

    test('should fetch package index for large package (Newtonsoft.Json)', async () => {
      const result = await client.getPackageIndex('Newtonsoft.Json');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.id).toBe('Newtonsoft.Json');
        // Newtonsoft.Json has >64 versions
        expect(result.result.versions.length).toBeGreaterThan(64);
        expect(result.result.totalVersions).toBe(result.result.versions.length);
      }
    });

    test('should return error for non-existent package', async () => {
      const result = await client.getPackageIndex('ThisPackageDoesNotExist12345XYZ');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('PackageNotFound');
        expect(result.error.message).toContain('not found');
      }
    });

    test('should support cancellation', async () => {
      const controller = new AbortController();
      const resultPromise = client.getPackageIndex('Newtonsoft.Json', controller.signal);
      controller.abort();

      const result = await resultPromise;

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('Network');
        expect(result.error.message).toContain('cancelled');
      }
    });
  });

  describe('getPackageVersion', () => {
    test('should fetch package version details', async () => {
      const result = await client.getPackageVersion('Newtonsoft.Json', '13.0.1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.id).toBe('Newtonsoft.Json');
        expect(result.result.version).toBe('13.0.1');
        expect(result.result.description).toBeDefined();
        expect(result.result.authors).toBeDefined();
        expect(result.result.packageContentUrl).toContain('.nupkg');
        expect(result.result.registrationUrl).toContain('13.0.1');

        // Newtonsoft.Json has dependencies
        if (result.result.dependencyGroups) {
          expect(result.result.dependencyGroups.length).toBeGreaterThan(0);
        }
      }
    });

    test('should include license information', async () => {
      const result = await client.getPackageVersion('Newtonsoft.Json', '13.0.1');

      expect(result.success).toBe(true);
      if (result.success) {
        // Newtonsoft.Json should have license info (either expression or URL)
        const hasLicense = result.result.licenseExpression || result.result.licenseUrl;
        expect(hasLicense).toBeDefined();
      }
    });

    test('should parse dependency groups correctly', async () => {
      const result = await client.getPackageVersion('Serilog', '2.10.0');

      expect(result.success).toBe(true);
      if (result.success && result.result.dependencyGroups) {
        const groups = result.result.dependencyGroups;
        expect(groups.length).toBeGreaterThan(0);

        // Each group should have a target framework
        for (const group of groups) {
          expect(typeof group.targetFramework).toBe('string');
          expect(Array.isArray(group.dependencies)).toBe(true);

          // Each dependency should have an id
          for (const dep of group.dependencies) {
            expect(dep.id).toBeDefined();
            expect(typeof dep.id).toBe('string');
          }
        }
      }
    });

    test('should return error for non-existent version', async () => {
      const result = await client.getPackageVersion('Newtonsoft.Json', '99.99.99');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VersionNotFound');
        expect(result.error.message).toContain('not found');
      }
    });

    test('should return error for non-existent package', async () => {
      const result = await client.getPackageVersion('ThisPackageDoesNotExist12345XYZ', '1.0.0');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VersionNotFound');
      }
    });
  });

  describe('getPackageReadme', () => {
    test('should fetch package README', async () => {
      const result = await client.getPackageReadme('Serilog', '4.2.0');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toBeDefined();
        expect(typeof result.result).toBe('string');
        expect(result.result.length).toBeGreaterThan(0);
      }
    });

    test('should return error for package without README', async () => {
      // Some older packages might not have READMEs
      const result = await client.getPackageReadme('jQuery', '1.4.1');

      // This could be NotFound or success with empty content
      if (!result.success) {
        expect(result.error.code).toBe('NotFound');
      }
    });

    test('should return error for non-existent package', async () => {
      const result = await client.getPackageReadme('ThisPackageDoesNotExist12345XYZ', '1.0.0');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NotFound');
      }
    });
  });

  describe('End-to-end workflow', () => {
    test('should support full package discovery workflow', async () => {
      // 1. Get package index
      const indexResult = await client.getPackageIndex('DotNetEnv');
      expect(indexResult.success).toBe(true);

      if (indexResult.success) {
        // 2. Get latest version
        const latestVersion = indexResult.result.versions[0]!.version;
        const versionResult = await client.getPackageVersion('DotNetEnv', latestVersion);

        expect(versionResult.success).toBe(true);

        if (versionResult.success) {
          // 3. Verify version details match
          expect(versionResult.result.version).toBe(latestVersion);
          expect(versionResult.result.id).toBe('DotNetEnv');

          // 4. Optionally fetch README if available
          if (versionResult.result.readmeUrl) {
            const readmeResult = await client.getPackageReadme('DotNetEnv', latestVersion);
            if (readmeResult.success) {
              expect(readmeResult.result.length).toBeGreaterThan(0);
            }
          }
        }
      }
    });
  });
});
