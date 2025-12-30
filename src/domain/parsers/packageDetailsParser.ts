/**
 * Package details parser for NuGet Registration API responses.
 * @module domain/parsers/packageDetailsParser
 */

import type { PackageVersionDetails } from '../models/packageVersionDetails';
import type { PackageVersionSummary } from '../models/packageIndex';
import type { PackageDependency, DependencyGroup } from '../models/packageDependency';
import type { PackageDeprecation, DeprecationReason, AlternatePackage } from '../models/packageDeprecation';
import type { PackageVulnerability, VulnerabilitySeverity } from '../models/packageVulnerability';

/**
 * Parses a registration leaf response into PackageVersionDetails.
 *
 * @param response - Raw JSON response from Registration Leaf endpoint
 * @returns Parsed PackageVersionDetails
 * @throws Error if required properties are missing
 */
export function parsePackageVersionDetails(response: unknown): PackageVersionDetails {
  if (!response || typeof response !== 'object') {
    throw new Error('Invalid registration leaf response: not an object');
  }

  const data = response as Record<string, unknown>;

  // Validate required properties
  if (!data['@id'] || typeof data['@id'] !== 'string') {
    throw new Error('Invalid registration leaf: missing @id');
  }
  if (!data.catalogEntry || typeof data.catalogEntry !== 'object') {
    throw new Error('Invalid registration leaf: missing catalogEntry');
  }
  if (!data.packageContent || typeof data.packageContent !== 'string') {
    throw new Error('Invalid registration leaf: missing packageContent');
  }

  const catalogEntry = data.catalogEntry as Record<string, unknown>;

  // Parse catalog entry
  const id = catalogEntry.id as string;
  const version = catalogEntry.version as string;

  if (!id || !version) {
    throw new Error('Invalid catalogEntry: missing id or version');
  }

  return {
    id,
    version,
    description: catalogEntry.description as string | undefined,
    summary: catalogEntry.summary as string | undefined,
    title: catalogEntry.title as string | undefined,
    authors: catalogEntry.authors as string | undefined,
    owners: catalogEntry.owners as string | undefined,
    iconUrl: catalogEntry.iconUrl as string | undefined,
    licenseExpression: catalogEntry.licenseExpression as string | undefined,
    licenseUrl: catalogEntry.licenseUrl as string | undefined,
    projectUrl: catalogEntry.projectUrl as string | undefined,
    tags: normalizeTags(catalogEntry.tags as string | string[] | undefined),
    totalDownloads: catalogEntry.totalDownloads as number | undefined,
    listed: catalogEntry.listed === true,
    published: catalogEntry.published as string | undefined,
    dependencyGroups: parseDependencyGroups(catalogEntry.dependencyGroups as unknown[] | undefined),
    deprecation: catalogEntry.deprecation ? parseDeprecation(catalogEntry.deprecation) : undefined,
    vulnerabilities: catalogEntry.vulnerabilities
      ? parseVulnerabilities(catalogEntry.vulnerabilities as unknown[])
      : undefined,
    readmeUrl: catalogEntry.readmeUrl as string | undefined,
    packageContentUrl: data.packageContent as string,
    registrationUrl: data['@id'] as string,
  };
}

/**
 * Parses dependency groups array from catalog entry.
 *
 * @param groups - Raw dependency groups array
 * @returns Parsed DependencyGroup array
 */
function parseDependencyGroups(groups?: unknown[]): DependencyGroup[] {
  if (!groups || !Array.isArray(groups)) {
    return [];
  }

  return groups.map(group => {
    const g = group as Record<string, unknown>;
    return {
      targetFramework: (g.targetFramework as string) || '',
      dependencies: parseDependencies(g.dependencies as unknown[] | undefined),
    };
  });
}

/**
 * Parses dependencies array from a dependency group.
 *
 * @param dependencies - Raw dependencies array
 * @returns Parsed PackageDependency array
 */
function parseDependencies(dependencies?: unknown[]): PackageDependency[] {
  if (!dependencies || !Array.isArray(dependencies)) {
    return [];
  }

  return dependencies.map(dep => {
    const d = dep as Record<string, unknown>;
    return {
      id: d.id as string,
      range: d.range as string | undefined,
    };
  });
}

/**
 * Parses deprecation metadata from catalog entry.
 *
 * @param deprecation - Raw deprecation object
 * @returns Parsed PackageDeprecation
 */
function parseDeprecation(deprecation: unknown): PackageDeprecation {
  const d = deprecation as Record<string, unknown>;

  const reasons = Array.isArray(d.reasons)
    ? (d.reasons as string[]).map(parseDeprecationReason).filter((r): r is DeprecationReason => r !== null)
    : [];

  const alternatePackage: AlternatePackage | undefined = d.alternatePackage
    ? {
        id: (d.alternatePackage as Record<string, unknown>).id as string,
        range: (d.alternatePackage as Record<string, unknown>).range as string | undefined,
      }
    : undefined;

  return {
    reasons,
    message: d.message as string | undefined,
    alternatePackage,
  };
}

/**
 * Maps deprecation reason string to enum.
 *
 * @param reason - Raw reason string
 * @returns DeprecationReason or null if unknown
 */
function parseDeprecationReason(reason: string): DeprecationReason | null {
  switch (reason) {
    case 'Legacy':
      return 'Legacy';
    case 'CriticalBugs':
      return 'CriticalBugs';
    case 'Other':
      return 'Other';
    default:
      return null;
  }
}

/**
 * Parses vulnerability array from catalog entry.
 *
 * @param vulnerabilities - Raw vulnerabilities array
 * @returns Parsed PackageVulnerability array
 */
function parseVulnerabilities(vulnerabilities: unknown[]): PackageVulnerability[] {
  return vulnerabilities.map(vuln => {
    const v = vuln as Record<string, unknown>;
    return {
      advisoryUrl: v.advisoryUrl as string,
      severity: mapSeverityCode(v.severity as string | number),
    };
  });
}

/**
 * Maps numeric severity code to readable level.
 *
 * @param code - Severity code (0=Low, 1=Moderate, 2=High, 3=Critical)
 * @returns VulnerabilitySeverity
 */
function mapSeverityCode(code: string | number): VulnerabilitySeverity {
  const numCode = typeof code === 'string' ? parseInt(code, 10) : code;

  switch (numCode) {
    case 0:
      return 'Low';
    case 1:
      return 'Moderate';
    case 2:
      return 'High';
    case 3:
      return 'Critical';
    default:
      return 'Low';
  }
}

/**
 * Normalizes tags from space-separated string or array to array.
 *
 * @param tags - Tags as string or array
 * @returns Tags array
 */
function normalizeTags(tags?: string | string[]): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags;
  return tags.split(/\s+/).filter(Boolean);
}

/**
 * Parses a version summary from registration page item.
 *
 * @param item - Raw page item object
 * @returns Parsed PackageVersionSummary
 */
export function parseVersionSummary(item: unknown): PackageVersionSummary {
  if (!item || typeof item !== 'object') {
    throw new Error('Invalid page item: not an object');
  }

  const data = item as Record<string, unknown>;
  const catalogEntry = data.catalogEntry as Record<string, unknown> | undefined;

  if (!catalogEntry?.version) {
    throw new Error('Invalid page item: missing catalogEntry.version');
  }

  return {
    version: catalogEntry.version as string,
    downloads: catalogEntry.downloads as number | undefined,
    registrationUrl: data['@id'] as string,
    packageContentUrl: data.packageContent as string,
    listed: catalogEntry.listed === true,
  };
}
