/**
 * Type definitions for package operation requests and results.
 *
 * This module provides domain models for package management operations
 * (add, remove, list) with structured error handling and discriminated unions.
 *
 * @module services/cli/types/packageOperation
 */

import type * as vscode from 'vscode';

/**
 * Options for adding a package to a project.
 */
export interface AddPackageOptions {
  /** Absolute path to target .csproj file */
  readonly projectPath: string;

  /** Package identifier (e.g., "Newtonsoft.Json") */
  readonly packageId: string;

  /** Target version (e.g., "13.0.3") - omit for latest stable */
  readonly version?: string;

  /** Include prerelease versions when resolving latest */
  readonly prerelease?: boolean;

  /** Custom package source URL (defaults to nuget.org) */
  readonly source?: string;

  /** Optional cancellation token for long-running downloads */
  readonly cancellationToken?: vscode.CancellationToken;
}

/**
 * Options for removing a package from a project.
 */
export interface RemovePackageOptions {
  /** Absolute path to target .csproj file */
  readonly projectPath: string;

  /** Package identifier to remove */
  readonly packageId: string;
}

/**
 * Package operation error codes.
 */
export enum PackageOperationErrorCode {
  /** dotnet CLI not found in PATH */
  DotnetNotFound = 'DOTNET_NOT_FOUND',

  /** Project file not found */
  ProjectNotFound = 'PROJECT_NOT_FOUND',

  /** Package version not found in source */
  PackageVersionNotFound = 'PACKAGE_VERSION_NOT_FOUND',

  /** Package requires license acceptance */
  LicenseAcceptanceRequired = 'LICENSE_ACCEPTANCE_REQUIRED',

  /** Package incompatible with target framework */
  FrameworkIncompatible = 'FRAMEWORK_INCOMPATIBLE',

  /** Circular dependency detected */
  CircularDependency = 'CIRCULAR_DEPENDENCY',

  /** Network error during package download */
  NetworkError = 'NETWORK_ERROR',

  /** Operation cancelled by user */
  Cancelled = 'CANCELLED',

  /** CLI execution timeout */
  Timeout = 'TIMEOUT',

  /** Generic CLI error */
  CliError = 'CLI_ERROR',
}

/**
 * Package operation error.
 */
export interface PackageOperationError {
  readonly code: PackageOperationErrorCode;
  readonly message: string;
  readonly details?: string;
  readonly nugetErrorCode?: string; // Original NU* code if applicable
}

/**
 * Result of a package operation.
 */
export type PackageOperationResult =
  | {
      readonly success: true;
      readonly exitCode: number;
      readonly stdout: string;
      readonly stderr: string;
    }
  | {
      readonly success: false;
      readonly error: PackageOperationError;
    };
