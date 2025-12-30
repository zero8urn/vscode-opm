/**
 * Package index models for NuGet registration API responses.
 * @module domain/models/packageIndex
 */

/**
 * Represents a summary of a single package version in the index.
 */
export interface PackageVersionSummary {
  /** SemVer 2.0.0 version string */
  version: string;
  /** Total downloads for this version */
  downloads?: number;
  /** Registration leaf URL for this version */
  registrationUrl: string;
  /** Package content (.nupkg) download URL */
  packageContentUrl: string;
  /** Is this version listed/published */
  listed: boolean;
}

/**
 * Represents the complete package index with all versions.
 */
export interface PackageIndex {
  /** Package ID */
  id: string;
  /** All versions available (sorted newest to oldest) */
  versions: PackageVersionSummary[];
  /** Total version count */
  totalVersions: number;
}
