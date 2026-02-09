/**
 * Unit tests for PackageOperationCommand (Template Method pattern).
 */

import { describe, test, expect, mock } from 'bun:test';
import {
  PackageOperationCommand,
  type ICancellationToken,
  type IProgressReporter,
  type ProjectOperationResult,
  type OperationSummary,
} from '../packageOperationCommand';
import type { PackageCliService } from '../../../services/cli/packageCliService';
import type { ILogger } from '../../../services/loggerService';
import type { DotnetProjectParser } from '../../../services/cli/dotnetProjectParser';

/**
 * Test implementation of PackageOperationCommand.
 */
class TestCommand extends PackageOperationCommand<{ id: string; projectPaths: string[] }> {
  protected getCommandName(): string {
    return 'Test command';
  }

  protected getLogContext(params: { id: string; projectPaths: string[] }): Record<string, any> {
    return {
      id: params.id,
      projectCount: params.projectPaths.length,
    };
  }

  protected validateParams(params: { id: string; projectPaths: string[] }): void {
    if (!params.id || params.id.trim().length === 0) {
      throw new Error('ID is required');
    }
    if (!params.projectPaths || params.projectPaths.length === 0) {
      throw new Error('At least one project must be selected');
    }
    for (const projectPath of params.projectPaths) {
      if (!projectPath.toLowerCase().endsWith('.csproj')) {
        throw new Error(`Invalid project file: ${projectPath} (must be .csproj)`);
      }
    }
  }

  protected getProgressTitle(params: { id: string; projectPaths: string[] }): string {
    return `Processing ${params.id}`;
  }

  protected getProjectMessage(
    params: { id: string; projectPaths: string[] },
    projectName: string,
    processedCount: number,
    totalCount: number,
  ): string {
    if (totalCount > 1) {
      return `Processing ${params.id} in ${projectName} (${processedCount}/${totalCount})...`;
    }
    return `Processing ${params.id} in ${projectName}...`;
  }

  protected async executeOnProject(
    params: { id: string; projectPaths: string[] },
    projectPath: string,
    token: ICancellationToken,
  ): Promise<ProjectOperationResult> {
    // Simulate successful operation
    return {
      projectPath,
      success: true,
    };
  }
}

/**
 * Test implementation that simulates failures.
 */
class FailingCommand extends TestCommand {
  protected override async executeOnProject(
    params: { id: string; projectPaths: string[] },
    projectPath: string,
    token: ICancellationToken,
  ): Promise<ProjectOperationResult> {
    return {
      projectPath,
      success: false,
      error: 'Simulated failure',
    };
  }
}

describe('PackageOperationCommand (Template Method)', () => {
  const createMocks = () => {
    const mockCli = {} as PackageCliService;
    const mockLogger = {
      info: mock(),
      warn: mock(),
      error: mock(),
      debug: mock(),
    } as unknown as ILogger;
    const mockParser = {
      invalidateCache: mock(),
    } as unknown as DotnetProjectParser;
    const mockProgress: IProgressReporter = {
      withProgress: async (options, task) => {
        const progress = { report: mock() };
        const token: ICancellationToken = { isCancellationRequested: false };
        return task(progress, token);
      },
    };
    const mockEventBus = {
      emit: mock(),
      on: mock(() => ({ dispose: mock() })),
      once: mock(() => ({ dispose: mock() })),
    };

    return { mockCli, mockLogger, mockParser, mockProgress, mockEventBus };
  };

  test('executes template method workflow successfully', async () => {
    const { mockCli, mockLogger, mockParser, mockProgress, mockEventBus } = createMocks();
    const command = new TestCommand(mockCli, mockLogger, mockProgress, mockEventBus as any, mockParser);

    const result = await command.execute({
      id: 'test-package',
      projectPaths: ['/path/to/project.csproj'],
    });

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.success).toBe(true);
    expect(result.results[0]!.projectPath).toBe('/path/to/project.csproj');
    expect(mockParser.invalidateCache).toHaveBeenCalledWith('/path/to/project.csproj');
  });

  test('deduplicates project paths', async () => {
    const { mockCli, mockLogger, mockParser, mockProgress, mockEventBus } = createMocks();
    const command = new TestCommand(mockCli, mockLogger, mockProgress, mockEventBus as any, mockParser);

    const result = await command.execute({
      id: 'test-package',
      projectPaths: [
        '/path/to/project.csproj',
        '/path/to/project.csproj', // Duplicate
        '/path/to/other.csproj',
      ],
    });

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(2); // Only 2 unique projects processed
    expect(mockLogger.warn).toHaveBeenCalledWith('Duplicate project paths detected, will de-duplicate', {
      original: 3,
      unique: 2,
    });
  });

  test('validates parameters and throws on empty ID', async () => {
    const { mockCli, mockLogger, mockParser, mockProgress, mockEventBus } = createMocks();
    const command = new TestCommand(mockCli, mockLogger, mockProgress, mockEventBus as any, mockParser);

    await expect(
      command.execute({
        id: '',
        projectPaths: ['/path/to/project.csproj'],
      }),
    ).rejects.toThrow('ID is required');
  });

  test('validates parameters and throws on empty project paths', async () => {
    const { mockCli, mockLogger, mockParser, mockProgress, mockEventBus } = createMocks();
    const command = new TestCommand(mockCli, mockLogger, mockProgress, mockEventBus as any, mockParser);

    await expect(
      command.execute({
        id: 'test-package',
        projectPaths: [],
      }),
    ).rejects.toThrow('At least one project must be selected');
  });

  test('validates parameters and throws on invalid project file extension', async () => {
    const { mockCli, mockLogger, mockParser, mockProgress, mockEventBus } = createMocks();
    const command = new TestCommand(mockCli, mockLogger, mockProgress, mockEventBus as any, mockParser);

    await expect(
      command.execute({
        id: 'test-package',
        projectPaths: ['/path/to/project.txt'],
      }),
    ).rejects.toThrow('Invalid project file: /path/to/project.txt (must be .csproj)');
  });

  test('handles operation failures', async () => {
    const { mockCli, mockLogger, mockParser, mockProgress, mockEventBus } = createMocks();
    const command = new FailingCommand(mockCli, mockLogger, mockProgress, mockEventBus as any, mockParser);

    const result = await command.execute({
      id: 'test-package',
      projectPaths: ['/path/to/project.csproj'],
    });

    expect(result.success).toBe(false);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.success).toBe(false);
    expect(result.results[0]!.error).toBe('Simulated failure');
    expect(mockLogger.error).toHaveBeenCalledWith('All operations failed', expect.any(Error));
  });

  test('handles partial success (some succeed, some fail)', async () => {
    const { mockCli, mockLogger, mockParser, mockProgress, mockEventBus } = createMocks();

    // Custom command that fails on second project
    class PartialFailCommand extends TestCommand {
      private callCount = 0;

      protected override async executeOnProject(
        params: { id: string; projectPaths: string[] },
        projectPath: string,
        token: ICancellationToken,
      ): Promise<ProjectOperationResult> {
        this.callCount++;
        if (this.callCount === 2) {
          return { projectPath, success: false, error: 'Second project failed' };
        }
        return { projectPath, success: true };
      }
    }

    const command = new PartialFailCommand(mockCli, mockLogger, mockProgress, mockEventBus as any, mockParser);

    const result = await command.execute({
      id: 'test-package',
      projectPaths: ['/path/to/project1.csproj', '/path/to/project2.csproj', '/path/to/project3.csproj'],
    });

    expect(result.success).toBe(true); // At least one succeeded
    expect(result.results).toHaveLength(3);
    expect(result.results.filter(r => r.success)).toHaveLength(2);
    expect(result.results.filter(r => !r.success)).toHaveLength(1);
    expect(mockLogger.warn).toHaveBeenCalledWith('Partial operation success', { successCount: 2, failureCount: 1 });
  });

  test('does not invalidate cache if no project parser provided', async () => {
    const { mockCli, mockLogger, mockProgress, mockEventBus } = createMocks();
    const command = new TestCommand(mockCli, mockLogger, mockProgress, mockEventBus as any); // No parser

    const result = await command.execute({
      id: 'test-package',
      projectPaths: ['/path/to/project.csproj'],
    });

    expect(result.success).toBe(true);
    // No assertion on invalidateCache since parser is undefined
  });

  test('invalidates cache only for successful projects', async () => {
    const { mockCli, mockLogger, mockParser, mockProgress, mockEventBus } = createMocks();

    class SelectiveFailCommand extends TestCommand {
      protected override async executeOnProject(
        params: { id: string; projectPaths: string[] },
        projectPath: string,
        token: ICancellationToken,
      ): Promise<ProjectOperationResult> {
        if (projectPath.includes('fail')) {
          return { projectPath, success: false, error: 'Intentional failure' };
        }
        return { projectPath, success: true };
      }
    }

    const command = new SelectiveFailCommand(mockCli, mockLogger, mockProgress, mockEventBus as any, mockParser);

    await command.execute({
      id: 'test-package',
      projectPaths: ['/path/to/success.csproj', '/path/to/fail.csproj'],
    });

    expect(mockParser.invalidateCache).toHaveBeenCalledTimes(1);
    expect(mockParser.invalidateCache).toHaveBeenCalledWith('/path/to/success.csproj');
  });

  test('processes multiple projects concurrently', async () => {
    const { mockCli, mockLogger, mockParser, mockProgress, mockEventBus } = createMocks();
    const command = new TestCommand(mockCli, mockLogger, mockProgress, mockEventBus as any, mockParser);

    const result = await command.execute({
      id: 'test-package',
      projectPaths: [
        '/path/to/project1.csproj',
        '/path/to/project2.csproj',
        '/path/to/project3.csproj',
        '/path/to/project4.csproj',
        '/path/to/project5.csproj',
      ],
    });

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(5);
    expect(result.results.every(r => r.success)).toBe(true);
    expect(mockParser.invalidateCache).toHaveBeenCalledTimes(5);
  });

  test('logs command invocation with context', async () => {
    const { mockCli, mockLogger, mockParser, mockProgress, mockEventBus } = createMocks();
    const command = new TestCommand(mockCli, mockLogger, mockProgress, mockEventBus as any, mockParser);

    await command.execute({
      id: 'test-package',
      projectPaths: ['/path/to/project.csproj'],
    });

    expect(mockLogger.info).toHaveBeenCalledWith('Test command invoked', {
      id: 'test-package',
      projectCount: 1,
    });
  });
});
