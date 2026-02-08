/**
 * Unit tests for UninstallPackageCommand
 *
 * Tests parameter validation, command orchestration, and error handling logic.
 * Full integration testing including VS Code progress API, toast notifications,
 * and CLI execution is covered in E2E tests (test/e2e/uninstallPackage.e2e.ts).
 */

import { describe, expect, test, mock } from 'bun:test';
import { UninstallPackageCommand, type UninstallPackageParams } from '../uninstallPackageCommand';
import type { IProgressReporter } from '../base/packageOperationCommand';
import { PackageOperationErrorCode } from '../../services/cli/types/packageOperation';

// Mock dependencies
const mockLogger = {
  warn: mock(() => {}),
  info: mock(() => {}),
  error: mock(() => {}),
  debug: mock(() => {}),
};

const mockProgressReporter: IProgressReporter = {
  withProgress: async (_options: any, task: any) => {
    return await task({ report: () => {} }, { isCancellationRequested: false });
  },
};

const mockEventBus = {
  emit: () => {},
  on: () => ({ dispose: () => {} }),
  once: () => ({ dispose: () => {} }),
};

// Mock project parser (optional parameter, most tests don't need it)
const mockProjectParser = {
  invalidateCache: mock(() => {}),
};

describe('UninstallPackageCommand Parameter Validation', () => {
  test('rejects empty packageId', () => {
    const command = new UninstallPackageCommand(
      {} as any,
      mockLogger as any,
      mockProgressReporter,
      mockEventBus as any,
    );
    const params: UninstallPackageParams = {
      packageId: '',
      projectPaths: ['MyApp.csproj'],
    };

    expect(() => {
      command['validateParams'](params);
    }).toThrow('Package ID is required');
  });

  test('rejects whitespace-only packageId', () => {
    const command = new UninstallPackageCommand(
      {} as any,
      mockLogger as any,
      mockProgressReporter,
      mockEventBus as any,
    );
    const params: UninstallPackageParams = {
      packageId: '   ',
      projectPaths: ['MyApp.csproj'],
    };

    expect(() => {
      command['validateParams'](params);
    }).toThrow('Package ID is required');
  });

  test('rejects empty projectPaths array', () => {
    const command = new UninstallPackageCommand(
      {} as any,
      mockLogger as any,
      mockProgressReporter,
      mockEventBus as any,
    );
    const params: UninstallPackageParams = {
      packageId: 'Newtonsoft.Json',
      projectPaths: [],
    };

    expect(() => {
      command['validateParams'](params);
    }).toThrow('At least one project must be selected');
  });

  test('rejects non-.csproj file paths', () => {
    const command = new UninstallPackageCommand(
      {} as any,
      mockLogger as any,
      mockProgressReporter,
      mockEventBus as any,
    );
    const params: UninstallPackageParams = {
      packageId: 'Newtonsoft.Json',
      projectPaths: ['invalid.txt'],
    };

    expect(() => {
      command['validateParams'](params);
    }).toThrow('Invalid project file');
  });

  test('accepts valid .csproj files with different casing', () => {
    const command = new UninstallPackageCommand(
      {} as any,
      mockLogger as any,
      mockProgressReporter,
      mockEventBus as any,
    );
    const params: UninstallPackageParams = {
      packageId: 'Newtonsoft.Json',
      projectPaths: ['MyApp.CSPROJ', 'Other.CsProj'],
    };

    // Should not throw
    expect(() => {
      command['validateParams'](params);
    }).not.toThrow();
  });

  test('de-duplicates project paths', async () => {
    const command = new UninstallPackageCommand(
      {} as any,
      mockLogger as any,
      mockProgressReporter,
      mockEventBus as any,
    );
    const params: UninstallPackageParams = {
      packageId: 'Newtonsoft.Json',
      projectPaths: ['MyApp.csproj', 'MyApp.csproj', 'Other.csproj', 'MyApp.csproj'],
    };

    const result = await command.execute(params);

    // After execution, duplicates should have been processed only once
    // The base class handles deduplication
    expect(result.results).toHaveLength(2);
  });

  test('validates all paths in array', () => {
    const command = new UninstallPackageCommand(
      {} as any,
      mockLogger as any,
      mockProgressReporter,
      mockEventBus as any,
    );
    const params: UninstallPackageParams = {
      packageId: 'Newtonsoft.Json',
      projectPaths: ['Good.csproj', 'Bad.txt', 'AlsoGood.csproj'],
    };

    expect(() => {
      command['validateParams'](params);
    }).toThrow('Invalid project file');
  });

  test('accepts absolute and relative paths', () => {
    const command = new UninstallPackageCommand(
      {} as any,
      mockLogger as any,
      mockProgressReporter,
      mockEventBus as any,
    );
    const params: UninstallPackageParams = {
      packageId: 'Newtonsoft.Json',
      projectPaths: ['/absolute/path/MyApp.csproj', './relative/Other.csproj', 'Simple.csproj'],
    };

    expect(() => {
      command['validateParams'](params);
    }).not.toThrow();
  });
});

describe('UninstallPackageCommand Execution', () => {
  test('calls removePackage with correct parameters for single project', async () => {
    const mockRemovePackage = mock(async () => ({
      success: true,
      exitCode: 0,
      stdout: '',
      stderr: '',
    }));

    const mockPackageCliService = {
      removePackage: mockRemovePackage,
    };

    const command = new UninstallPackageCommand(
      mockPackageCliService as any,
      mockLogger as any,
      mockProgressReporter,
      mockEventBus as any,
    );

    const result = await command.execute({
      packageId: 'Newtonsoft.Json',
      projectPaths: ['MyApp.csproj'],
    });

    expect(mockRemovePackage).toHaveBeenCalledTimes(1);
    expect(mockRemovePackage).toHaveBeenCalledWith({
      packageId: 'Newtonsoft.Json',
      projectPath: 'MyApp.csproj',
    });
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.success).toBe(true);
  });

  test('handles removePackage failure correctly', async () => {
    const mockRemovePackage = mock(async () => ({
      success: false,
      error: {
        code: PackageOperationErrorCode.PackageNotFoundInProject,
        message: 'Package not found in project',
      },
    }));

    const mockPackageCliService = {
      removePackage: mockRemovePackage,
    };

    const command = new UninstallPackageCommand(
      mockPackageCliService as any,
      mockLogger as any,
      mockProgressReporter,
      mockEventBus as any,
    );

    const result = await command.execute({
      packageId: 'Newtonsoft.Json',
      projectPaths: ['MyApp.csproj'],
    });

    expect(result.success).toBe(false);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.success).toBe(false);
    expect(result.results[0]!.error).toContain('Package not found in project');
  });

  test('handles partial failure in multi-project uninstall', async () => {
    const mockRemovePackage = mock(async ({ projectPath }) => {
      if (projectPath === 'App2.csproj') {
        return {
          success: false,
          error: {
            code: PackageOperationErrorCode.DependencyConflict,
            message: 'Package is required by: PackageA, PackageB',
          },
        };
      }
      return {
        success: true,
        exitCode: 0,
        stdout: '',
        stderr: '',
      };
    });

    const mockPackageCliService = {
      removePackage: mockRemovePackage,
    };

    const command = new UninstallPackageCommand(
      mockPackageCliService as any,
      mockLogger as any,
      mockProgressReporter,
      mockEventBus as any,
    );

    const result = await command.execute({
      packageId: 'Test',
      projectPaths: ['App1.csproj', 'App2.csproj', 'App3.csproj'],
    });

    expect(result.success).toBe(true); // At least one succeeded
    expect(result.results).toHaveLength(3);
    expect(result.results[0]!.success).toBe(true);
    expect(result.results[1]!.success).toBe(false);
    expect(result.results[1]!.error).toContain('Package is required by');
    expect(result.results[2]!.success).toBe(true);
  });

  test('handles exception during uninstall', async () => {
    const mockRemovePackage = mock(async () => {
      throw new Error('Network failure');
    });

    const mockPackageCliService = {
      removePackage: mockRemovePackage,
    };

    const command = new UninstallPackageCommand(
      mockPackageCliService as any,
      mockLogger as any,
      mockProgressReporter,
      mockEventBus as any,
    );

    const result = await command.execute({
      packageId: 'Newtonsoft.Json',
      projectPaths: ['MyApp.csproj'],
    });

    expect(result.success).toBe(false);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.success).toBe(false);
    expect(result.results[0]!.error).toContain('Network failure');
  });

  test('logs uninstall start, per-project results, and completion', async () => {
    const mockRemovePackage = mock(async () => ({
      success: true,
      exitCode: 0,
      stdout: '',
      stderr: '',
    }));

    const mockPackageCliService = {
      removePackage: mockRemovePackage,
    };

    mockLogger.info.mockClear();

    const command = new UninstallPackageCommand(
      mockPackageCliService as any,
      mockLogger as any,
      mockProgressReporter,
      mockEventBus as any,
    );

    await command.execute({
      packageId: 'Newtonsoft.Json',
      projectPaths: ['MyApp.csproj'],
    });

    // Verify logger.info was called
    expect(mockLogger.info).toHaveBeenCalled();
    const infoCalls = mockLogger.info.mock.calls.map((call: any) => call[0]);
    expect(infoCalls.some((msg: string) => msg.includes('Uninstall package command invoked'))).toBe(true);
    expect(infoCalls.some((msg: string) => msg.includes('Uninstalling'))).toBe(true);
  });

  test('returns overall success when all projects succeed', async () => {
    const mockRemovePackage = mock(async () => ({
      success: true,
      exitCode: 0,
      stdout: '',
      stderr: '',
    }));

    const mockPackageCliService = {
      removePackage: mockRemovePackage,
    };

    const command = new UninstallPackageCommand(
      mockPackageCliService as any,
      mockLogger as any,
      mockProgressReporter,
      mockEventBus as any,
    );

    const result = await command.execute({
      packageId: 'Newtonsoft.Json',
      projectPaths: ['App1.csproj', 'App2.csproj'],
    });

    expect(result.success).toBe(true);
    expect(result.results.every(r => r.success)).toBe(true);
  });

  test('returns overall failure when all projects fail', async () => {
    const mockRemovePackage = mock(async () => ({
      success: false,
      error: {
        code: PackageOperationErrorCode.CliError,
        message: 'Failed',
      },
    }));

    const mockPackageCliService = {
      removePackage: mockRemovePackage,
    };

    const command = new UninstallPackageCommand(
      mockPackageCliService as any,
      mockLogger as any,
      mockProgressReporter,
      mockEventBus as any,
    );

    const result = await command.execute({
      packageId: 'Newtonsoft.Json',
      projectPaths: ['App1.csproj', 'App2.csproj'],
    });

    expect(result.success).toBe(false);
    expect(result.results.every(r => !r.success)).toBe(true);
  });

  test('invalidates cache for successfully uninstalled projects', async () => {
    const mockRemovePackage = mock(async () => ({
      success: true,
      exitCode: 0,
      stdout: '',
      stderr: '',
    }));

    const mockPackageCliService = {
      removePackage: mockRemovePackage,
    };

    mockProjectParser.invalidateCache.mockClear();

    const command = new UninstallPackageCommand(
      mockPackageCliService as any,
      mockLogger as any,
      mockProgressReporter,
      mockEventBus as any,
      mockProjectParser as any,
    );

    await command.execute({
      packageId: 'Newtonsoft.Json',
      projectPaths: ['App1.csproj', 'App2.csproj'],
    });

    // Verify cache was invalidated for both projects
    expect(mockProjectParser.invalidateCache).toHaveBeenCalledTimes(2);
    expect(mockProjectParser.invalidateCache).toHaveBeenCalledWith('App1.csproj');
    expect(mockProjectParser.invalidateCache).toHaveBeenCalledWith('App2.csproj');
  });

  test('only invalidates cache for successful uninstalls in partial failure', async () => {
    const mockRemovePackage = mock(async ({ projectPath }) => {
      if (projectPath === 'App2.csproj') {
        return {
          success: false,
          error: {
            code: PackageOperationErrorCode.PackageNotFoundInProject,
            message: 'Not found',
          },
        };
      }
      return {
        success: true,
        exitCode: 0,
        stdout: '',
        stderr: '',
      };
    });

    const mockPackageCliService = {
      removePackage: mockRemovePackage,
    };

    mockProjectParser.invalidateCache.mockClear();

    const command = new UninstallPackageCommand(
      mockPackageCliService as any,
      mockLogger as any,
      mockProgressReporter,
      mockEventBus as any,
      mockProjectParser as any,
    );

    await command.execute({
      packageId: 'Test',
      projectPaths: ['App1.csproj', 'App2.csproj', 'App3.csproj'],
    });

    // Only App1 and App3 succeeded, so only 2 cache invalidations
    expect(mockProjectParser.invalidateCache).toHaveBeenCalledTimes(2);
    expect(mockProjectParser.invalidateCache).toHaveBeenCalledWith('App1.csproj');
    expect(mockProjectParser.invalidateCache).toHaveBeenCalledWith('App3.csproj');
    expect(mockProjectParser.invalidateCache).not.toHaveBeenCalledWith('App2.csproj');
  });

  test('does not crash when projectParser is undefined', async () => {
    const mockRemovePackage = mock(async () => ({
      success: true,
      exitCode: 0,
      stdout: '',
      stderr: '',
    }));

    const mockPackageCliService = {
      removePackage: mockRemovePackage,
    };

    const command = new UninstallPackageCommand(
      mockPackageCliService as any,
      mockLogger as any,
      mockProgressReporter,
      mockEventBus as any,
    );

    const result = await command.execute({
      packageId: 'Newtonsoft.Json',
      projectPaths: ['MyApp.csproj'],
    });

    // Should complete successfully without crashing
    expect(result.success).toBe(true);
  });
});
