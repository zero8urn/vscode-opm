/**
 * Unit tests for targetFrameworkParser
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { createTargetFrameworkParser } from '../targetFrameworkParser';
import type { DotnetCliExecutor } from '../../dotnetCliExecutor';
import type { ILogger } from '../../../loggerService';

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
const createMockCliExecutor = (stdout: string, exitCode = 0): DotnetCliExecutor => ({
  execute: mock(async () => ({
    exitCode,
    stdout,
    stderr: '',
    timedOut: false,
  })),
  isDotnetAvailable: mock(async () => true),
  getDotnetVersion: mock(async () => '8.0.100'),
});

describe('targetFrameworkParser', () => {
  let logger: ILogger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  describe('parseTargetFrameworks', () => {
    it('should parse single target framework from JSON', async () => {
      const jsonOutput = JSON.stringify({
        Properties: {
          TargetFramework: 'net8.0',
          TargetFrameworks: '',
        },
      });
      const cliExecutor = createMockCliExecutor(jsonOutput);
      const parser = createTargetFrameworkParser(cliExecutor, logger);

      const result = await parser.parseTargetFrameworks('/path/to/project.csproj');

      expect(result).toBe('net8.0');
    });

    it('should parse multi-targeting frameworks from JSON', async () => {
      const jsonOutput = JSON.stringify({
        Properties: {
          TargetFramework: '',
          TargetFrameworks: 'net6.0;net7.0;net8.0',
        },
      });
      const cliExecutor = createMockCliExecutor(jsonOutput);
      const parser = createTargetFrameworkParser(cliExecutor, logger);

      const result = await parser.parseTargetFrameworks('/path/to/project.csproj');

      expect(result).toEqual(['net6.0', 'net7.0', 'net8.0']);
    });

    it('should parse single target framework from legacy format', async () => {
      const cliExecutor = createMockCliExecutor('TargetFramework=net8.0\n');
      const parser = createTargetFrameworkParser(cliExecutor, logger);

      const result = await parser.parseTargetFrameworks('/path/to/project.csproj');

      expect(result).toBe('net8.0');
    });

    it('should parse multi-targeting frameworks as array', async () => {
      const cliExecutor = createMockCliExecutor('TargetFrameworks=net6.0;net7.0;net8.0\n');
      const parser = createTargetFrameworkParser(cliExecutor, logger);

      const result = await parser.parseTargetFrameworks('/path/to/project.csproj');

      expect(result).toEqual(['net6.0', 'net7.0', 'net8.0']);
    });

    it('should return single string for multi-targeting with only one framework', async () => {
      const cliExecutor = createMockCliExecutor('TargetFrameworks=net8.0\n');
      const parser = createTargetFrameworkParser(cliExecutor, logger);

      const result = await parser.parseTargetFrameworks('/path/to/project.csproj');

      expect(result).toBe('net8.0');
    });

    it('should prioritize TargetFrameworks over TargetFramework', async () => {
      const cliExecutor = createMockCliExecutor('TargetFramework=net6.0\nTargetFrameworks=net7.0;net8.0\n');
      const parser = createTargetFrameworkParser(cliExecutor, logger);

      const result = await parser.parseTargetFrameworks('/path/to/project.csproj');

      expect(result).toEqual(['net7.0', 'net8.0']);
    });

    it('should handle whitespace in framework values', async () => {
      const cliExecutor = createMockCliExecutor('TargetFrameworks= net6.0 ; net7.0 ; net8.0 \n');
      const parser = createTargetFrameworkParser(cliExecutor, logger);

      const result = await parser.parseTargetFrameworks('/path/to/project.csproj');

      expect(result).toEqual(['net6.0', 'net7.0', 'net8.0']);
    });

    it('should return null when no target framework defined', async () => {
      const cliExecutor = createMockCliExecutor('TargetFramework=\n');
      const parser = createTargetFrameworkParser(cliExecutor, logger);

      const result = await parser.parseTargetFrameworks('/path/to/project.csproj');

      expect(result).toBeNull();
    });

    it('should return null on CLI failure', async () => {
      const cliExecutor = createMockCliExecutor('', 1);
      const parser = createTargetFrameworkParser(cliExecutor, logger);

      const result = await parser.parseTargetFrameworks('/path/to/project.csproj');

      expect(result).toBeNull();
    });

    it('should return null on timeout', async () => {
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
      const parser = createTargetFrameworkParser(cliExecutor, logger);

      const result = await parser.parseTargetFrameworks('/path/to/project.csproj');

      expect(result).toBeNull();
    });

    it('should filter empty frameworks from multi-targeting', async () => {
      const cliExecutor = createMockCliExecutor('TargetFrameworks=net6.0;;net8.0;\n');
      const parser = createTargetFrameworkParser(cliExecutor, logger);

      const result = await parser.parseTargetFrameworks('/path/to/project.csproj');

      expect(result).toEqual(['net6.0', 'net8.0']);
    });
  });
});
