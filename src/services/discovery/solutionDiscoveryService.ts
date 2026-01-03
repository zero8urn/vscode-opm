/**
 * Service for discovering .NET solution files in the workspace.
 *
 * Scans workspace folders for .sln and .slnx files according to configured
 * depth settings, with exclusions for build artifacts and dependencies.
 */

import type * as vscode from 'vscode';
import * as path from 'node:path';
import type { ILogger } from '../loggerService.js';
import type { SolutionScanDepth } from '../configuration/solutionSettings.js';

/**
 * Metadata for a discovered solution file.
 */
export interface DiscoveredSolution {
  /** Absolute path to solution file */
  path: string;

  /** Solution file name (e.g., "MySolution.sln") */
  name: string;

  /** Workspace folder containing the solution */
  workspaceFolder: vscode.WorkspaceFolder;

  /** File type: sln or slnx */
  format: 'sln' | 'slnx';
}

/**
 * Service interface for solution file discovery.
 */
export interface SolutionDiscoveryService {
  /**
   * Scan workspace for solution files according to configured depth.
   * @returns Array of discovered solutions (may be empty)
   */
  discoverSolutions(): Promise<DiscoveredSolution[]>;

  /**
   * Check if a file path is a valid solution file.
   */
  isSolutionFile(path: string): boolean;
}

/**
 * Factory to create SolutionDiscoveryService with VS Code API dependencies.
 */
export function createSolutionDiscoveryService(
  workspace: typeof vscode.workspace,
  logger: ILogger,
): SolutionDiscoveryService {
  return new SolutionDiscoveryServiceImpl(workspace, logger);
}

/**
 * Implementation of solution file discovery.
 */
class SolutionDiscoveryServiceImpl implements SolutionDiscoveryService {
  /** Directories to exclude from solution file scanning */
  private static readonly EXCLUDE_PATTERNS = [
    '**/bin/**',
    '**/obj/**',
    '**/node_modules/**',
    '**/packages/**',
    '**/.git/**',
    '**/artifacts/**',
  ];

  constructor(private readonly workspace: typeof vscode.workspace, private readonly logger: ILogger) {}

  async discoverSolutions(): Promise<DiscoveredSolution[]> {
    try {
      // Read scan depth setting
      const config = this.workspace.getConfiguration('opm.discovery');
      const scanDepth = config.get<SolutionScanDepth>('solutionScanDepth', 'root-only');

      this.logger.debug(`Scanning for solution files with depth: ${scanDepth}`);

      // Build glob pattern based on scan depth
      const pattern = this.buildGlobPattern(scanDepth);
      const excludePattern = `{${SolutionDiscoveryServiceImpl.EXCLUDE_PATTERNS.join(',')}}`;

      // Find solution files
      const uris = await this.workspace.findFiles(pattern, excludePattern);

      this.logger.debug(`Found ${uris.length} solution file(s)`);

      // Map URIs to DiscoveredSolution objects
      const solutions: DiscoveredSolution[] = [];

      for (const uri of uris) {
        const workspaceFolder = this.workspace.getWorkspaceFolder(uri);

        if (!workspaceFolder) {
          this.logger.warn(`Solution file ${uri.fsPath} is not within a workspace folder, skipping`);
          continue;
        }

        const filePath = uri.fsPath;
        const fileName = path.basename(filePath);
        const format = this.getSolutionFormat(fileName);

        if (!format) {
          this.logger.warn(`Unknown solution file format: ${fileName}`);
          continue;
        }

        solutions.push({
          path: filePath,
          name: fileName,
          workspaceFolder,
          format,
        });
      }

      // Sort by workspace folder, then by name
      solutions.sort((a, b) => {
        const folderCompare = a.workspaceFolder.uri.fsPath.localeCompare(b.workspaceFolder.uri.fsPath);
        if (folderCompare !== 0) {
          return folderCompare;
        }
        return a.name.localeCompare(b.name);
      });

      this.logger.info(`Discovered ${solutions.length} solution(s)`);

      return solutions;
    } catch (error) {
      this.logger.error('Failed to discover solution files', error as Error);
      return [];
    }
  }

  isSolutionFile(filePath: string): boolean {
    const fileName = path.basename(filePath).toLowerCase();
    return fileName.endsWith('.sln') || fileName.endsWith('.slnx');
  }

  /**
   * Build glob pattern based on scan depth setting.
   */
  private buildGlobPattern(depth: SolutionScanDepth): string {
    switch (depth) {
      case 'root-only':
        return '*.{sln,slnx}';
      case 'recursive':
        return '**/*.{sln,slnx}';
      default:
        this.logger.warn(`Unknown scan depth: ${depth}, defaulting to root-only`);
        return '*.{sln,slnx}';
    }
  }

  /**
   * Extract solution format from file name.
   */
  private getSolutionFormat(fileName: string): 'sln' | 'slnx' | null {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.sln')) {
      return 'sln';
    }
    if (lower.endsWith('.slnx')) {
      return 'slnx';
    }
    return null;
  }
}
