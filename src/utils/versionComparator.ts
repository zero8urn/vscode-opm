/**
 * Semantic version comparison utilities for NuGet packages.
 * @module utils/versionComparator
 */

/**
 * Parsed semantic version components.
 */
interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
  build: string | null;
}

/**
 * Parses a semantic version string into components.
 *
 * @param version - Version string (e.g., "1.2.3-beta.1+build.456")
 * @returns Parsed version components
 *
 * @remarks
 * Handles:
 * - Standard SemVer: "1.2.3"
 * - Prerelease: "1.2.3-beta.1"
 * - Build metadata: "1.2.3+build.456"
 * - Combined: "1.2.3-beta.1+build.456"
 * - Short versions: "1.2" (treated as "1.2.0")
 * - Single digit: "1" (treated as "1.0.0")
 */
function parseVersion(version: string): ParsedVersion {
  // Strip leading 'v' if present
  const cleanVersion = version.startsWith('v') ? version.slice(1) : version;

  // Split build metadata (after '+')
  const [versionWithoutBuild, build] = cleanVersion.split('+');

  // Split prerelease (after '-')
  const [versionCore, prerelease] = (versionWithoutBuild || '').split('-');

  // Parse numeric version components
  const parts = (versionCore || '').split('.').map(p => parseInt(p, 10) || 0);

  return {
    major: parts[0] ?? 0,
    minor: parts[1] ?? 0,
    patch: parts[2] ?? 0,
    prerelease: prerelease || null,
    build: build || null,
  };
}

/**
 * Compares two semantic version strings.
 *
 * @param a - First version string
 * @param b - Second version string
 * @returns Negative if a < b, positive if a > b, zero if equal
 *
 * @remarks
 * Follows SemVer 2.0.0 precedence rules:
 * 1. Major.Minor.Patch comparison (numeric)
 * 2. Prerelease versions have lower precedence than release versions
 * 3. Prerelease identifiers compared lexicographically
 * 4. Build metadata ignored for precedence
 *
 * @example
 * ```typescript
 * compareVersions('2.0.0', '1.9.9') > 0  // true
 * compareVersions('1.0.0-beta', '1.0.0') < 0  // true (prerelease < release)
 * compareVersions('1.0.0-alpha', '1.0.0-beta') < 0  // true (alpha < beta)
 * compareVersions('10.0.0', '2.0.0') > 0  // true (numeric comparison)
 * ```
 */
export function compareVersions(a: string, b: string): number {
  const versionA = parseVersion(a);
  const versionB = parseVersion(b);

  // Compare major.minor.patch numerically
  if (versionA.major !== versionB.major) {
    return versionA.major - versionB.major;
  }
  if (versionA.minor !== versionB.minor) {
    return versionA.minor - versionB.minor;
  }
  if (versionA.patch !== versionB.patch) {
    return versionA.patch - versionB.patch;
  }

  // Handle prerelease precedence
  // Release version (no prerelease) > prerelease version
  if (versionA.prerelease === null && versionB.prerelease === null) {
    return 0; // Both are release versions, equal precedence
  }
  if (versionA.prerelease === null) {
    return 1; // A is release, B is prerelease → A > B
  }
  if (versionB.prerelease === null) {
    return -1; // A is prerelease, B is release → A < B
  }

  // Both have prerelease, compare lexicographically by parts
  const partsA = versionA.prerelease.split('.');
  const partsB = versionB.prerelease.split('.');

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const partA = partsA[i];
    const partB = partsB[i];

    // Missing part has lower precedence
    if (partA === undefined) return -1;
    if (partB === undefined) return 1;

    // Try numeric comparison first
    const numA = parseInt(partA, 10);
    const numB = parseInt(partB, 10);

    if (!isNaN(numA) && !isNaN(numB)) {
      if (numA !== numB) {
        return numA - numB;
      }
    } else {
      // Lexicographic comparison for non-numeric parts
      const cmp = partA.localeCompare(partB);
      if (cmp !== 0) {
        return cmp;
      }
    }
  }

  return 0; // Prerelease parts are equal
}

/**
 * Sorts version strings in descending order (newest first).
 *
 * @param versions - Array of version strings
 * @returns Sorted array (newest to oldest)
 *
 * @example
 * ```typescript
 * const sorted = sortVersionsDescending(['1.0.0', '2.0.0', '1.5.0', '10.0.0']);
 * // Result: ['10.0.0', '2.0.0', '1.5.0', '1.0.0']
 * ```
 */
export function sortVersionsDescending(versions: string[]): string[] {
  return [...versions].sort((a, b) => compareVersions(b, a));
}

/**
 * Sorts version strings in ascending order (oldest first).
 *
 * @param versions - Array of version strings
 * @returns Sorted array (oldest to newest)
 *
 * @example
 * ```typescript
 * const sorted = sortVersionsAscending(['2.0.0', '1.0.0', '10.0.0']);
 * // Result: ['1.0.0', '2.0.0', '10.0.0']
 * ```
 */
export function sortVersionsAscending(versions: string[]): string[] {
  return [...versions].sort((a, b) => compareVersions(a, b));
}
