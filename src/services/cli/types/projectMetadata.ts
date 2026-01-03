/**
 * Type definitions for .NET project metadata extracted via dotnet CLI.
 *
 * This module provides domain models for project information obtained through
 * authoritative MSBuild evaluation (`dotnet msbuild -getProperty`) and package
 * enumeration (`dotnet list package --format json`).
 *
 * @module services/cli/types/projectMetadata
 */

/**
 * Target framework moniker (e.g., "net8.0", "net6.0;net7.0")
 */
export type TargetFrameworkMoniker = string;

/**
 * Normalized target framework(s) - single string or array for multi-targeting
 *
 * Examples:
 * - Single targeting: "net8.0"
 * - Multi-targeting: ["net6.0", "net7.0", "net8.0"]
 */
export type TargetFrameworks = string | string[];

/**
 * Package reference entry from dotnet list package
 */
export interface PackageReference {
  /** Package ID (e.g., "Newtonsoft.Json") */
  readonly id: string;

  /** Requested version (e.g., "13.0.3") */
  readonly requestedVersion: string;

  /** Resolved version (may differ from requested due to version ranges) */
  readonly resolvedVersion: string;

  /** Target framework this package applies to (for multi-targeting projects) */
  readonly targetFramework?: string;

  /** Whether this is a transitive (indirect) dependency */
  readonly isTransitive: boolean;
}

/**
 * Project metadata extracted from dotnet CLI commands
 */
export interface ProjectMetadata {
  /** Absolute path to .csproj file */
  readonly path: string;

  /** Project name (derived from file name) */
  readonly name: string;

  /** Target framework(s) - string for single, array for multi-targeting */
  readonly targetFrameworks: TargetFrameworks;

  /** Installed package references (direct dependencies only) */
  readonly packageReferences: readonly PackageReference[];

  /** Project output type (Exe, Library, WinExe) */
  readonly outputType?: string;

  /** Whether project uses centralized artifact output layout */
  readonly useArtifactsOutput?: boolean;
}

/**
 * Project parsing error types
 */
export enum ProjectParseErrorCode {
  /** Project file not found */
  ProjectNotFound = 'PROJECT_NOT_FOUND',

  /** dotnet CLI not available in PATH */
  DotnetNotFound = 'DOTNET_NOT_FOUND',

  /** CLI command execution timeout */
  CommandTimeout = 'COMMAND_TIMEOUT',

  /** MSBuild evaluation failed */
  MsBuildError = 'MSBUILD_ERROR',

  /** Legacy packages.config format not supported */
  PackagesConfigNotSupported = 'PACKAGES_CONFIG_NOT_SUPPORTED',

  /** Invalid JSON output from dotnet list package */
  InvalidJsonOutput = 'INVALID_JSON_OUTPUT',

  /** No target framework defined in project */
  NoTargetFramework = 'NO_TARGET_FRAMEWORK',
}

/**
 * Project parsing error
 */
export interface ProjectParseError {
  readonly code: ProjectParseErrorCode;
  readonly message: string;
  readonly details?: string;
}

/**
 * Result type for project parsing operations
 */
export type ProjectParseResult =
  | { success: true; metadata: ProjectMetadata }
  | { success: false; error: ProjectParseError };

/**
 * Type guard to check if TargetFrameworks is a multi-targeting array
 */
export function isMultiTargeting(frameworks: TargetFrameworks): frameworks is string[] {
  return Array.isArray(frameworks);
}

/**
 * Normalize TargetFrameworks to always return an array
 */
export function normalizeTargetFrameworks(frameworks: TargetFrameworks): string[] {
  return Array.isArray(frameworks) ? frameworks : [frameworks];
}
