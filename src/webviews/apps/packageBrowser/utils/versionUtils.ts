/**
 * Version comparison and badge utilities for NuGet package versions.
 */

import type { VersionMetadata, VersionBadge } from '../components/version-selector';

/**
 * Parsed version with numeric and prerelease parts.
 */
interface ParsedVersion {
  numeric: number[];
  prerelease: string | null;
}

/**
 * Check if a version string represents a prerelease.
 */
export function isPrerelease(version: string): boolean {
  return /-/.test(version);
}

/**
 * Parse a version string into numeric and prerelease parts.
 *
 * Examples:
 * - "1.2.3" → { numeric: [1, 2, 3], prerelease: null }
 * - "2.0.0-beta.1" → { numeric: [2, 0, 0], prerelease: "beta.1" }
 */
export function parseVersion(version: string): ParsedVersion {
  const [numericPart, prerelease] = version.split('-');
  const numeric = (numericPart || '').split('.').map(n => parseInt(n, 10) || 0);
  return { numeric, prerelease: prerelease || null };
}

/**
 * Compare two semantic version strings.
 *
 * Returns:
 * - Positive if v1 > v2
 * - Negative if v1 < v2
 * - Zero if equal
 *
 * Rules:
 * - Numeric parts compared first
 * - Stable versions > prerelease versions
 * - Prerelease parts compared lexicographically
 */
export function compareVersions(v1: string, v2: string): number {
  const parts1 = parseVersion(v1);
  const parts2 = parseVersion(v2);

  // Compare numeric parts
  const maxLength = Math.max(parts1.numeric.length, parts2.numeric.length);
  for (let i = 0; i < maxLength; i++) {
    const num1 = parts1.numeric[i] ?? 0;
    const num2 = parts2.numeric[i] ?? 0;
    if (num1 !== num2) {
      return num1 - num2;
    }
  }

  // Compare prerelease parts (stable > prerelease)
  if (parts1.prerelease === null && parts2.prerelease !== null) {
    return 1; // v1 is stable, v2 is prerelease
  }
  if (parts1.prerelease !== null && parts2.prerelease === null) {
    return -1; // v1 is prerelease, v2 is stable
  }
  if (parts1.prerelease !== null && parts2.prerelease !== null) {
    return parts1.prerelease.localeCompare(parts2.prerelease);
  }

  return 0;
}

/**
 * Sort versions in descending order (latest first).
 */
export function sortVersionsDescending(versions: VersionMetadata[]): VersionMetadata[] {
  return [...versions].sort((a, b) => compareVersions(b.version, a.version));
}

/**
 * Identify which versions should display badges.
 *
 * Badges:
 * - Latest stable: First non-prerelease version
 * - Latest prerelease: First prerelease version
 * - Prerelease: All other prereleases
 */
export function identifyVersionBadges(versions: VersionMetadata[]): Map<string, VersionBadge> {
  const badgeMap = new Map<string, VersionBadge>();

  if (versions.length === 0) return badgeMap;

  // Find latest stable
  const latestStable = versions.find(v => !v.isPrerelease);
  if (latestStable) {
    badgeMap.set(latestStable.version, {
      type: 'latest-stable',
      label: 'Latest stable',
    });
  }

  // Find latest prerelease
  const latestPrerelease = versions.find(v => v.isPrerelease);
  if (latestPrerelease) {
    badgeMap.set(latestPrerelease.version, {
      type: 'latest-prerelease',
      label: 'Latest prerelease',
    });
  }

  // Mark all other prereleases
  versions.forEach(v => {
    if (v.isPrerelease && !badgeMap.has(v.version)) {
      badgeMap.set(v.version, {
        type: 'prerelease',
        label: 'Prerelease',
      });
    }
  });

  return badgeMap;
}

/**
 * Get the default version to select.
 *
 * - If includePrerelease: Latest version (stable or prerelease)
 * - Otherwise: Latest stable version
 */
export function getDefaultVersion(
  versions: VersionMetadata[],
  includePrerelease: boolean,
): VersionMetadata | undefined {
  if (includePrerelease) {
    return versions[0]; // First is always latest (stable or prerelease)
  }
  return versions.find(v => !v.isPrerelease);
}

/**
 * Filter versions based on prerelease preference.
 */
export function filterVersions(versions: VersionMetadata[], includePrerelease: boolean): VersionMetadata[] {
  if (includePrerelease) {
    return versions;
  }
  return versions.filter(v => !v.isPrerelease);
}
