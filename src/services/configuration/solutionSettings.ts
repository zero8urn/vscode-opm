/**
 * Configuration schema and types for solution discovery.
 *
 * This module defines workspace settings that control how the extension
 * discovers and manages .NET solution files and project scoping.
 */

/**
 * File system scan depth for solution file discovery.
 *
 * - `root-only`: Scan workspace root folders only (fast, recommended)
 * - `recursive`: Scan all subdirectories (slow, may impact performance)
 */
export type SolutionScanDepth = 'root-only' | 'recursive';

/**
 * Workspace settings for solution discovery and project scoping.
 */
export interface SolutionDiscoverySettings {
  /** File system scan depth for .sln/.slnx files */
  solutionScanDepth: SolutionScanDepth;

  /** Maximum folder depth for .csproj scanning (used in Tier 2 fallback) */
  projectScanDepth: number;

  /** Project count threshold for performance warnings */
  largeWorkspaceThreshold: number;
}

/**
 * Default values for solution discovery settings.
 */
export const DEFAULT_SOLUTION_SETTINGS: SolutionDiscoverySettings = {
  solutionScanDepth: 'root-only',
  projectScanDepth: 3,
  largeWorkspaceThreshold: 50,
};

/**
 * Type guard to validate SolutionScanDepth enum values.
 */
export function isSolutionScanDepth(value: unknown): value is SolutionScanDepth {
  return value === 'root-only' || value === 'recursive';
}
