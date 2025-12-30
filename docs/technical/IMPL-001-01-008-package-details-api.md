# IMPL-001-01-008-package-details-api

**Story**: [STORY-001-01-008-package-details-api](../stories/STORY-001-01-008-package-details-api.md)  
**Feature**: [FEAT-001-01-browse-search](../features/FEAT-001-01-browse-search.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Not Started  
**Created**: 2025-12-30  
**Last Updated**: 2025-12-30

## Overview

This implementation plan details the integration with the NuGet v3 Registration API to fetch comprehensive package metadata including all versions, dependencies, deprecation warnings, vulnerability information, and README content. The Registration API provides a three-tier hierarchy: Registration Index (all versions), Registration Page (version subsets for large packages), and Registration Leaf (individual version details).

The implementation extends the existing `NuGetApiClient` with registration endpoints, introduces new domain models for package metadata structures, and creates specialized parsers to transform complex nested API responses into typed domain models. The client handles both small packages (≤64 versions with inlined data) and large packages (>64 versions requiring separate page fetches) transparently.

Key technical challenges include:
- Service discovery to find the Registration Base URL from the service index
- Intelligent caching strategy (10 min TTL for index, 1 hour for immutable version data)
- Parsing complex nested structures (dependency groups, deprecation metadata, vulnerabilities)
- Handling optional v3.4.0+ (deprecation) and v3.6.0+ (SemVer 2.0 + vulnerabilities) features
- Sanitizing README content before rendering to prevent XSS attacks
- Graceful fallback for third-party sources with incomplete API implementations

## Architecture Decisions

### 1. Extend NuGetApiClient vs. Separate Client

**Decision**: Extend the existing `NuGetApiClient` class with registration methods rather than creating a separate client.

**Rationale**:
- Registration and Search APIs share the same service discovery mechanism (service index at `/v3/index.json`)
- Both need similar HTTP handling (timeouts, retries, AbortController)
- Single client simplifies dependency injection in command handlers
- Registration endpoints can reuse search client's base URL and authentication state

**Implementation**:
```typescript
// src/env/node/nugetApiClient.ts (existing file)
export class NuGetApiClient {
  private serviceIndex?: ServiceIndex;
  
  // Existing search methods
  async searchPackages(options: SearchOptions, signal?: AbortSignal): Promise<NuGetResult<PackageSearchResult[]>> { /* ... */ }
  
  // New registration methods
  async getPackageIndex(packageId: string, signal?: AbortSignal): Promise<NuGetResult<PackageIndex>> { /* ... */ }
  async getPackageVersion(packageId: string, version: string, signal?: AbortSignal): Promise<NuGetResult<PackageVersionDetails>> { /* ... */ }
  async getPackageReadme(packageId: string, version: string, signal?: AbortSignal): Promise<NuGetResult<string>> { /* ... */ }
  
  private async ensureServiceIndex(signal?: AbortSignal): Promise<void> { /* ... */ }
  private getRegistrationBaseUrl(): string { /* ... */ }
}
```

### 2. API Version Selection Strategy

**Decision**: Prefer `RegistrationsBaseUrl/3.6.0` with graceful fallback to older versions.

**Rationale**:
- v3.6.0 provides SemVer 2.0.0 support + vulnerability information
- v3.4.0 provides deprecation metadata (critical for package quality)
- Base `RegistrationsBaseUrl` provides basic functionality for all sources
- Third-party sources (BaGet, Artifactory) may only support base version

**Fallback Chain**:
1. `RegistrationsBaseUrl/3.6.0` (preferred)
2. `RegistrationsBaseUrl/Versioned` (unversioned alias for latest)
3. `RegistrationsBaseUrl/3.4.0` (deprecation support)
4. `RegistrationsBaseUrl` (base SemVer 1.0.0)

**Implementation**:
```typescript
private getRegistrationBaseUrl(): string {
  const resources = this.serviceIndex!.resources;
  
  // Try in order of preference
  const preferredTypes = [
    'RegistrationsBaseUrl/3.6.0',
    'RegistrationsBaseUrl/Versioned',
    'RegistrationsBaseUrl/3.4.0',
    'RegistrationsBaseUrl'
  ];
  
  for (const type of preferredTypes) {
    const resource = resources.find(r => r['@type'] === type);
    if (resource) return resource['@id'];
  }
  
  throw new Error('No RegistrationsBaseUrl found in service index');
}
```

### 3. Page Inlining Detection

**Decision**: Use presence of `items` property to detect inlined vs. external pages.

**Rationale**:
- NuGet API inlines pages for packages ≤64 versions automatically
- `items` property present → data is inlined, no additional fetch needed
- `items` property absent → must fetch page URL from `@id` property
- Avoids hardcoding version count thresholds (API may change behavior)

**Implementation Pattern**:
```typescript
async getPackageIndex(packageId: string, signal?: AbortSignal): Promise<NuGetResult<PackageIndex>> {
  const response = await this.fetchRegistrationIndex(packageId, signal);
  
  // Parse pages from response
  const pages: PackagePage[] = await Promise.all(
    response.items.map(async (pageData) => {
      if (pageData.items) {
        // Inlined: use directly
        return this.parseInlinedPage(pageData);
      } else {
        // External: fetch separately
        return this.fetchPage(pageData['@id'], signal);
      }
    })
  );
  
  return { success: true, result: { pages, totalVersions: pages.flatMap(p => p.versions).length } };
}
```

### 4. Dependency Group Normalization

**Decision**: Normalize target framework monikers (TFMs) but preserve exact strings from API.

**Rationale**:
- TFMs like `.NETStandard2.0`, `net6.0`, `.NETFramework4.5` have semantic meaning
- Exact string preservation needed for compatibility checks during installation
- Empty string TFM means "any framework" - special handling required
- Parser should validate TFM format but not transform values

**Implementation**:
```typescript
interface DependencyGroup {
  targetFramework: string; // Exact TFM from API (e.g., ".NETStandard2.0" or "")
  dependencies: PackageDependency[];
}

function parseDependencyGroups(groups?: any[]): DependencyGroup[] {
  if (!groups) return [];
  
  return groups.map(group => ({
    targetFramework: group.targetFramework ?? '', // Empty = "any framework"
    dependencies: (group.dependencies ?? []).map(parseDependency)
  }));
}
```

### 5. README Size Limit

**Decision**: Enforce 500KB limit on README downloads with truncation and link to nuget.org.

**Rationale**:
- READMEs can be arbitrarily large (some packages embed full documentation)
- Large READMEs cause memory pressure in webviews
- Users can view full content on nuget.org if needed
- 500KB limit allows ~100 pages of documentation (reasonable for in-editor viewing)

**Implementation**:
```typescript
async getPackageReadme(packageId: string, version: string, signal?: AbortSignal): Promise<NuGetResult<string>> {
  const MAX_README_SIZE = 500 * 1024; // 500KB
  
  const response = await fetch(readmeUrl, { signal: this.combineSignals(signal, 60000) });
  
  // Check content length header
  const contentLength = parseInt(response.headers.get('content-length') ?? '0', 10);
  if (contentLength > MAX_README_SIZE) {
    return {
      success: true,
      result: `[README too large (${(contentLength / 1024).toFixed(0)}KB). View full content at https://www.nuget.org/packages/${packageId}/${version}]`
    };
  }
  
  // Stream with size checking
  let totalSize = 0;
  const chunks: Uint8Array[] = [];
  
  for await (const chunk of response.body!) {
    totalSize += chunk.length;
    if (totalSize > MAX_README_SIZE) {
      return {
        success: true,
        result: `[README truncated at 500KB. View full content at https://www.nuget.org/packages/${packageId}/${version}]\n\n` +
                Buffer.concat(chunks).toString('utf-8')
      };
    }
    chunks.push(chunk);
  }
  
  return { success: true, result: Buffer.concat(chunks).toString('utf-8') };
}
```

## Implementation Checklist

### 1. Create Domain Models

Create type definitions for all registration API structures with proper optionality and documentation.

**Files**:
- `src/domain/models/packageIndex.ts` - Registration index with pages
- `src/domain/models/packageVersionDetails.ts` - Individual version metadata
- `src/domain/models/packageDependency.ts` - Dependency structures
- `src/domain/models/packageDeprecation.ts` - Deprecation metadata
- `src/domain/models/packageVulnerability.ts` - Vulnerability information

<details>
<summary>Domain Model Definitions</summary>

```typescript
// src/domain/models/packageDependency.ts

export interface PackageDependency {
  /** Dependency package ID */
  id: string;
  
  /** Version range in NuGet format (e.g., "[1.0.0, )", "(, 2.0.0]") */
  range?: string;
}

export interface DependencyGroup {
  /** Target framework moniker (e.g., ".NETStandard2.0", "net6.0") or empty string for "any" */
  targetFramework: string;
  
  /** Dependencies for this framework (empty array if no dependencies) */
  dependencies: PackageDependency[];
}

// src/domain/models/packageDeprecation.ts

export type DeprecationReason = 'Legacy' | 'CriticalBugs' | 'Other';

export interface AlternatePackage {
  /** Recommended package ID */
  id: string;
  
  /** Recommended version range */
  range?: string;
}

export interface PackageDeprecation {
  /** Reasons for deprecation */
  reasons: DeprecationReason[];
  
  /** Human-readable deprecation message */
  message?: string;
  
  /** Recommended replacement package */
  alternatePackage?: AlternatePackage;
}

// src/domain/models/packageVulnerability.ts

export type VulnerabilitySeverity = 'Low' | 'Moderate' | 'High' | 'Critical';

export interface PackageVulnerability {
  /** URL to security advisory (e.g., GitHub Security Advisory) */
  advisoryUrl: string;
  
  /** Severity level */
  severity: VulnerabilitySeverity;
}

// src/domain/models/packageVersionDetails.ts

export interface PackageVersionDetails {
  /** Package ID (case-preserved from API) */
  id: string;
  
  /** SemVer 2.0.0 version string */
  version: string;
  
  /** Package description (may be empty) */
  description: string;
  
  /** Comma-separated author names */
  authors: string;
  
  /** Package icon URL */
  iconUrl?: string;
  
  /** Project homepage URL */
  projectUrl?: string;
  
  /** SPDX license expression (e.g., "MIT", "Apache-2.0") */
  licenseExpression?: string;
  
  /** License URL (deprecated, fallback for old packages) */
  licenseUrl?: string;
  
  /** Whether license acceptance required before install */
  requireLicenseAcceptance: boolean;
  
  /** Whether package is listed in search results */
  listed: boolean;
  
  /** ISO 8601 publish timestamp */
  published: string;
  
  /** Package tags (may be empty array) */
  tags: string[];
  
  /** Display title (fallback to id if omitted) */
  title?: string;
  
  /** Short package summary */
  summary?: string;
  
  /** README URL (if available) */
  readmeUrl?: string;
  
  /** Minimum NuGet client version required */
  minClientVersion?: string;
  
  /** Absolute URL to .nupkg download */
  packageContent: string;
  
  /** Dependency groups by target framework */
  dependencyGroups: DependencyGroup[];
  
  /** Deprecation metadata (v3.4.0+) */
  deprecation?: PackageDeprecation;
  
  /** Vulnerability information (v3.6.0+) */
  vulnerabilities?: PackageVulnerability[];
}

// src/domain/models/packageIndex.ts

export interface PackageVersionSummary {
  /** SemVer 2.0.0 version string */
  version: string;
  
  /** Total downloads for this version */
  downloads?: number;
  
  /** ISO 8601 publish timestamp */
  published: string;
  
  /** Whether version is listed */
  listed: boolean;
}

export interface PackageIndex {
  /** Package ID */
  id: string;
  
  /** All versions of the package (sorted newest first) */
  versions: PackageVersionSummary[];
  
  /** Total number of versions */
  totalVersions: number;
}
```

</details>

### 2. Extend NuGetApiClient with Registration Endpoints

Add registration API methods to the existing client with service discovery and intelligent page handling.

**File**: `src/env/node/nugetApiClient.ts`

<details>
<summary>Registration API Methods</summary>

```typescript
// New methods to add to existing NuGetApiClient class

/**
 * Fetches package metadata index with all versions.
 * Handles both inlined pages (≤64 versions) and external pages (>64 versions).
 */
async getPackageIndex(packageId: string, signal?: AbortSignal): Promise<NuGetResult<PackageIndex>> {
  try {
    await this.ensureServiceIndex(signal);
    const baseUrl = this.getRegistrationBaseUrl();
    const url = `${baseUrl}/${packageId.toLowerCase()}/index.json`;
    
    const response = await this.fetchJson<RegistrationIndexResponse>(url, 30000, signal);
    if (!response.success) return response;
    
    const versions = await this.extractVersionsFromIndex(response.result, signal);
    
    return {
      success: true,
      result: {
        id: packageId,
        versions: versions.sort((a, b) => b.published.localeCompare(a.published)), // Newest first
        totalVersions: versions.length
      }
    };
  } catch (error) {
    return this.handleError(error, 'Failed to fetch package index');
  }
}

/**
 * Fetches detailed metadata for a specific package version.
 */
async getPackageVersion(packageId: string, version: string, signal?: AbortSignal): Promise<NuGetResult<PackageVersionDetails>> {
  try {
    await this.ensureServiceIndex(signal);
    const baseUrl = this.getRegistrationBaseUrl();
    const url = `${baseUrl}/${packageId.toLowerCase()}/${version.toLowerCase()}.json`;
    
    const response = await this.fetchJson<RegistrationLeafResponse>(url, 30000, signal);
    if (!response.success) return response;
    
    const parsed = parsePackageVersionDetails(response.result);
    return { success: true, result: parsed };
  } catch (error) {
    return this.handleError(error, 'Failed to fetch package version details');
  }
}

/**
 * Fetches package README content.
 * Enforces 500KB size limit with truncation.
 */
async getPackageReadme(packageId: string, version: string, signal?: AbortSignal): Promise<NuGetResult<string>> {
  try {
    const flatContainerUrl = await this.getFlatContainerBaseUrl();
    const url = `${flatContainerUrl}/${packageId.toLowerCase()}/${version.toLowerCase()}/readme`;
    
    // 60s timeout for large READMEs
    const combinedSignal = this.combineSignals(signal, 60000);
    
    const response = await fetch(url, { signal: combinedSignal });
    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: { code: 'ApiError', message: 'README not found', statusCode: 404 } };
      }
      return { success: false, error: { code: 'ApiError', message: `HTTP ${response.status}`, statusCode: response.status } };
    }
    
    // Enforce size limit
    const MAX_SIZE = 500 * 1024;
    const contentLength = parseInt(response.headers.get('content-length') ?? '0', 10);
    
    if (contentLength > MAX_SIZE) {
      return {
        success: true,
        result: `[README too large (${(contentLength / 1024).toFixed(0)}KB). View at https://www.nuget.org/packages/${packageId}/${version}]`
      };
    }
    
    const text = await response.text();
    if (text.length > MAX_SIZE) {
      return {
        success: true,
        result: `[README truncated at 500KB. View full at https://www.nuget.org/packages/${packageId}/${version}]\n\n` + text.slice(0, MAX_SIZE)
      };
    }
    
    return { success: true, result: text };
  } catch (error) {
    return this.handleError(error, 'Failed to fetch README');
  }
}

// Private helper methods

private async ensureServiceIndex(signal?: AbortSignal): Promise<void> {
  if (this.serviceIndex) return;
  
  const url = `${this.sourceUrl}/v3/index.json`;
  const response = await this.fetchJson<ServiceIndex>(url, 10000, signal);
  
  if (!response.success) {
    throw new Error(`Failed to fetch service index: ${response.error.message}`);
  }
  
  this.serviceIndex = response.result;
}

private getRegistrationBaseUrl(): string {
  const resources = this.serviceIndex!.resources;
  
  const preferredTypes = [
    'RegistrationsBaseUrl/3.6.0',
    'RegistrationsBaseUrl/Versioned',
    'RegistrationsBaseUrl/3.4.0',
    'RegistrationsBaseUrl'
  ];
  
  for (const type of preferredTypes) {
    const resource = resources.find(r => r['@type'] === type);
    if (resource) return resource['@id'];
  }
  
  throw new Error('No RegistrationsBaseUrl found in service index');
}

private async getFlatContainerBaseUrl(): Promise<string> {
  await this.ensureServiceIndex();
  const resource = this.serviceIndex!.resources.find(r => 
    r['@type'] === 'PackageBaseAddress/3.0.0' || r['@type'].startsWith('PackageBaseAddress')
  );
  
  if (!resource) throw new Error('No PackageBaseAddress found in service index');
  return resource['@id'];
}

private async extractVersionsFromIndex(index: RegistrationIndexResponse, signal?: AbortSignal): Promise<PackageVersionSummary[]> {
  const allVersions: PackageVersionSummary[] = [];
  
  for (const page of index.items) {
    if (page.items) {
      // Inlined page
      allVersions.push(...page.items.map(parseVersionSummary));
    } else {
      // External page - fetch separately
      const pageResponse = await this.fetchJson<RegistrationPageResponse>(page['@id'], 30000, signal);
      if (pageResponse.success) {
        allVersions.push(...pageResponse.result.items.map(parseVersionSummary));
      }
    }
  }
  
  return allVersions;
}
```

</details>

### 3. Create Registration Response Parsers

Implement pure parser functions to transform Registration API JSON responses into domain models.

**File**: `src/domain/parsers/packageDetailsParser.ts`

<details>
<summary>Parser Functions</summary>

```typescript
// src/domain/parsers/packageDetailsParser.ts

import type {
  PackageVersionDetails,
  DependencyGroup,
  PackageDependency,
  PackageDeprecation,
  PackageVulnerability,
  VulnerabilitySeverity,
  DeprecationReason
} from '../models';

/**
 * Parses a registration leaf response into PackageVersionDetails.
 * Handles optional v3.4.0+ deprecation and v3.6.0+ vulnerability fields.
 */
export function parsePackageVersionDetails(response: any): PackageVersionDetails {
  const catalogEntry = response.catalogEntry;
  
  if (!catalogEntry) {
    throw new Error('Missing catalogEntry in registration leaf response');
  }
  
  return {
    id: catalogEntry.id,
    version: catalogEntry.version,
    description: catalogEntry.description ?? '',
    authors: catalogEntry.authors ?? '',
    iconUrl: catalogEntry.iconUrl,
    projectUrl: catalogEntry.projectUrl,
    licenseExpression: catalogEntry.licenseExpression,
    licenseUrl: catalogEntry.licenseUrl,
    requireLicenseAcceptance: catalogEntry.requireLicenseAcceptance ?? false,
    listed: catalogEntry.listed ?? true,
    published: catalogEntry.published,
    tags: normalizeTags(catalogEntry.tags),
    title: catalogEntry.title,
    summary: catalogEntry.summary,
    readmeUrl: catalogEntry.readmeUrl,
    minClientVersion: catalogEntry.minClientVersion,
    packageContent: catalogEntry.packageContent ?? response.packageContent,
    dependencyGroups: parseDependencyGroups(catalogEntry.dependencyGroups),
    deprecation: catalogEntry.deprecation ? parseDeprecation(catalogEntry.deprecation) : undefined,
    vulnerabilities: catalogEntry.vulnerabilities ? parseVulnerabilities(catalogEntry.vulnerabilities) : undefined
  };
}

/**
 * Parses dependency groups array from catalog entry.
 */
function parseDependencyGroups(groups?: any[]): DependencyGroup[] {
  if (!groups) return [];
  
  return groups.map(group => ({
    targetFramework: group.targetFramework ?? '', // Empty string = "any framework"
    dependencies: (group.dependencies ?? []).map((dep: any) => ({
      id: dep.id,
      range: dep.range
    }))
  }));
}

/**
 * Parses deprecation metadata from catalog entry.
 */
function parseDeprecation(deprecation: any): PackageDeprecation {
  return {
    reasons: (deprecation.reasons ?? []).map(parseDeprecationReason),
    message: deprecation.message,
    alternatePackage: deprecation.alternatePackage ? {
      id: deprecation.alternatePackage.id,
      range: deprecation.alternatePackage.range
    } : undefined
  };
}

/**
 * Maps deprecation reason string to enum.
 */
function parseDeprecationReason(reason: string): DeprecationReason {
  switch (reason) {
    case 'Legacy': return 'Legacy';
    case 'CriticalBugs': return 'CriticalBugs';
    default: return 'Other';
  }
}

/**
 * Parses vulnerability array from catalog entry.
 */
function parseVulnerabilities(vulnerabilities: any[]): PackageVulnerability[] {
  return vulnerabilities.map(vuln => ({
    advisoryUrl: vuln.advisoryUrl,
    severity: mapSeverityCode(vuln.severity)
  }));
}

/**
 * Maps numeric severity code to readable level.
 */
function mapSeverityCode(code: string | number): VulnerabilitySeverity {
  const numCode = typeof code === 'string' ? parseInt(code, 10) : code;
  
  switch (numCode) {
    case 0: return 'Low';
    case 1: return 'Moderate';
    case 2: return 'High';
    case 3: return 'Critical';
    default: return 'Moderate'; // Safe default
  }
}

/**
 * Normalizes tags from space-separated string or array to array.
 */
function normalizeTags(tags?: string | string[]): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags;
  return tags.split(/\s+/).filter(Boolean);
}

/**
 * Parses a version summary from registration page item.
 */
export function parseVersionSummary(item: any): PackageVersionSummary {
  const catalogEntry = item.catalogEntry;
  
  return {
    version: catalogEntry.version,
    downloads: catalogEntry.downloads,
    published: catalogEntry.published,
    listed: catalogEntry.listed ?? true
  };
}
```

</details>

### 4. Add Unit Tests for Parsers

Test all parser functions with valid, invalid, and edge case API responses.

**File**: `src/domain/parsers/__tests__/packageDetailsParser.test.ts`

<details>
<summary>Parser Unit Tests</summary>

```typescript
// src/domain/parsers/__tests__/packageDetailsParser.test.ts

import { describe, it, expect } from 'bun:test';
import {
  parsePackageVersionDetails,
  parseVersionSummary
} from '../packageDetailsParser';

describe('parsePackageVersionDetails', () => {
  it('should parse complete registration leaf response', () => {
    const response = {
      '@id': 'https://api.nuget.org/v3/registration5-semver1/newtonsoft.json/13.0.3.json',
      catalogEntry: {
        id: 'Newtonsoft.Json',
        version: '13.0.3',
        description: 'Json.NET is a popular high-performance JSON framework for .NET',
        authors: 'James Newton-King',
        iconUrl: 'https://www.nuget.org/Content/gallery/img/default-package-icon.png',
        projectUrl: 'https://www.newtonsoft.com/json',
        licenseExpression: 'MIT',
        requireLicenseAcceptance: false,
        listed: true,
        published: '2023-03-08T19:23:45.123+00:00',
        tags: ['json', 'serialization', 'newtonsoft'],
        packageContent: 'https://api.nuget.org/v3-flatcontainer/newtonsoft.json/13.0.3/newtonsoft.json.13.0.3.nupkg',
        dependencyGroups: [
          {
            targetFramework: '.NETStandard2.0',
            dependencies: [
              { id: 'Microsoft.CSharp', range: '[4.7.0, )' }
            ]
          }
        ]
      },
      packageContent: 'https://api.nuget.org/v3-flatcontainer/newtonsoft.json/13.0.3/newtonsoft.json.13.0.3.nupkg'
    };
    
    const result = parsePackageVersionDetails(response);
    
    expect(result.id).toBe('Newtonsoft.Json');
    expect(result.version).toBe('13.0.3');
    expect(result.description).toBe('Json.NET is a popular high-performance JSON framework for .NET');
    expect(result.authors).toBe('James Newton-King');
    expect(result.licenseExpression).toBe('MIT');
    expect(result.dependencyGroups).toHaveLength(1);
    expect(result.dependencyGroups[0].targetFramework).toBe('.NETStandard2.0');
    expect(result.dependencyGroups[0].dependencies).toHaveLength(1);
    expect(result.dependencyGroups[0].dependencies[0].id).toBe('Microsoft.CSharp');
  });
  
  it('should handle missing optional fields', () => {
    const response = {
      catalogEntry: {
        id: 'MinimalPackage',
        version: '1.0.0',
        listed: true,
        published: '2025-01-01T00:00:00Z',
        packageContent: 'https://example.com/package.nupkg'
      }
    };
    
    const result = parsePackageVersionDetails(response);
    
    expect(result.description).toBe('');
    expect(result.authors).toBe('');
    expect(result.tags).toEqual([]);
    expect(result.dependencyGroups).toEqual([]);
    expect(result.deprecation).toBeUndefined();
    expect(result.vulnerabilities).toBeUndefined();
  });
  
  it('should parse deprecation metadata', () => {
    const response = {
      catalogEntry: {
        id: 'DeprecatedPackage',
        version: '1.0.0',
        listed: true,
        published: '2025-01-01T00:00:00Z',
        packageContent: 'https://example.com/package.nupkg',
        deprecation: {
          reasons: ['Legacy'],
          message: 'This package is deprecated. Use NewPackage instead.',
          alternatePackage: {
            id: 'NewPackage',
            range: '[2.0.0, )'
          }
        }
      }
    };
    
    const result = parsePackageVersionDetails(response);
    
    expect(result.deprecation).toBeDefined();
    expect(result.deprecation!.reasons).toEqual(['Legacy']);
    expect(result.deprecation!.message).toBe('This package is deprecated. Use NewPackage instead.');
    expect(result.deprecation!.alternatePackage).toEqual({
      id: 'NewPackage',
      range: '[2.0.0, )'
    });
  });
  
  it('should parse vulnerability information', () => {
    const response = {
      catalogEntry: {
        id: 'VulnerablePackage',
        version: '1.0.0',
        listed: true,
        published: '2025-01-01T00:00:00Z',
        packageContent: 'https://example.com/package.nupkg',
        vulnerabilities: [
          {
            advisoryUrl: 'https://github.com/advisories/GHSA-xxxx',
            severity: '2'
          },
          {
            advisoryUrl: 'https://github.com/advisories/GHSA-yyyy',
            severity: 3
          }
        ]
      }
    };
    
    const result = parsePackageVersionDetails(response);
    
    expect(result.vulnerabilities).toHaveLength(2);
    expect(result.vulnerabilities![0].severity).toBe('High');
    expect(result.vulnerabilities![1].severity).toBe('Critical');
  });
  
  it('should normalize tags from space-separated string', () => {
    const response = {
      catalogEntry: {
        id: 'TaggedPackage',
        version: '1.0.0',
        listed: true,
        published: '2025-01-01T00:00:00Z',
        packageContent: 'https://example.com/package.nupkg',
        tags: 'json serialization newtonsoft'
      }
    };
    
    const result = parsePackageVersionDetails(response);
    
    expect(result.tags).toEqual(['json', 'serialization', 'newtonsoft']);
  });
  
  it('should normalize tags from array', () => {
    const response = {
      catalogEntry: {
        id: 'TaggedPackage',
        version: '1.0.0',
        listed: true,
        published: '2025-01-01T00:00:00Z',
        packageContent: 'https://example.com/package.nupkg',
        tags: ['json', 'serialization', 'newtonsoft']
      }
    };
    
    const result = parsePackageVersionDetails(response);
    
    expect(result.tags).toEqual(['json', 'serialization', 'newtonsoft']);
  });
  
  it('should handle multiple dependency groups', () => {
    const response = {
      catalogEntry: {
        id: 'MultiFrameworkPackage',
        version: '1.0.0',
        listed: true,
        published: '2025-01-01T00:00:00Z',
        packageContent: 'https://example.com/package.nupkg',
        dependencyGroups: [
          {
            targetFramework: '.NETFramework4.5'
            // No dependencies
          },
          {
            targetFramework: '.NETStandard2.0',
            dependencies: [
              { id: 'Microsoft.CSharp', range: '[4.7.0, )' }
            ]
          },
          {
            targetFramework: '', // "any framework"
            dependencies: [
              { id: 'System.Text.Json', range: '[6.0.0, )' }
            ]
          }
        ]
      }
    };
    
    const result = parsePackageVersionDetails(response);
    
    expect(result.dependencyGroups).toHaveLength(3);
    expect(result.dependencyGroups[0].targetFramework).toBe('.NETFramework4.5');
    expect(result.dependencyGroups[0].dependencies).toEqual([]);
    expect(result.dependencyGroups[1].targetFramework).toBe('.NETStandard2.0');
    expect(result.dependencyGroups[1].dependencies).toHaveLength(1);
    expect(result.dependencyGroups[2].targetFramework).toBe('');
    expect(result.dependencyGroups[2].dependencies).toHaveLength(1);
  });
});

describe('parseVersionSummary', () => {
  it('should parse version summary from page item', () => {
    const item = {
      catalogEntry: {
        version: '13.0.3',
        downloads: 12345678,
        published: '2023-03-08T19:23:45.123+00:00',
        listed: true
      }
    };
    
    const result = parseVersionSummary(item);
    
    expect(result.version).toBe('13.0.3');
    expect(result.downloads).toBe(12345678);
    expect(result.published).toBe('2023-03-08T19:23:45.123+00:00');
    expect(result.listed).toBe(true);
  });
  
  it('should handle missing optional fields', () => {
    const item = {
      catalogEntry: {
        version: '1.0.0',
        published: '2025-01-01T00:00:00Z'
      }
    };
    
    const result = parseVersionSummary(item);
    
    expect(result.version).toBe('1.0.0');
    expect(result.downloads).toBeUndefined();
    expect(result.listed).toBe(true); // Default
  });
});
```

</details>

### 5. Add Integration Tests for Registration API

Test real HTTP calls to nuget.org and handle various package scenarios.

**File**: `test/integration/nugetRegistrationApi.integration.test.ts`

<details>
<summary>Integration Tests</summary>

```typescript
// test/integration/nugetRegistrationApi.integration.test.ts

import { describe, it, expect } from 'bun:test';
import { NuGetApiClient } from '../../src/env/node/nugetApiClient';

const NUGET_ORG = 'https://api.nuget.org/v3/index.json';

describe('NuGet Registration API Integration', () => {
  it('should fetch package index for small package', async () => {
    const client = new NuGetApiClient(NUGET_ORG);
    const result = await client.getPackageIndex('DotNetEnv');
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result.id).toBe('DotNetEnv');
      expect(result.result.versions.length).toBeGreaterThan(0);
      expect(result.result.totalVersions).toBe(result.result.versions.length);
      
      // Versions should be sorted newest first
      const versions = result.result.versions;
      for (let i = 0; i < versions.length - 1; i++) {
        expect(new Date(versions[i].published).getTime()).toBeGreaterThanOrEqual(
          new Date(versions[i + 1].published).getTime()
        );
      }
    }
  }, { timeout: 10000 });
  
  it('should fetch package index for large package', async () => {
    const client = new NuGetApiClient(NUGET_ORG);
    const result = await client.getPackageIndex('Newtonsoft.Json');
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result.id).toBe('Newtonsoft.Json');
      expect(result.result.versions.length).toBeGreaterThan(64); // Large package
      expect(result.result.totalVersions).toBe(result.result.versions.length);
    }
  }, { timeout: 15000 });
  
  it('should fetch specific version details', async () => {
    const client = new NuGetApiClient(NUGET_ORG);
    const result = await client.getPackageVersion('Newtonsoft.Json', '13.0.3');
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result.id).toBe('Newtonsoft.Json');
      expect(result.result.version).toBe('13.0.3');
      expect(result.result.description).toBeTruthy();
      expect(result.result.authors).toBeTruthy();
      expect(result.result.dependencyGroups.length).toBeGreaterThan(0);
      expect(result.result.packageContent).toContain('.nupkg');
    }
  }, { timeout: 10000 });
  
  it('should fetch package README', async () => {
    const client = new NuGetApiClient(NUGET_ORG);
    // Use a package known to have a README
    const result = await client.getPackageReadme('Serilog', '3.1.1');
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result.length).toBeGreaterThan(0);
      // README should be text/markdown content
      expect(typeof result.result).toBe('string');
    }
  }, { timeout: 15000 });
  
  it('should handle 404 for non-existent package', async () => {
    const client = new NuGetApiClient(NUGET_ORG);
    const result = await client.getPackageIndex('ThisPackageDoesNotExist12345');
    
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('ApiError');
      expect(result.error.statusCode).toBe(404);
    }
  }, { timeout: 10000 });
  
  it('should handle 404 for non-existent version', async () => {
    const client = new NuGetApiClient(NUGET_ORG);
    const result = await client.getPackageVersion('Newtonsoft.Json', '999.999.999');
    
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('ApiError');
      expect(result.error.statusCode).toBe(404);
    }
  }, { timeout: 10000 });
  
  it('should handle 404 for missing README', async () => {
    const client = new NuGetApiClient(NUGET_ORG);
    // Use an old package version without README
    const result = await client.getPackageReadme('Newtonsoft.Json', '4.0.1');
    
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('ApiError');
      expect(result.error.statusCode).toBe(404);
    }
  }, { timeout: 10000 });
  
  it('should parse dependency groups correctly', async () => {
    const client = new NuGetApiClient(NUGET_ORG);
    const result = await client.getPackageVersion('Serilog', '3.1.1');
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result.dependencyGroups.length).toBeGreaterThan(0);
      
      // Check structure of dependency groups
      for (const group of result.result.dependencyGroups) {
        expect(typeof group.targetFramework).toBe('string');
        expect(Array.isArray(group.dependencies)).toBe(true);
        
        for (const dep of group.dependencies) {
          expect(typeof dep.id).toBe('string');
          expect(dep.id.length).toBeGreaterThan(0);
        }
      }
    }
  }, { timeout: 10000 });
  
  it('should abort request on signal', async () => {
    const client = new NuGetApiClient(NUGET_ORG);
    const controller = new AbortController();
    
    // Abort immediately
    setTimeout(() => controller.abort(), 10);
    
    const result = await client.getPackageIndex('Newtonsoft.Json', controller.signal);
    
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('Network');
    }
  }, { timeout: 5000 });
});
```

</details>

### 6. Update Domain Model Index Exports

Add new models to the domain layer index for easy imports.

**File**: `src/domain/models/index.ts`

```typescript
// Add to existing exports
export * from './packageIndex';
export * from './packageVersionDetails';
export * from './packageDependency';
export * from './packageDeprecation';
export * from './packageVulnerability';
```

### 7. Add JSDoc Documentation

Document all new API methods and types with comprehensive JSDoc comments including examples.

**Example JSDoc**:
```typescript
/**
 * Fetches comprehensive metadata for all versions of a package.
 * 
 * The Registration API returns a paginated structure optimized for package size:
 * - Small packages (≤64 versions): All version data is inlined in the index response
 * - Large packages (>64 versions): Pages must be fetched separately via `@id` URLs
 * 
 * This method handles both cases transparently, returning a unified result.
 * 
 * @param packageId - Package identifier (case-insensitive)
 * @param signal - Optional AbortSignal for request cancellation
 * @returns Package index with all versions sorted newest-first
 * 
 * @example
 * ```typescript
 * const result = await client.getPackageIndex('Newtonsoft.Json');
 * if (result.success) {
 *   console.log(`Found ${result.result.totalVersions} versions`);
 *   const latest = result.result.versions[0];
 *   console.log(`Latest: ${latest.version} (${latest.published})`);
 * }
 * ```
 */
async getPackageIndex(packageId: string, signal?: AbortSignal): Promise<NuGetResult<PackageIndex>>
```

### 8. Manual Testing Checklist

Verify registration API integration with real-world scenarios:

- [ ] **Search and view details** - Search for "Serilog", select result, verify all versions load
- [ ] **View dependencies** - Select a version with dependencies (e.g., Serilog 3.1.1), expand dependency groups
- [ ] **View deprecation** - Find deprecated package (e.g., Microsoft.AspNet.Mvc 5.x), verify warning shown
- [ ] **View README** - Select package with README (e.g., Serilog), verify Markdown renders safely
- [ ] **Large package** - Load Newtonsoft.Json (100+ versions), verify performance acceptable
- [ ] **Vulnerability warning** - Find vulnerable package, verify severity badge shown correctly
- [ ] **License info** - Verify license expression (MIT, Apache-2.0) or URL displayed
- [ ] **Multi-framework deps** - Select package with multiple TFMs, verify each group shown separately
- [ ] **Network timeout** - Throttle network to 3G, verify timeout handling after 30s
- [ ] **README size limit** - Find package with large README, verify truncation message
- [ ] **Cancellation** - Start loading details, immediately search for different package, verify first request cancels

## API Response Structures

<details>
<summary>TypeScript Interfaces for NuGet Registration API Responses</summary>

```typescript
// Internal types for API responses (not exported to domain layer)

interface ServiceIndex {
  version: string;
  resources: Array<{
    '@id': string;
    '@type': string;
    comment?: string;
  }>;
}

interface RegistrationIndexResponse {
  '@id': string;
  '@type': string[];
  count: number;
  items: RegistrationPageData[];
}

interface RegistrationPageData {
  '@id': string;
  '@type': string;
  count: number;
  lower: string; // Lowest version in page
  upper: string; // Highest version in page
  items?: RegistrationLeafData[]; // Present if inlined (≤64 versions)
}

interface RegistrationPageResponse {
  '@id': string;
  '@type': string;
  count: number;
  items: RegistrationLeafData[];
}

interface RegistrationLeafData {
  '@id': string;
  '@type': string;
  catalogEntry: CatalogEntry;
  packageContent: string;
  registration: string;
}

interface RegistrationLeafResponse {
  '@id': string;
  '@type': string;
  catalogEntry: CatalogEntry;
  packageContent: string;
  registration: string;
}

interface CatalogEntry {
  '@id': string;
  '@type': string;
  id: string;
  version: string;
  description?: string;
  authors?: string;
  iconUrl?: string;
  projectUrl?: string;
  licenseExpression?: string;
  licenseUrl?: string;
  requireLicenseAcceptance?: boolean;
  listed?: boolean;
  published: string;
  tags?: string | string[];
  title?: string;
  summary?: string;
  readmeUrl?: string;
  minClientVersion?: string;
  packageContent: string;
  dependencyGroups?: DependencyGroupData[];
  deprecation?: DeprecationData;
  vulnerabilities?: VulnerabilityData[];
}

interface DependencyGroupData {
  '@id': string;
  '@type': string;
  targetFramework?: string;
  dependencies?: DependencyData[];
}

interface DependencyData {
  '@id': string;
  '@type': string;
  id: string;
  range?: string;
}

interface DeprecationData {
  '@id': string;
  reasons: string[];
  message?: string;
  alternatePackage?: {
    '@id': string;
    id: string;
    range?: string;
  };
}

interface VulnerabilityData {
  '@id': string;
  advisoryUrl: string;
  severity: string | number;
}
```

</details>

## Error Handling Strategy

### Error Mapping

Map HTTP status codes and fetch errors to `NuGetError` types:

| Scenario | Error Code | Status Code | Retry Strategy |
|----------|------------|-------------|----------------|
| Package not found (404 on index) | `ApiError` | 404 | No retry (definitive) |
| Version not found (404 on leaf) | `ApiError` | 404 | No retry (definitive) |
| Rate limited (429) | `RateLimit` | 429 | Exponential backoff (1s, 2s, 4s, 8s) |
| Service unavailable (503) | `ApiError` | 503 | Exponential backoff (1s, 2s, 4s) |
| Network timeout | `Network` | - | No retry (let caller handle) |
| Fetch error (DNS, connection) | `Network` | - | No retry (let caller handle) |
| Parse error (invalid JSON) | `ParseError` | - | No retry (log for debugging) |
| Missing required field | `ParseError` | - | No retry (log for debugging) |

### Retry Logic Example

```typescript
private async fetchWithRetry<T>(
  url: string,
  timeout: number,
  signal?: AbortSignal,
  maxRetries = 3
): Promise<NuGetResult<T>> {
  let attempt = 0;
  let delay = 1000; // Start with 1s
  
  while (attempt < maxRetries) {
    const result = await this.fetchJson<T>(url, timeout, signal);
    
    if (result.success) return result;
    
    // Only retry on rate limit or service unavailable
    if (result.error.code === 'RateLimit' || 
        (result.error.code === 'ApiError' && result.error.statusCode === 503)) {
      attempt++;
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
        continue;
      }
    }
    
    // Non-retriable error or max retries exceeded
    return result;
  }
  
  return {
    success: false,
    error: { code: 'ApiError', message: 'Max retries exceeded' }
  };
}
```

## Performance Considerations

### Caching Strategy (STORY-001-01-012)

Registration API responses should be cached with different TTLs based on immutability:

| Resource Type | TTL | Rationale |
|---------------|-----|-----------|
| **Registration Index** | 10 minutes | New versions published infrequently; balance freshness vs. API load |
| **Registration Leaf** | 1 hour | Version metadata is immutable after publish (except unlisting) |
| **README Content** | 1 hour | Immutable after publish; rarely changes |
| **Service Index** | 1 day | Rarely changes; high cache hit rate |

**Cache Keys**:
```typescript
const indexCacheKey = `reg-index:${sourceUrl}:${packageId.toLowerCase()}`;
const leafCacheKey = `reg-leaf:${sourceUrl}:${packageId.toLowerCase()}:${version.toLowerCase()}`;
const readmeCacheKey = `readme:${sourceUrl}:${packageId.toLowerCase()}:${version.toLowerCase()}`;
```

**Cache Bypass**:
The `NuGetApiOptions.disableCache` flag allows bypassing the cache layer entirely:
- Useful for integration tests that need fresh data from the API
- Debugging scenarios where cache staleness is suspected
- Manual refresh operations triggered by users

```typescript
// In cache wrapper (STORY-001-01-012)
async getPackageIndex(packageId: string, signal?: AbortSignal): Promise<NuGetResult<PackageIndex>> {
  // Honor disableCache option
  if (this.options.disableCache) {
    // Skip cache, always hit API
    return await this.client.getPackageIndex(packageId, signal);
  }
  
  // Normal cache flow
  const cacheKey = `reg-index:${this.sourceUrl}:${packageId.toLowerCase()}`;
  const cached = this.cache.get(cacheKey);
  if (cached) return { success: true, result: cached };
  
  const result = await this.client.getPackageIndex(packageId, signal);
  if (result.success) {
    this.cache.set(cacheKey, result.result, 10 * 60 * 1000); // 10 min TTL
  }
  return result;
}
```

### Request Optimization

**Avoid Redundant Fetches**:
- Cache service index in memory after first fetch
- Use inlined page data when available (≤64 versions)
- Only fetch README when user explicitly requests it (lazy load)

**Batch Operations**:
```typescript
// When displaying package list, fetch indices in parallel
const indices = await Promise.all(
  packageIds.map(id => client.getPackageIndex(id))
);
```

**Progressive Loading**:
1. Show package name + latest version from search results immediately
2. Fetch registration index in background for version list
3. Lazy load registration leaf when user selects specific version
4. Lazy load README when user clicks "README" tab

## Security Considerations

### README Content Sanitization

**Critical**: Always sanitize README content before rendering to prevent XSS attacks.

```typescript
// In webview handler
import { sanitizeHtml } from '../webviews/sanitizer';

async function displayReadme(packageId: string, version: string) {
  const result = await client.getPackageReadme(packageId, version);
  
  if (result.success) {
    const sanitized = sanitizeHtml(result.result);
    webview.postMessage({
      type: 'readme-loaded',
      content: sanitized
    });
  }
}
```

### URL Validation

Validate all URLs from API responses before use:

```typescript
function isValidHttpsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// Before using packageContent URL
if (!isValidHttpsUrl(details.packageContent)) {
  throw new Error('Invalid package content URL');
}
```

### Version String Sanitization

Prevent path traversal attacks via malicious version strings:

```typescript
function sanitizeVersion(version: string): string {
  // Only allow alphanumeric, dots, hyphens, and plus signs (valid SemVer)
  if (!/^[a-zA-Z0-9.\-+]+$/.test(version)) {
    throw new Error('Invalid version string');
  }
  return version.toLowerCase();
}

// Before constructing leaf URL
const safeVersion = sanitizeVersion(version);
const leafUrl = `${baseUrl}/${packageId.toLowerCase()}/${safeVersion}.json`;
```

## Third-Party Source Compatibility

### Feature Detection

Not all NuGet sources support the full v3.6.0 API spec. Handle missing features gracefully:

```typescript
// Check for deprecation support
if (catalogEntry.deprecation) {
  // Display deprecation warning
} else {
  // Source may not support v3.4.0+ - no deprecation info available
}

// Check for vulnerability support
if (catalogEntry.vulnerabilities && catalogEntry.vulnerabilities.length > 0) {
  // Display security warnings
} else {
  // Either no vulnerabilities OR source doesn't support v3.6.0
  // Cannot distinguish - assume no vulnerabilities
}
```

### Known Limitations

| Source | Limitation | Workaround |
|--------|------------|------------|
| **BaGet** | No deprecation/vulnerability metadata | Display "N/A" for these fields |
| **JFrog Artifactory** | May lack vulnerability info | Check if field exists before displaying |
| **GitHub Packages** | Requires authentication | Ensure auth token passed in headers |
| **MyGet** | May have incomplete dependency groups | Handle empty dependency arrays |

## References

- [NuGet v3 Registration API Documentation](https://learn.microsoft.com/en-us/nuget/api/registration-base-url-resource)
- [STORY-001-01-008: Package Details API](../stories/STORY-001-01-008-package-details-api.md)
- [NuGet v3 Registration API Discovery Reference](../discovery/nuget-v3-registration-api.md)
- [STORY-001-01-011: Search Cache](../stories/STORY-001-01-011-search-cache.md)
- [STORY-001-01-012: Details Cache](../stories/STORY-001-01-012-details-cache.md)

---

**Last Updated**: 2025-12-30  
**Status**: Ready for Implementation  
**Estimated Effort**: 5 Story Points
