/**
 * Integration tests for CLI-based project parsing with real dotnet commands.
 *
 * These tests require .NET SDK to be installed and available in PATH.
 * They execute real dotnet commands against test fixture projects.
 */

import { describe, it, expect, beforeAll } from 'bun:test';
import * as path from 'path';
import { createDotnetCliExecutor } from '../../src/services/cli/dotnetCliExecutor';
import { createTargetFrameworkParser } from '../../src/services/cli/parsers/targetFrameworkParser';
import { createPackageReferenceParser } from '../../src/services/cli/parsers/packageReferenceParser';
import { createDotnetProjectParser } from '../../src/services/cli/dotnetProjectParser';
import { ProjectParseErrorCode } from '../../src/services/cli/types/projectMetadata';
import type { ILogger } from '../../src/services/loggerService';

// Simple console logger for integration tests
const createTestLogger = (): ILogger => ({
  debug: () => {},
  info: console.log,
  warn: console.warn,
  error: console.error,
  show: () => {},
  isDebugEnabled: () => false,
  dispose: () => {},
});

const FIXTURES_DIR = path.join(__dirname, '../fixtures/solutions');
const TEST_PROJECT_PATH = path.join(FIXTURES_DIR, 'TestProject/TestProject.csproj');

describe('CLI Project Parsing Integration Tests', () => {
  let cliExecutor: ReturnType<typeof createDotnetCliExecutor>;
  let logger: ILogger;

  beforeAll(async () => {
    logger = createTestLogger();
    cliExecutor = createDotnetCliExecutor(logger);

    // Verify dotnet CLI is available
    const available = await cliExecutor.isDotnetAvailable();
    if (!available) {
      throw new Error('dotnet CLI not available - integration tests require .NET SDK');
    }
  });

  describe('dotnetCliExecutor', () => {
    it('should execute real dotnet --version command', async () => {
      const result = await cliExecutor.execute({ args: ['--version'] });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBeTruthy();
      expect(result.stdout).toMatch(/^\d+\.\d+\.\d+/);
      expect(result.timedOut).toBe(false);
    });

    it('should get dotnet version', async () => {
      const version = await cliExecutor.getDotnetVersion();

      expect(version).toBeTruthy();
      expect(version).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe('targetFrameworkParser', () => {
    it('should parse target framework from real project', async () => {
      const parser = createTargetFrameworkParser(cliExecutor, logger);
      const frameworks = await parser.parseTargetFrameworks(TEST_PROJECT_PATH);

      expect(frameworks).toBeTruthy();
      // TestProject uses net10.0 (may need to update based on SDK availability)
      expect(frameworks).toMatch(/^net\d+\.\d+$/);
    });
  });

  describe('packageReferenceParser', () => {
    it('should parse package references from real project', async () => {
      const parser = createPackageReferenceParser(cliExecutor, logger);
      const packages = await parser.parsePackageReferences(TEST_PROJECT_PATH);

      // TestProject has no packages by default
      expect(Array.isArray(packages)).toBe(true);
    });
  });

  describe('dotnetProjectParser', () => {
    it('should parse complete project metadata', async () => {
      const tfParser = createTargetFrameworkParser(cliExecutor, logger);
      const pkgParser = createPackageReferenceParser(cliExecutor, logger);
      const projectParser = createDotnetProjectParser(cliExecutor, tfParser, pkgParser, logger);

      const result = await projectParser.parseProject(TEST_PROJECT_PATH);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.metadata.name).toBe('TestProject');
        expect(result.metadata.path).toBe(TEST_PROJECT_PATH);
        expect(result.metadata.targetFrameworks).toBeTruthy();
        expect(result.metadata.outputType).toBe('Exe');
        expect(Array.isArray(result.metadata.packageReferences)).toBe(true);
      }
    });

    it('should cache results on second parse', async () => {
      const tfParser = createTargetFrameworkParser(cliExecutor, logger);
      const pkgParser = createPackageReferenceParser(cliExecutor, logger);
      const projectParser = createDotnetProjectParser(cliExecutor, tfParser, pkgParser, logger);

      // First parse
      const result1 = await projectParser.parseProject(TEST_PROJECT_PATH);
      expect(result1.success).toBe(true);

      // Second parse (should hit cache)
      const result2 = await projectParser.parseProject(TEST_PROJECT_PATH);
      expect(result2.success).toBe(true);

      // Results should be identical
      if (result1.success && result2.success) {
        expect(result2.metadata).toEqual(result1.metadata);
      }
    });

    it(
      'should invalidate cache',
      async () => {
        const tfParser = createTargetFrameworkParser(cliExecutor, logger);
        const pkgParser = createPackageReferenceParser(cliExecutor, logger);
        const projectParser = createDotnetProjectParser(cliExecutor, tfParser, pkgParser, logger);

        // First parse
        const result1 = await projectParser.parseProject(TEST_PROJECT_PATH);
        expect(result1.success).toBe(true);

        // Invalidate cache
        projectParser.invalidateCache(TEST_PROJECT_PATH);

        // Second parse (should re-execute)
        const result2 = await projectParser.parseProject(TEST_PROJECT_PATH);
        expect(result2.success).toBe(true);
      },
      { timeout: 10000 },
    );

    it('should handle non-existent project file', async () => {
      const tfParser = createTargetFrameworkParser(cliExecutor, logger);
      const pkgParser = createPackageReferenceParser(cliExecutor, logger);
      const projectParser = createDotnetProjectParser(cliExecutor, tfParser, pkgParser, logger);

      const result = await projectParser.parseProject('/nonexistent/project.csproj');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ProjectParseErrorCode.ProjectNotFound);
      }
    });
  });
});
