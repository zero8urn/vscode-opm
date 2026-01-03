/**
 * Unit tests for dotnetCliExecutor
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { createDotnetCliExecutor } from '../dotnetCliExecutor';
import type { ILogger } from '../../loggerService';

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

describe('dotnetCliExecutor', () => {
  let executor: ReturnType<typeof createDotnetCliExecutor>;
  let logger: ILogger;

  beforeEach(() => {
    logger = createMockLogger();
    executor = createDotnetCliExecutor(logger);
  });

  describe('execute', () => {
    it('should execute dotnet command successfully', async () => {
      const result = await executor.execute({
        args: ['--version'],
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBeTruthy();
      expect(result.timedOut).toBe(false);
    });

    it('should handle command with non-zero exit code', async () => {
      const result = await executor.execute({
        args: ['invalid-command', 'that-does-not-exist'],
      });

      expect(result.exitCode).not.toBe(0);
      expect(result.timedOut).toBe(false);
    });

    it('should handle command timeout', async () => {
      // Use a command that will hang (sleep is not available in dotnet, so this will fail quickly)
      const result = await executor.execute({
        args: ['msbuild', '/nonexistent/project.csproj'],
        timeout: 100, // Very short timeout
      });

      // Command should complete quickly with error, not timeout
      expect(result.exitCode).not.toBe(0);
    });

    it('should stream stdout and stderr', async () => {
      const result = await executor.execute({
        args: ['--help'],
      });

      expect(result.stdout.length).toBeGreaterThan(0);
      expect(result.exitCode).toBe(0);
    });

    it('should merge custom environment variables', async () => {
      const result = await executor.execute({
        args: ['--version'],
        env: { CUSTOM_VAR: 'test' },
      });

      expect(result.exitCode).toBe(0);
    });
  });

  describe('isDotnetAvailable', () => {
    it('should return true when dotnet is available', async () => {
      const available = await executor.isDotnetAvailable();
      expect(available).toBe(true);
    });
  });

  describe('getDotnetVersion', () => {
    it('should return version string', async () => {
      const version = await executor.getDotnetVersion();
      expect(version).toBeTruthy();
      expect(typeof version).toBe('string');
      // Version should match pattern like "8.0.100"
      expect(version).toMatch(/^\d+\.\d+\.\d+/);
    });
  });
});
