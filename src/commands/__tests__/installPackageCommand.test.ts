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
    const command = new InstallPackageCommand({} as any, mockLogger as any, mockProgressReporter);
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
    const command = new InstallPackageCommand({} as any, mockLogger as any, mockProgressReporter);
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
    const command = new InstallPackageCommand({} as any, mockLogger as any, mockProgressReporter);
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
    const command = new InstallPackageCommand({} as any, mockLogger as any, mockProgressReporter);
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
    const command = new InstallPackageCommand({} as any, mockLogger as any, mockProgressReporter);
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
    const command = new InstallPackageCommand({} as any, mockLogger as any, mockProgressReporter);
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
    const command = new InstallPackageCommand({} as any, mockLogger as any, mockProgressReporter);
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
    const command = new InstallPackageCommand({} as any, mockLogger as any, mockProgressReporter);
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
    const command = new InstallPackageCommand({} as any, mockLogger as any, mockProgressReporter);
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
