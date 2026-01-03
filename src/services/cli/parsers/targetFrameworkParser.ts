/**
 * Parser for extracting target framework(s) from dotnet msbuild -getProperty output.
 *
 * Uses authoritative MSBuild property evaluation to obtain TargetFramework and
 * TargetFrameworks properties, respecting conditions, imports, and SDK defaults.
 *
 * @module services/cli/parsers/targetFrameworkParser
 */

import type { DotnetCliExecutor } from '../dotnetCliExecutor';
import type { ILogger } from '../../loggerService';
import type { TargetFrameworks } from '../types/projectMetadata';

export interface TargetFrameworkParser {
  /**
   * Parse target framework(s) from a project file.
   *
   * Executes `dotnet msbuild -getProperty:TargetFramework;TargetFrameworks` to
   * obtain evaluated properties. Prioritizes TargetFrameworks (multi-targeting)
   * over TargetFramework (single targeting).
   *
   * @param projectPath - Absolute path to .csproj file
   * @returns Normalized target frameworks (string or array) or null on failure
   */
  parseTargetFrameworks(projectPath: string): Promise<TargetFrameworks | null>;
}

export function createTargetFrameworkParser(cliExecutor: DotnetCliExecutor, logger: ILogger): TargetFrameworkParser {
  return {
    async parseTargetFrameworks(projectPath: string): Promise<TargetFrameworks | null> {
      logger.debug('Parsing target frameworks', { projectPath });

      // Execute msbuild to get both TargetFramework and TargetFrameworks properties
      const result = await cliExecutor.execute({
        args: ['msbuild', projectPath, '-getProperty:TargetFramework', '-getProperty:TargetFrameworks', '-noLogo'],
      });

      // Handle command failures
      if (result.exitCode !== 0) {
        logger.error('Failed to get target framework properties', new Error(result.stderr));
        return null;
      }

      if (result.timedOut) {
        logger.error('MSBuild timed out while getting target framework properties');
        return null;
      }

      // Modern MSBuild returns JSON format when querying multiple properties
      // Try parsing as JSON first
      try {
        const jsonOutput = JSON.parse(result.stdout);
        if (jsonOutput.Properties) {
          const targetFramework = jsonOutput.Properties.TargetFramework?.trim();
          const targetFrameworks = jsonOutput.Properties.TargetFrameworks?.trim();

          // Prioritize TargetFrameworks (multi-targeting) over TargetFramework
          if (targetFrameworks && targetFrameworks.length > 0) {
            const frameworks = targetFrameworks
              .split(';')
              .map((f: string) => f.trim())
              .filter((f: string) => f.length > 0);

            if (frameworks.length === 0) {
              logger.warn('TargetFrameworks property is empty', { projectPath });
              return null;
            }

            return frameworks.length > 1 ? frameworks : frameworks[0]!;
          }

          if (targetFramework && targetFramework.length > 0) {
            return targetFramework;
          }

          logger.warn('No target framework defined in project', { projectPath });
          return null;
        }
      } catch {
        // Not JSON, fall back to line-by-line parsing (older MSBuild versions)
      }

      // Parse output line-by-line to extract property key-value pairs (fallback)
      const lines = result.stdout.split('\n').map(line => line.trim());
      let targetFramework: string | undefined;
      let targetFrameworks: string | undefined;

      for (const line of lines) {
        // Output format: "PropertyName=PropertyValue"
        const match = line.match(/^(TargetFrameworks?)=(.*)$/);
        if (match) {
          const [, propName, propValue] = match;
          if (propName === 'TargetFrameworks' && propValue) {
            targetFrameworks = propValue.trim();
          } else if (propName === 'TargetFramework' && propValue) {
            targetFramework = propValue.trim();
          }
        }
      }

      // Prioritize TargetFrameworks (multi-targeting) over TargetFramework
      if (targetFrameworks && targetFrameworks.length > 0) {
        // Split by semicolon and filter empty strings
        const frameworks = targetFrameworks
          .split(';')
          .map(f => f.trim())
          .filter(f => f.length > 0);

        if (frameworks.length === 0) {
          logger.warn('TargetFrameworks property is empty', { projectPath });
          return null;
        }

        // Return array if multiple frameworks, single string if only one
        return frameworks.length > 1 ? frameworks : frameworks[0]!;
      }

      // Fall back to single TargetFramework
      if (targetFramework && targetFramework.length > 0) {
        return targetFramework;
      }

      // No target framework defined
      logger.warn('No target framework defined in project', { projectPath });
      return null;
    },
  };
}
