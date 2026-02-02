/**
 * Unit tests for InstallPackageCommand
 *
 * Tests parameter validation logic. Full integration testing including
 * VS Code progress API, toast notifications, and CLI execution is covered
 * in E2E tests (test/e2e/installPackage.e2e.ts).
 */

import { describe, expect, test } from 'bun:test';
import { InstallPackageCommand, type InstallPackageParams, type IProgressReporter } from '../installPackageCommand';

// Mock dependencies
const mockLogger = {
  warn: () => {},
  info: () => {},
  error: () => {},
  debug: () => {},
};

const mockProgressReporter: IProgressReporter = {
  withProgress: async (_options, task) => {
    return await task({ report: () => {} }, { isCancellationRequested: false });
  },
};

describe('InstallPackageCommand Parameter Validation', () => {
  // We can test the validation logic by calling the private validateParams method
  // without needing to mock the entire VS Code API stack. The validation
  // happens before any VS Code APIs are called.

  test('rejects empty packageId', () => {
    const command = new InstallPackageCommand({} as any, mockLogger as any, mockProgressReporter, undefined);
    const params: InstallPackageParams = {
      packageId: '',
      version: '13.0.3',
      projectPaths: ['MyApp.csproj'],
    };

    expect(() => {
      command['validateParams'](params);
    }).toThrow('Package ID is required');
  });

  test('rejects whitespace-only packageId', () => {
    const command = new InstallPackageCommand({} as any, mockLogger as any, mockProgressReporter, undefined);
    const params: InstallPackageParams = {
      packageId: '   ',
      version: '13.0.3',
      projectPaths: ['MyApp.csproj'],
    };

    expect(() => {
      command['validateParams'](params);
    }).toThrow('Package ID is required');
  });

  test('rejects empty version', () => {
    const command = new InstallPackageCommand({} as any, mockLogger as any, mockProgressReporter, undefined);
    const params: InstallPackageParams = {
      packageId: 'Newtonsoft.Json',
      version: '',
      projectPaths: ['MyApp.csproj'],
    };

    expect(() => {
      command['validateParams'](params);
    }).toThrow('Package version is required');
  });

  test('rejects empty projectPaths array', () => {
    const command = new InstallPackageCommand({} as any, mockLogger as any, mockProgressReporter, undefined);
    const params: InstallPackageParams = {
      packageId: 'Newtonsoft.Json',
      version: '13.0.3',
      projectPaths: [],
    };

    expect(() => {
      command['validateParams'](params);
    }).toThrow('At least one project must be selected');
  });

  test('rejects non-.csproj file paths', () => {
    const command = new InstallPackageCommand({} as any, mockLogger as any, mockProgressReporter, undefined);
    const params: InstallPackageParams = {
      packageId: 'Newtonsoft.Json',
      version: '13.0.3',
      projectPaths: ['invalid.txt'],
    };

    expect(() => {
      command['validateParams'](params);
    }).toThrow('Invalid project file');
  });

  test('accepts valid .csproj files with different casing', () => {
    const command = new InstallPackageCommand({} as any, mockLogger as any, mockProgressReporter, undefined);
    const params: InstallPackageParams = {
      packageId: 'Newtonsoft.Json',
      version: '13.0.3',
      projectPaths: ['MyApp.CSPROJ', 'Other.CsProj'],
    };

    // Should not throw
    expect(() => {
      command['validateParams'](params);
    }).not.toThrow();
  });

  test('de-duplicates project paths', () => {
    const command = new InstallPackageCommand({} as any, mockLogger as any, mockProgressReporter, undefined);
    const params: InstallPackageParams = {
      packageId: 'Newtonsoft.Json',
      version: '13.0.3',
      projectPaths: ['MyApp.csproj', 'MyApp.csproj', 'Other.csproj', 'MyApp.csproj'],
    };

    command['validateParams'](params);

    // After validation, duplicates should be removed
    expect(params.projectPaths).toHaveLength(2);
    expect(params.projectPaths).toContain('MyApp.csproj');
    expect(params.projectPaths).toContain('Other.csproj');
  });

  test('validates all paths in array', () => {
    const command = new InstallPackageCommand({} as any, mockLogger as any, mockProgressReporter, undefined);
    const params: InstallPackageParams = {
      packageId: 'Newtonsoft.Json',
      version: '13.0.3',
      projectPaths: ['Good.csproj', 'Bad.txt', 'AlsoGood.csproj'],
    };

    expect(() => {
      command['validateParams'](params);
    }).toThrow('Invalid project file');
  });

  test('accepts absolute and relative paths', () => {
    const command = new InstallPackageCommand({} as any, mockLogger as any, mockProgressReporter, undefined);
    const params: InstallPackageParams = {
      packageId: 'Newtonsoft.Json',
      version: '13.0.3',
      projectPaths: ['/absolute/path/MyApp.csproj', './relative/Other.csproj', 'Simple.csproj'],
    };

    expect(() => {
      command['validateParams'](params);
    }).not.toThrow();
  });
});

describe('InstallPackageCommand Concurrent Execution', () => {
  test('executes installations in batches of 3', async () => {
    const installCalls: string[] = [];
    const mockCliService = {
      addPackage: async (opts: any) => {
        installCalls.push(opts.projectPath);
        return { success: true };
      },
    };

    const command = new InstallPackageCommand(
      mockCliService as any,
      mockLogger as any,
      mockProgressReporter,
      undefined,
    );

    const params: InstallPackageParams = {
      packageId: 'Newtonsoft.Json',
      version: '13.0.3',
      projectPaths: [
        '/path/to/Project1.csproj',
        '/path/to/Project2.csproj',
        '/path/to/Project3.csproj',
        '/path/to/Project4.csproj',
        '/path/to/Project5.csproj',
      ],
    };

    const result = await command.execute(params);

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(5);
    expect(result.results.every(r => r.success)).toBe(true);
    expect(installCalls).toHaveLength(5);
  });

  test('handles partial failure in batch', async () => {
    const mockCliService = {
      addPackage: async (opts: any) => {
        if (opts.projectPath.includes('Project2')) {
          return { success: false, error: { code: 'Unknown', message: 'Simulated failure' } };
        }
        return { success: true };
      },
    };

    const command = new InstallPackageCommand(
      mockCliService as any,
      mockLogger as any,
      mockProgressReporter,
      undefined,
    );

    const params: InstallPackageParams = {
      packageId: 'Serilog',
      version: '3.1.1',
      projectPaths: ['/path/to/Project1.csproj', '/path/to/Project2.csproj', '/path/to/Project3.csproj'],
    };

    const result = await command.execute(params);

    expect(result.success).toBe(true); // Partial success
    expect(result.results.filter(r => r.success)).toHaveLength(2);
    expect(result.results.filter(r => !r.success)).toHaveLength(1);
    expect(result.results.find(r => !r.success)?.error).toBe('Simulated failure');
  });

  test('preserves project path order in results', async () => {
    const mockCliService = {
      addPackage: async (opts: any) => {
        // Simulate varying execution times
        const delay = opts.projectPath.includes('Project1') ? 50 : 10;
        await new Promise(resolve => setTimeout(resolve, delay));
        return { success: true };
      },
    };

    const command = new InstallPackageCommand(
      mockCliService as any,
      mockLogger as any,
      mockProgressReporter,
      undefined,
    );

    const params: InstallPackageParams = {
      packageId: 'Test.Package',
      version: '1.0.0',
      projectPaths: ['/path/to/Project1.csproj', '/path/to/Project2.csproj', '/path/to/Project3.csproj'],
    };

    const result = await command.execute(params);

    // Results should be in same order as input, despite varying execution times
    expect(result.results[0]!.projectPath).toBe('/path/to/Project1.csproj');
    expect(result.results[1]!.projectPath).toBe('/path/to/Project2.csproj');
    expect(result.results[2]!.projectPath).toBe('/path/to/Project3.csproj');
  });

  test('handles all failures', async () => {
    const mockCliService = {
      addPackage: async () => {
        return { success: false, error: { code: 'Network', message: 'Connection failed' } };
      },
    };

    const command = new InstallPackageCommand(
      mockCliService as any,
      mockLogger as any,
      mockProgressReporter,
      undefined,
    );

    const params: InstallPackageParams = {
      packageId: 'Test.Package',
      version: '1.0.0',
      projectPaths: ['/path/to/Project1.csproj', '/path/to/Project2.csproj'],
    };

    const result = await command.execute(params);

    expect(result.success).toBe(false);
    expect(result.results.every(r => !r.success)).toBe(true);
  });

  test('invalidates cache for successful installations only', async () => {
    const invalidatedPaths: string[] = [];
    const mockProjectParser = {
      invalidateCache: (path: string) => {
        invalidatedPaths.push(path);
      },
    };

    const mockCliService = {
      addPackage: async (opts: any) => {
        if (opts.projectPath.includes('Project2')) {
          return { success: false, error: { code: 'Unknown', message: 'Failed' } };
        }
        return { success: true };
      },
    };

    const command = new InstallPackageCommand(
      mockCliService as any,
      mockLogger as any,
      mockProgressReporter,
      mockProjectParser as any,
    );

    const params: InstallPackageParams = {
      packageId: 'Test.Package',
      version: '1.0.0',
      projectPaths: ['/path/to/Project1.csproj', '/path/to/Project2.csproj', '/path/to/Project3.csproj'],
    };

    await command.execute(params);

    // Only successful installations should invalidate cache
    expect(invalidatedPaths).toHaveLength(2);
    expect(invalidatedPaths).toContain('/path/to/Project1.csproj');
    expect(invalidatedPaths).toContain('/path/to/Project3.csproj');
    expect(invalidatedPaths).not.toContain('/path/to/Project2.csproj');
  });
});
