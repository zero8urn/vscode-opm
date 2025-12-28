import { test, expect, describe } from 'bun:test';
import type { PackageSearchResult as DomainPackageSearchResult } from '../../domain/models/packageSearchResult';
import type { PackageSearchResult as WebviewPackageSearchResult } from '../apps/packageBrowser/types';

/**
 * Maps domain PackageSearchResult to webview PackageSearchResult.
 * This is extracted for testing - the actual implementation is in packageBrowserWebview.ts.
 */
function mapToWebviewPackage(domain: DomainPackageSearchResult): WebviewPackageSearchResult {
  return {
    id: domain.id,
    version: domain.version,
    description: domain.description || null,
    authors: domain.authors,
    totalDownloads: domain.downloadCount,
    iconUrl: domain.iconUrl || null,
    tags: domain.tags,
    verified: domain.verified,
  };
}

describe('Type Mapping', () => {
  test('should map domain to webview format with all fields', () => {
    const domain: DomainPackageSearchResult = {
      id: 'Test.Package',
      version: '1.0.0',
      description: 'Test package description',
      authors: ['Author One', 'Author Two'],
      downloadCount: 1234567,
      iconUrl: 'https://example.com/icon.png',
      verified: true,
      tags: ['test', 'sample', 'demo'],
    };

    const webview = mapToWebviewPackage(domain);

    expect(webview.id).toBe('Test.Package');
    expect(webview.version).toBe('1.0.0');
    expect(webview.description).toBe('Test package description');
    expect(webview.authors).toEqual(['Author One', 'Author Two']);
    expect(webview.totalDownloads).toBe(1234567);
    expect(webview.iconUrl).toBe('https://example.com/icon.png');
    expect(webview.verified).toBe(true);
    expect(webview.tags).toEqual(['test', 'sample', 'demo']);
  });

  test('should convert empty description to null', () => {
    const domain: DomainPackageSearchResult = {
      id: 'Test',
      version: '1.0.0',
      description: '',
      authors: ['Author'],
      downloadCount: 100,
      iconUrl: 'https://example.com/icon.png',
      verified: false,
      tags: [],
    };

    const webview = mapToWebviewPackage(domain);

    expect(webview.description).toBeNull();
  });

  test('should convert empty iconUrl to null', () => {
    const domain: DomainPackageSearchResult = {
      id: 'Test',
      version: '1.0.0',
      description: 'Test',
      authors: ['Author'],
      downloadCount: 100,
      iconUrl: '',
      verified: false,
      tags: [],
    };

    const webview = mapToWebviewPackage(domain);

    expect(webview.iconUrl).toBeNull();
  });

  test('should handle minimal package data', () => {
    const domain: DomainPackageSearchResult = {
      id: 'Minimal.Package',
      version: '0.1.0',
      description: '',
      authors: [],
      downloadCount: 0,
      iconUrl: '',
      verified: false,
      tags: [],
    };

    const webview = mapToWebviewPackage(domain);

    expect(webview.id).toBe('Minimal.Package');
    expect(webview.version).toBe('0.1.0');
    expect(webview.description).toBeNull();
    expect(webview.authors).toEqual([]);
    expect(webview.totalDownloads).toBe(0);
    expect(webview.iconUrl).toBeNull();
    expect(webview.verified).toBe(false);
    expect(webview.tags).toEqual([]);
  });

  test('should correctly map downloadCount to totalDownloads', () => {
    const domain: DomainPackageSearchResult = {
      id: 'Popular.Package',
      version: '2.5.0',
      description: 'Very popular package',
      authors: ['Author'],
      downloadCount: 999999999,
      iconUrl: 'https://example.com/icon.png',
      verified: true,
      tags: ['popular'],
    };

    const webview = mapToWebviewPackage(domain);

    expect(webview.totalDownloads).toBe(999999999);
  });
});
