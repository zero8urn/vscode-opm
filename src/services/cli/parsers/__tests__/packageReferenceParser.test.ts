/**
 * Unit tests for packageReferenceParser
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { createPackageReferenceParser } from '../packageReferenceParser';
import type { DotnetCliExecutor } from '../../dotnetCliExecutor';
import type { ILogger } from '../../../loggerService';
import { ProjectParseErrorCode } from '../../types/projectMetadata';

// Mock logger
const createMockLogger = (): ILogger => ({
  debug: mock(() => {}),
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
  show: mock(() => {}),
  isDebugEnabled: () => false,
  dispose: () => {},
});

// Mock CLI executor
const createMockCliExecutor = (stdout: string, exitCode = 0, stderr = ''): DotnetCliExecutor => ({
  execute: mock(async () => ({
    exitCode,
    stdout,
    stderr,
    timedOut: false,
  })),
  isDotnetAvailable: mock(async () => true),
  getDotnetVersion: mock(async () => '8.0.100'),
});

const samplePackageListJson = JSON.stringify({
  version: 1,
  parameters: '',
  projects: [
    {
      path: '/path/to/project.csproj',
      frameworks: [
        {
          framework: 'net8.0',
          topLevelPackages: [
            {
              id: 'Newtonsoft.Json',
              requestedVersion: '13.0.3',
              resolvedVersion: '13.0.3',
            },
            {
              id: 'Serilog',
              requestedVersion: '3.1.0',
              resolvedVersion: '3.1.1',
            },
          ],
        },
      ],
    },
  ],
});

const multiTargetPackageListJson = JSON.stringify({
  version: 1,
  parameters: '',
  projects: [
    {
      path: '/path/to/project.csproj',
      frameworks: [
        {
          framework: 'net6.0',
          topLevelPackages: [
            {
              id: 'Newtonsoft.Json',
              requestedVersion: '13.0.1',
              resolvedVersion: '13.0.1',
            },
          ],
        },
        {
          framework: 'net8.0',
          topLevelPackages: [
            {
              id: 'Newtonsoft.Json',
              requestedVersion: '13.0.3',
              resolvedVersion: '13.0.3',
            },
            {
              id: 'Serilog',
              requestedVersion: '3.1.0',
              resolvedVersion: '3.1.1',
            },
          ],
        },
      ],
    },
  ],
});

describe('packageReferenceParser', () => {
  let logger: ILogger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  describe('parsePackageReferences', () => {
    it('should parse package references from JSON output', async () => {
      const cliExecutor = createMockCliExecutor(samplePackageListJson);
      const parser = createPackageReferenceParser(cliExecutor, logger);

      const result = await parser.parsePackageReferences('/path/to/project.csproj');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'Newtonsoft.Json',
        requestedVersion: '13.0.3',
        resolvedVersion: '13.0.3',
        targetFramework: 'net8.0',
        isTransitive: false,
      });
      expect(result[1]).toEqual({
        id: 'Serilog',
        requestedVersion: '3.1.0',
        resolvedVersion: '3.1.1',
        targetFramework: 'net8.0',
        isTransitive: false,
      });
    });

    it('should aggregate packages across frameworks using highest version', async () => {
      const cliExecutor = createMockCliExecutor(multiTargetPackageListJson);
      const parser = createPackageReferenceParser(cliExecutor, logger);

      const result = await parser.parsePackageReferences('/path/to/project.csproj');

      // Should have 2 packages: Newtonsoft.Json (highest version) and Serilog
      expect(result).toHaveLength(2);

      const newtonsoftJson = result.find(p => p.id === 'Newtonsoft.Json');
      expect(newtonsoftJson).toBeDefined();
      expect(newtonsoftJson?.resolvedVersion).toBe('13.0.3'); // Highest version

      const serilog = result.find(p => p.id === 'Serilog');
      expect(serilog).toBeDefined();
    });

    it('should return empty array when no packages installed', async () => {
      const emptyJson = JSON.stringify({
        version: 1,
        parameters: '',
        projects: [
          {
            path: '/path/to/project.csproj',
            frameworks: [
              {
                framework: 'net8.0',
                topLevelPackages: [],
              },
            ],
          },
        ],
      });
      const cliExecutor = createMockCliExecutor(emptyJson);
      const parser = createPackageReferenceParser(cliExecutor, logger);

      const result = await parser.parsePackageReferences('/path/to/project.csproj');

      expect(result).toHaveLength(0);
    });

    it('should throw error for packages.config projects', async () => {
      const cliExecutor = createMockCliExecutor('', 1, 'packages.config format is not supported');
      const parser = createPackageReferenceParser(cliExecutor, logger);

      await expect(parser.parsePackageReferences('/path/to/project.csproj')).rejects.toThrow();
    });

    it('should return empty array on CLI failure (non-packages.config)', async () => {
      const cliExecutor = createMockCliExecutor('', 1, 'Some other error');
      const parser = createPackageReferenceParser(cliExecutor, logger);

      const result = await parser.parsePackageReferences('/path/to/project.csproj');

      expect(result).toHaveLength(0);
    });

    it('should return empty array on JSON parse failure', async () => {
      const cliExecutor = createMockCliExecutor('invalid json {{{');
      const parser = createPackageReferenceParser(cliExecutor, logger);

      const result = await parser.parsePackageReferences('/path/to/project.csproj');

      expect(result).toHaveLength(0);
    });

    it('should return empty array on timeout', async () => {
      const cliExecutor: DotnetCliExecutor = {
        execute: mock(async () => ({
          exitCode: -1,
          stdout: '',
          stderr: '',
          timedOut: true,
        })),
        isDotnetAvailable: mock(async () => true),
        getDotnetVersion: mock(async () => '8.0.100'),
      };
      const parser = createPackageReferenceParser(cliExecutor, logger);

      const result = await parser.parsePackageReferences('/path/to/project.csproj');

      expect(result).toHaveLength(0);
    });
  });
});
