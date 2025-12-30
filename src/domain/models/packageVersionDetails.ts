/**
 * Package version details models for NuGet registration API responses.
 * @module domain/models/packageVersionDetails
 */

import type { DependencyGroup } from './packageDependency.js';
import type { PackageDeprecation } from './packageDeprecation.js';
import type { PackageVulnerability } from './packageVulnerability.js';

/**
 * Represents complete metadata for a specific package version.
 */
export interface PackageVersionDetails {
  /** Package ID (case-preserved from API) */
  id: string;
  /** SemVer 2.0.0 version string */
  version: string;
  /** Package description */
  description?: string;
  /** Package summary (shorter than description) */
  summary?: string;
  /** Package title (display name) */
  title?: string;
  /** Package authors (comma-separated or array) */
  authors?: string;
  /** Package owners (comma-separated or array) */
  owners?: string;
  /** Package icon URL */
  iconUrl?: string;
  /** SPDX license expression (e.g., "MIT", "Apache-2.0") */
  licenseExpression?: string;
  /** License URL (legacy, prefer licenseExpression) */
  licenseUrl?: string;
  /** Project URL */
  projectUrl?: string;
  /** Package tags */
  tags?: string[];
  /** Total download count (across all versions) */
  totalDownloads?: number;
  /** Is this version listed/published */
  listed: boolean;
  /** Publish date (ISO 8601) */
  published?: string;
  /** Dependency groups by target framework */
  dependencyGroups?: DependencyGroup[];
  /** Deprecation metadata (v3.4.0+) */
  deprecation?: PackageDeprecation;
  /** Known vulnerabilities (v3.6.0+) */
  vulnerabilities?: PackageVulnerability[];
  /** README content URL */
  readmeUrl?: string;
  /** Package content (.nupkg) download URL */
  packageContentUrl: string;
  /** Registration index URL */
  registrationUrl: string;
}
