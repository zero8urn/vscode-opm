/**
 * Central service to manage solution context for package browser.
 *
 * This service orchestrates solution discovery and CLI parsing asynchronously
 * when the package browser opens, making solution/project data available for
 * package details card display.
 */

import type * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { ILogger } from '../loggerService.js';
import type { SolutionDiscoveryService, DiscoveredSolution } from '../discovery/solutionDiscoveryService.js';
import type { DotnetSolutionParser, SolutionProject } from '../cli/dotnetSolutionParser.js';

/**
 * Current solution context state.
 */
export interface SolutionContext {
  /** Active solution (null if workspace-wide discovery) */
  solution: DiscoveredSolution | null;

  /** Projects scoped to active solution (or all discovered projects) */
  projects: SolutionProject[];

  /** Discovery mode: 'solution' | 'workspace' | 'none' */
  mode: 'solution' | 'workspace' | 'none';
}

/**
 * Service interface for solution context management.
 */
export interface SolutionContextService extends vscode.Disposable {
  /**
   * Get current solution context (synchronous).
   * Returns the last discovered state, or default state if discovery hasn't run.
   */
  getContext(): SolutionContext;

  /**
   * Trigger asynchronous solution discovery.
   * Does not block; discovery runs in background and updates context.
   * Called when package browser opens.
   */
  discoverAsync(): Promise<void>;

  /**
   * Wait for any in-progress discovery to complete.
   * Resolves immediately if no discovery is running.
   */
  waitForDiscovery(): Promise<void>;
}

/**
 * Factory to create SolutionContextService with VS Code API dependencies.
 */
export function createSolutionContextService(
  workspace: typeof vscode.workspace,
  logger: ILogger,
  discoveryService: SolutionDiscoveryService,
  solutionParser: DotnetSolutionParser,
): SolutionContextService {
  return new SolutionContextServiceImpl(workspace, logger, discoveryService, solutionParser);
}

/**
 * Implementation of solution context service.
 */
class SolutionContextServiceImpl implements SolutionContextService {
  /** Current context state */
  private context: SolutionContext = {
    solution: null,
    projects: [],
    mode: 'none',
  };

  /** Promise tracking current discovery operation */
  private discoveryPromise: Promise<void> | null = null;

  constructor(
    private readonly workspace: typeof vscode.workspace,
    private readonly logger: ILogger,
    private readonly discoveryService: SolutionDiscoveryService,
    private readonly solutionParser: DotnetSolutionParser,
  ) {}

  getContext(): SolutionContext {
    return { ...this.context };
  }

  waitForDiscovery(): Promise<void> {
    return this.discoveryPromise ?? Promise.resolve();
  }

  async discoverAsync(): Promise<void> {
    // Store promise so waitForDiscovery can await it
    this.discoveryPromise = this.doDiscovery();
    try {
      await this.discoveryPromise;
    } finally {
      this.discoveryPromise = null;
    }
  }

  private async doDiscovery(): Promise<void> {
    this.logger.info('Starting async solution discovery');

    try {
      const solutions = await this.discoveryService.discoverSolutions();

      if (solutions.length === 1) {
        // Auto-select single solution
        const solution = solutions[0];
        if (solution) {
          this.logger.info(`Auto-selecting single solution: ${solution.name}`);
          await this.activateSolution(solution.path);
        }
      } else if (solutions.length === 0) {
        // No solutions found - fall back to workspace mode
        this.logger.info('No solutions found, entering workspace mode');
        this.context = { solution: null, projects: [], mode: 'workspace' };
      } else {
        // Multiple solutions found - fall back to workspace mode
        this.logger.info(`Multiple solutions found (${solutions.length}), falling back to workspace mode`);
        this.context = { solution: null, projects: [], mode: 'workspace' };
      }

      this.logger.info(
        `Solution discovery completed: mode=${this.context.mode}, projects=${this.context.projects.length}`,
      );
    } catch (error) {
      this.logger.error('Failed to discover solutions', error as Error);
      this.context = { solution: null, projects: [], mode: 'none' };
    }
  }

  dispose(): void {
    this.logger.debug('Disposing solution context service');
    // No resources to clean up in simplified version
  }

  /**
   * Activate a specific solution file.
   */
  private async activateSolution(solutionPath: string): Promise<void> {
    // Validate solution file exists
    try {
      await fs.access(solutionPath);
    } catch {
      throw new Error(`Solution file not found: ${solutionPath}`);
    }

    // Validate it's a solution file
    if (!this.discoveryService.isSolutionFile(solutionPath)) {
      throw new Error(`Not a valid solution file: ${solutionPath}`);
    }

    // Parse solution to extract projects
    const parseResult = await this.solutionParser.parseSolution(solutionPath);

    // Find workspace folder containing the solution
    const workspaceFolders = this.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error('No workspace folder found');
    }

    const firstFolder = workspaceFolders[0];
    if (!firstFolder) {
      throw new Error('No workspace folder found');
    }

    const workspaceFolder = this.workspace.getWorkspaceFolder(firstFolder.uri);
    if (!workspaceFolder) {
      throw new Error('No workspace folder found');
    }

    // Create DiscoveredSolution object
    const solution: DiscoveredSolution = {
      path: solutionPath,
      name: path.basename(solutionPath),
      workspaceFolder,
      format: parseResult.format,
    };

    // Set context
    this.context = {
      solution,
      projects: parseResult.projects,
      mode: 'solution',
    };
  }
}
