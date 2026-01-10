/**
 * Semantic version comparison utilities for package version indicators
 */

/**
 * Parse a semantic version string into comparable parts
 */
function parseVersion(version: string): { major: number; minor: number; patch: number; prerelease: string } {
  // Remove 'v' prefix if present
  const cleanVersion = version.startsWith('v') ? version.slice(1) : version;

  // Split on '-' to separate prerelease
  const [versionPart = '', prerelease = ''] = cleanVersion.split('-');

  // Parse major.minor.patch
  const parts = versionPart.split('.').map(Number);
  const [major = 0, minor = 0, patch = 0] = parts;

  return { major, minor, patch, prerelease };
}

/**
 * Compare two semantic versions
 * @returns -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
export function compareVersions(v1: string, v2: string): number {
  const parsed1 = parseVersion(v1);
  const parsed2 = parseVersion(v2);

  // Compare major.minor.patch
  if (parsed1.major !== parsed2.major) {
    return parsed1.major - parsed2.major;
  }
  if (parsed1.minor !== parsed2.minor) {
    return parsed1.minor - parsed2.minor;
  }
  if (parsed1.patch !== parsed2.patch) {
    return parsed1.patch - parsed2.patch;
  }

  // Handle prerelease versions
  // Stable versions (no prerelease) are higher than prerelease versions
  if (!parsed1.prerelease && parsed2.prerelease) {
    return 1;
  }
  if (parsed1.prerelease && !parsed2.prerelease) {
    return -1;
  }

  // Both are prerelease or both are stable
  if (parsed1.prerelease === parsed2.prerelease) {
    return 0;
  }

  // Lexicographic comparison of prerelease strings
  return parsed1.prerelease.localeCompare(parsed2.prerelease);
}

/**
 * Determine the version indicator for a project
 * @param installedVersion Currently installed version
 * @param selectedVersion Version to be installed
 * @returns '↑' for upgrade, '↓' for downgrade, '' for same/no installed version
 */
export function getVersionIndicator(
  installedVersion: string | undefined,
  selectedVersion: string | undefined,
): '↑' | '↓' | '' {
  if (!installedVersion || !selectedVersion) {
    return '';
  }

  const comparison = compareVersions(selectedVersion, installedVersion);

  if (comparison > 0) {
    return '↑'; // Upgrade
  }
  if (comparison < 0) {
    return '↓'; // Downgrade
  }

  return ''; // Same version
}
