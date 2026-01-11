/**
 * Unit tests for PackageCliService.
 *
 * Tests error code parsing and result handling logic.
 * Full CLI execution is tested in integration tests.
 */

import { describe, it, expect } from 'bun:test';
import { PackageOperationErrorCode } from '../types/packageOperation';

// Import the service implementation to test private methods via reflection
import { createPackageCliService } from '../packageCliService';

describe('PackageCliService - Error Parsing', () => {
  // Test the error parsing logic by creating a service instance and accessing the private method
  // via reflection (TypeScript private is only compile-time, not runtime)
  const mockExecutor: any = {
    execute: async () => ({ exitCode: 0, stdout: '', stderr: '', timedOut: false }),
    isDotnetAvailable: async () => true,
    getDotnetVersion: async () => '8.0.100',
  };

  const mockLogger: any = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    show: () => {},
    isDebugEnabled: () => false,
    dispose: () => {},
  };

  const service: any = createPackageCliService(mockExecutor, mockLogger);

  describe('parsePackageError', () => {
    it('should parse NU1102 error code (package not found)', () => {
      const stderr = 'error NU1102: Unable to find package Newtonsoft.Json with version (>= 99.99.99)';
      const result = service.parsePackageError(stderr, '');

      expect(result.code).toBe(PackageOperationErrorCode.PackageVersionNotFound);
      expect(result.nugetErrorCode).toBe('NU1102');
      expect(result.message).toContain('not found');
    });

    it('should parse NU1403 error code (license acceptance required)', () => {
      const stderr = "error NU1403: Package 'SomePackage' requires license acceptance";
      const result = service.parsePackageError(stderr, '');

      expect(result.code).toBe(PackageOperationErrorCode.LicenseAcceptanceRequired);
      expect(result.nugetErrorCode).toBe('NU1403');
      expect(result.message).toContain('license');
    });

    it('should parse NU1202 error code (framework incompatible)', () => {
      const stderr = 'error NU1202: Package SomePackage is not compatible with net6.0';
      const result = service.parsePackageError(stderr, '');

      expect(result.code).toBe(PackageOperationErrorCode.FrameworkIncompatible);
      expect(result.nugetErrorCode).toBe('NU1202');
      expect(result.message).toContain('not compatible');
    });

    it('should parse NU1108 error code (circular dependency)', () => {
      const stderr = 'error NU1108: Circular dependency detected';
      const result = service.parsePackageError(stderr, '');

      expect(result.code).toBe(PackageOperationErrorCode.CircularDependency);
      expect(result.nugetErrorCode).toBe('NU1108');
      expect(result.message).toContain('Circular dependency');
    });

    it('should detect network errors from stderr', () => {
      const stderr = 'Unable to load the service index for source https://api.nuget.org/v3/index.json';
      const result = service.parsePackageError(stderr, '');

      expect(result.code).toBe(PackageOperationErrorCode.NetworkError);
      expect(result.message).toContain('Network error');
    });

    it('should handle connection timeout errors', () => {
      const stderr = 'Connection timeout while downloading package';
      const result = service.parsePackageError(stderr, '');

      expect(result.code).toBe(PackageOperationErrorCode.NetworkError);
    });

    it('should fallback to CLI_ERROR for unknown errors', () => {
      const stderr = 'Something unexpected happened';
      const result = service.parsePackageError(stderr, '');

      expect(result.code).toBe(PackageOperationErrorCode.CliError);
      expect(result.message).toBe('Something unexpected happened');
    });

    it('should extract NuGet error code even without recognized pattern', () => {
      const stderr = 'error NU9999: Unknown error type';
      const result = service.parsePackageError(stderr, '');

      expect(result.nugetErrorCode).toBe('NU9999');
      expect(result.code).toBe(PackageOperationErrorCode.CliError);
    });

    it('should check both stdout and stderr for error patterns', () => {
      const stderr = '';
      const stdout = 'error NU1102: Unable to find package';
      const result = service.parsePackageError(stderr, stdout);

      expect(result.code).toBe(PackageOperationErrorCode.PackageVersionNotFound);
    });
  });
});
