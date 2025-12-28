import { describe, test, expect } from 'bun:test';
import type { PackageSearchResult } from '../../types';

/**
 * Unit tests for package search result types and interfaces.
 * Tests the shape and validation of PackageSearchResult objects.
 */
describe('PackageSearchResult', () => {
  test('should have correct shape for valid package', () => {
    const validPackage: PackageSearchResult = {
      id: 'Newtonsoft.Json',
      version: '13.0.3',
      description: 'Popular high-performance JSON framework',
      authors: ['James Newton-King'],
      totalDownloads: 2500000000,
      iconUrl: 'https://example.com/icon.png',
      tags: ['json', 'serialization'],
      verified: true,
    };

    expect(validPackage.id).toBe('Newtonsoft.Json');
    expect(validPackage.authors).toEqual(['James Newton-King']);
    expect(validPackage.totalDownloads).toBeGreaterThan(0);
  });

  test('should allow null description and iconUrl', () => {
    const packageWithNulls: PackageSearchResult = {
      id: 'Test.Package',
      version: '1.0.0',
      description: null,
      authors: ['Test Author'],
      totalDownloads: 100,
      iconUrl: null,
    };

    expect(packageWithNulls.description).toBeNull();
    expect(packageWithNulls.iconUrl).toBeNull();
  });

  test('should allow empty authors array', () => {
    const packageNoAuthors: PackageSearchResult = {
      id: 'Test.Package',
      version: '1.0.0',
      description: 'Test package',
      authors: [],
      totalDownloads: 0,
      iconUrl: null,
    };

    expect(packageNoAuthors.authors).toEqual([]);
  });

  test('should allow optional tags and verified fields', () => {
    const minimalPackage: PackageSearchResult = {
      id: 'Minimal.Package',
      version: '1.0.0',
      description: null,
      authors: [],
      totalDownloads: 0,
      iconUrl: null,
    };

    expect(minimalPackage.tags).toBeUndefined();
    expect(minimalPackage.verified).toBeUndefined();
  });
});
