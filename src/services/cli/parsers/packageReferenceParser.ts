/**
 * Parser for extracting package references from dotnet list package JSON output.
 *
 * Uses `dotnet list package --format json` to enumerate installed PackageReference
 * entries with resolved versions. Excludes transitive dependencies and aggregates
 * packages across target frameworks for multi-targeting projects.
 *
 * @module services/cli/parsers/packageReferenceParser
 */

import type { DotnetCliExecutor } from '../dotnetCliExecutor';
import type { ILogger } from '../../loggerService';
import type { PackageReference } from '../types/projectMetadata';
import { ProjectParseErrorCode } from '../types/projectMetadata';

/**
 * JSON output schema from dotnet list package --format json
 */
interface DotnetListPackageOutput {
  version: number;
  parameters: string;
  projects: Array<{
    path: string;
    frameworks: Array<{
      framework: string;
      topLevelPackages: Array<{
        id: string;
        requestedVersion: string;
        resolvedVersion: string;
      }>;
      transitivePackages?: Array<{
        id: string;
        resolvedVersion: string;
      }>;
    }>;
  }>;
}

export interface PackageReferenceParser {
  /**
   * Parse package references from a project file.
   *
   * Executes `dotnet list package --format json` to obtain installed packages.
   * Aggregates packages across all target frameworks and uses highest resolved
   * version if the same package appears in multiple frameworks.
   *
   * @param projectPath - Absolute path to .csproj file
   * @returns Array of package references or empty array on failure
   * @throws Error with code PACKAGES_CONFIG_NOT_SUPPORTED for legacy packages.config projects
   */
  parsePackageReferences(projectPath: string): Promise<PackageReference[]>;
}

export function createPackageReferenceParser(cliExecutor: DotnetCliExecutor, logger: ILogger): PackageReferenceParser {
  return {
    async parsePackageReferences(projectPath: string): Promise<PackageReference[]> {
      logger.debug('Parsing package references', { projectPath });

      // Execute dotnet list package with JSON output
      const result = await cliExecutor.execute({
        args: ['list', projectPath, 'package', '--format', 'json'],
      });

      // Handle command failures
      if (result.exitCode !== 0) {
        // Check for packages.config error
        if (result.stderr.includes('packages.config')) {
          const error = new Error(
            `Project uses legacy packages.config format which is not supported. ` +
              `Please migrate to PackageReference format: https://learn.microsoft.com/en-us/nuget/consume-packages/migrate-packages-config-to-package-reference`,
          );
          error.name = ProjectParseErrorCode.PackagesConfigNotSupported;
          throw error;
        }

        // Log with meaningful error message
        const errorMessage = result.stderr.trim() || result.stdout.trim() || `Exit code: ${result.exitCode}`;
        logger.error('Failed to list package references', new Error(errorMessage));
        return [];
      }

      if (result.timedOut) {
        logger.error('dotnet list package timed out');
        return [];
      }

      // Parse JSON output
      let parsedOutput: DotnetListPackageOutput;
      try {
        parsedOutput = JSON.parse(result.stdout);
      } catch (err) {
        logger.error(
          'Failed to parse dotnet list package JSON output',
          err instanceof Error ? err : new Error(String(err)),
        );
        return [];
      }

      // Aggregate packages across all frameworks
      const packageMap = new Map<string, PackageReference>();

      for (const project of parsedOutput.projects) {
        for (const framework of project.frameworks) {
          // topLevelPackages may be undefined if project has no packages
          const topLevelPackages = framework.topLevelPackages || [];

          for (const pkg of topLevelPackages) {
            const existing = packageMap.get(pkg.id);

            // If package already exists, use highest resolved version
            if (existing) {
              const existingVersion = parseVersion(existing.resolvedVersion);
              const newVersion = parseVersion(pkg.resolvedVersion);

              if (compareVersions(newVersion, existingVersion) > 0) {
                packageMap.set(pkg.id, {
                  id: pkg.id,
                  requestedVersion: pkg.requestedVersion,
                  resolvedVersion: pkg.resolvedVersion,
                  targetFramework: framework.framework,
                  isTransitive: false,
                });
              }
            } else {
              // Add new package
              packageMap.set(pkg.id, {
                id: pkg.id,
                requestedVersion: pkg.requestedVersion,
                resolvedVersion: pkg.resolvedVersion,
                targetFramework: framework.framework,
                isTransitive: false,
              });
            }
          }
        }
      }

      const packages = Array.from(packageMap.values());
      logger.debug(`Found ${packages.length} package reference(s)`, { projectPath });
      return packages;
    },
  };
}

/**
 * Parse a semantic version string into comparable parts.
 */
function parseVersion(version: string): { major: number; minor: number; patch: number; prerelease?: string } {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
  if (!match) {
    return { major: 0, minor: 0, patch: 0 };
  }

  return {
    major: parseInt(match[1]!, 10),
    minor: parseInt(match[2]!, 10),
    patch: parseInt(match[3]!, 10),
    prerelease: match[4],
  };
}

/**
 * Compare two parsed versions.
 * @returns Positive if v1 > v2, negative if v1 < v2, 0 if equal
 */
function compareVersions(
  v1: { major: number; minor: number; patch: number; prerelease?: string },
  v2: { major: number; minor: number; patch: number; prerelease?: string },
): number {
  if (v1.major !== v2.major) return v1.major - v2.major;
  if (v1.minor !== v2.minor) return v1.minor - v2.minor;
  if (v1.patch !== v2.patch) return v1.patch - v2.patch;

  // Prerelease versions are lower than release versions
  if (v1.prerelease && !v2.prerelease) return -1;
  if (!v1.prerelease && v2.prerelease) return 1;
  if (v1.prerelease && v2.prerelease) {
    return v1.prerelease.localeCompare(v2.prerelease);
  }

  return 0;
}
