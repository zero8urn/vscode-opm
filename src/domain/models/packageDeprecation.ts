/**
 * Package deprecation models for NuGet registration API responses.
 * @module domain/models/packageDeprecation
 */

/**
 * Reasons why a package might be deprecated.
 */
export type DeprecationReason = 'Legacy' | 'CriticalBugs' | 'Other';

/**
 * Represents an alternate package recommendation.
 */
export interface AlternatePackage {
  /** Recommended package ID */
  id: string;
  /** Recommended version range (optional) */
  range?: string;
}

/**
 * Represents package deprecation metadata.
 */
export interface PackageDeprecation {
  /** Reasons for deprecation */
  reasons: DeprecationReason[];
  /** Custom deprecation message */
  message?: string;
  /** Recommended alternative package */
  alternatePackage?: AlternatePackage;
}
