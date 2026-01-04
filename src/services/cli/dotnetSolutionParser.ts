/**
 * CLI integration to parse .NET solution files using `dotnet sln list`.
 *
 * This module delegates solution parsing to the authoritative dotnet CLI,
 * supporting both legacy .sln and modern .slnx formats.
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import type { ILogger } from '../loggerService.js';

/**
 * Metadata for a project within a solution.
 */
export interface SolutionProject {
  /** Project file path (absolute, resolved from solution-relative) */
  path: string;

  /** Project file name (e.g., "MyApp.csproj") */
  name: string;
}

/**
 * Result of parsing a solution file.
 */
export interface SolutionParseResult {
  /** Solution file path */
  solutionPath: string;

  /** Array of projects in solution */
  projects: SolutionProject[];

  /** Format detected (sln or slnx) */
  format: 'sln' | 'slnx';
}

/**
 * Service interface for parsing solution files via dotnet CLI.
 */
export interface DotnetSolutionParser {
  /**
   * Parse solution file to extract project list using dotnet CLI.
   * @param solutionPath Absolute path to .sln or .slnx file
   * @returns Parsed solution with project paths
   * @throws If dotnet CLI fails or solution is invalid
   */
  parseSolution(solutionPath: string): Promise<SolutionParseResult>;
}

/**
 * Factory to create DotnetSolutionParser.
 */
export function createDotnetSolutionParser(logger: ILogger): DotnetSolutionParser {
  return new DotnetSolutionParserImpl(logger);
}

/**
 * Implementation of solution parsing via dotnet CLI.
 */
class DotnetSolutionParserImpl implements DotnetSolutionParser {
  /** CLI command timeout in milliseconds */
  private static readonly TIMEOUT_MS = 5000;

  /** Cache of parsed solutions keyed by absolute path */
  private readonly cache = new Map<string, SolutionParseResult>();

  constructor(private readonly logger: ILogger) {}

  async parseSolution(solutionPath: string): Promise<SolutionParseResult> {
    // Check cache first
    const cached = this.cache.get(solutionPath);
    if (cached) {
      this.logger.debug(`Using cached solution parse result for ${solutionPath}`);
      return cached;
    }

    this.logger.debug(`Parsing solution: ${solutionPath}`);

    // Execute dotnet sln list
    const output = await this.executeDotnetSlnList(solutionPath);

    // Parse output to extract project paths
    const projectPaths = this.parseProjectPaths(output);

    // Resolve solution-relative paths to absolute
    const solutionDir = path.dirname(solutionPath);
    const projects: SolutionProject[] = [];

    for (const relativePath of projectPaths) {
      const absolutePath = path.resolve(solutionDir, relativePath);

      // Validate project file exists
      try {
        await fs.access(absolutePath);
      } catch {
        this.logger.warn(`Project file not found, skipping: ${absolutePath}`);
        continue;
      }

      projects.push({
        path: absolutePath,
        name: path.basename(absolutePath),
      });
    }

    // Detect solution format
    const format = solutionPath.toLowerCase().endsWith('.slnx') ? 'slnx' : 'sln';

    const result: SolutionParseResult = {
      solutionPath,
      projects,
      format,
    };

    // Cache result
    this.cache.set(solutionPath, result);

    this.logger.info(`Parsed solution ${path.basename(solutionPath)} with ${projects.length} project(s)`);

    return result;
  }

  /**
   * Invalidate cached result for a solution file.
   * Called when solution file changes.
   */
  invalidateCache(solutionPath: string): void {
    this.cache.delete(solutionPath);
    this.logger.debug(`Invalidated cache for ${solutionPath}`);
  }

  /**
   * Execute `dotnet sln list` command and return stdout.
   */
  private async executeDotnetSlnList(solutionPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn('dotnet', ['sln', solutionPath, 'list'], {
        timeout: DotnetSolutionParserImpl.TIMEOUT_MS,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('error', error => {
        this.logger.error(`Failed to execute dotnet sln list: ${error.message}`);
        reject(new Error(`Failed to execute dotnet CLI: ${error.message}`));
      });

      proc.on('close', code => {
        if (code === 0) {
          resolve(stdout);
        } else {
          const errorMessage = stderr || `dotnet sln list exited with code ${code}`;
          this.logger.error(`dotnet sln list failed: ${errorMessage}`);
          reject(new Error(errorMessage));
        }
      });

      // Handle timeout
      setTimeout(() => {
        if (!proc.killed) {
          proc.kill();
          reject(new Error(`dotnet sln list timed out after ${DotnetSolutionParserImpl.TIMEOUT_MS}ms`));
        }
      }, DotnetSolutionParserImpl.TIMEOUT_MS);
    });
  }

  /**
   * Parse `dotnet sln list` output to extract project paths.
   *
   * Expected format:
   * ```
   * Project(s)
   * ----------
   * path/to/Project1.csproj
   * path/to/Project2.csproj
   * ```
   */
  private parseProjectPaths(output: string): string[] {
    const lines = output.split(/\r?\n/);
    const projectPaths: string[] = [];
    let headerPassed = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines
      if (!trimmed) {
        continue;
      }

      // Skip "Project(s)" header
      if (trimmed === 'Project(s)') {
        continue;
      }

      // Skip separator line
      if (/^-+$/.test(trimmed)) {
        headerPassed = true;
        continue;
      }

      // Collect project paths after header
      if (headerPassed && this.isProjectFile(trimmed)) {
        projectPaths.push(trimmed);
      }
    }

    return projectPaths;
  }

  /**
   * Check if a line represents a project file path.
   */
  private isProjectFile(line: string): boolean {
    const lower = line.toLowerCase();
    return lower.endsWith('.csproj') || lower.endsWith('.fsproj') || lower.endsWith('.vbproj');
  }
}
