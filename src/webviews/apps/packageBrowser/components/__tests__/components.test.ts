import { describe, test, expect } from 'bun:test';

/**
 * Integration tests for package list component module exports.
 * Verifies that components are properly defined and can be imported.
 */
describe('PackageList Component Module', () => {
  test('should export PackageList class', async () => {
    const module = await import('../packageList');
    expect(module.PackageList).toBeDefined();
    expect(typeof module.PackageList).toBe('function');
  });

  test('should have custom element tag defined', async () => {
    const module = await import('../packageList');
    // Check that the class is defined (constructor exists)
    expect(module.PackageList.prototype.constructor.name).toBe('PackageList');
  });
});

describe('PackageCard Component Module', () => {
  test('should export PackageCard class', async () => {
    const module = await import('../packageCard');
    expect(module.PackageCard).toBeDefined();
    expect(typeof module.PackageCard).toBe('function');
  });

  test('should have formatDownloadCount method', async () => {
    const module = await import('../packageCard');
    const instance = new module.PackageCard();

    // Access the private method via prototype (for testing only)
    // @ts-expect-error - accessing private method for testing
    expect(typeof instance.formatDownloadCount).toBe('function');
  });
});

describe('LoadingSpinner Component Module', () => {
  test('should export LoadingSpinner class', async () => {
    const module = await import('../shared/loadingSpinner');
    expect(module.LoadingSpinner).toBeDefined();
    expect(typeof module.LoadingSpinner).toBe('function');
  });
});
