/**
 * Shared utilities for webview message handlers.
 * Common mapping and helper functions to avoid duplication across handlers.
 */

import type { PackageSearchResult } from '../apps/packageBrowser/types';
import type { PackageSearchResult as DomainPackageSearchResult } from '../../domain/models/packageSearchResult';

/**
 * Maps domain PackageSearchResult to webview PackageSearchResult.
 */
export function mapToWebviewPackage(domain: DomainPackageSearchResult): PackageSearchResult {
  return {
    id: domain.id,
    version: domain.version,
    description: domain.description || null,
    authors: domain.authors,
    totalDownloads: domain.downloadCount,
    iconUrl: domain.iconUrl || null,
    tags: domain.tags,
    verified: domain.verified,
    sourceId: (domain as any).sourceId ?? undefined,
    sourceName: (domain as any).sourceName ?? undefined,
  };
}
