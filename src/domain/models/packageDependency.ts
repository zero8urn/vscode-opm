/**
 * Package dependency models for NuGet registration API responses.
 * @module domain/models/packageDependency
 */

/**
 * Represents a single NuGet package dependency.
 */
export interface PackageDependency {
  /** Dependency package ID */
  id: string;
  /** Dependency version range (e.g., "[1.0.0, 2.0.0)" or "1.2.3") */
  range?: string;
}

/**
 * Represents a group of dependencies targeting a specific framework.
 */
export interface DependencyGroup {
  /** Target framework moniker (e.g., ".NETStandard2.0", "net6.0") or empty string for "any" */
  targetFramework: string;
  /** Dependencies for this framework */
  dependencies: PackageDependency[];
}
