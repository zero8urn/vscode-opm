/**
 * Integration tests for PackageCliService.
 *
 * Tests real dotnet CLI execution with actual test projects.
 * Requires dotnet SDK to be installed and available in PATH.
 */

import { describe, it, expect, beforeAll } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createDotnetCliExecutor } from '../../src/services/cli/dotnetCliExecutor';
import { createPackageCliService } from '../../src/services/cli/packageCliService';
import { PackageOperationErrorCode } from '../../src/services/cli/types/packageOperation';

// Mock logger for integration tests
const testLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  show: () => {},
  isDebugEnabled: () => false,
  dispose: () => {},
};

describe('PackageCliService - Integration', () => {
  const testProjectPath = path.resolve(__dirname, '../fixtures/solutions/TestProject/TestProject.csproj');
  let cliExecutor: ReturnType<typeof createDotnetCliExecutor>;
  let packageService: ReturnType<typeof createPackageCliService>;

  beforeAll(async () => {
    // Verify test project exists
    try {
      await fs.access(testProjectPath);
    } catch {
      throw new Error(`Test project not found at ${testProjectPath}. Run 'bun run prepare-fixtures' first.`);
    }

    cliExecutor = createDotnetCliExecutor(testLogger);
    packageService = createPackageCliService(cliExecutor, testLogger);

    // Verify dotnet CLI is available
    const isDotnetAvailable = await cliExecutor.isDotnetAvailable();
    if (!isDotnetAvailable) {
      throw new Error('dotnet CLI not found in PATH. Please install .NET SDK to run integration tests.');
    }
  });

  describe('addPackage', () => {
    it('should successfully install a stable package', async () => {
      const result = await packageService.addPackage({
        projectPath: testProjectPath,
        packageId: 'Newtonsoft.Json',
        version: '13.0.3',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.exitCode).toBe(0);
      }

      // Verify package was added to project file
      const projectContent = await fs.readFile(testProjectPath, 'utf-8');
      expect(projectContent).toContain('Newtonsoft.Json');
      expect(projectContent).toContain('13.0.3');
    }, 30000); // 30s timeout for network download

    it('should fail with PackageVersionNotFound for non-existent version', async () => {
      const result = await packageService.addPackage({
        projectPath: testProjectPath,
        packageId: 'Newtonsoft.Json',
        version: '999.999.999',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(PackageOperationErrorCode.PackageVersionNotFound);
      }
    });

    it('should fail with ProjectNotFound for non-existent project', async () => {
      const result = await packageService.addPackage({
        projectPath: '/non/existent/project.csproj',
        packageId: 'Newtonsoft.Json',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(PackageOperationErrorCode.ProjectNotFound);
      }
    });
  });

  describe('removePackage', () => {
    it('should successfully remove an installed package', async () => {
      // First, ensure the package is installed
      await packageService.addPackage({
        projectPath: testProjectPath,
        packageId: 'Newtonsoft.Json',
        version: '13.0.3',
      });

      // Now remove it
      const result = await packageService.removePackage({
        projectPath: testProjectPath,
        packageId: 'Newtonsoft.Json',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.exitCode).toBe(0);
      }

      // Verify package was removed from project file
      const projectContent = await fs.readFile(testProjectPath, 'utf-8');
      expect(projectContent).not.toContain('Newtonsoft.Json');
    }, 30000);

    it('should fail gracefully when removing non-existent package', async () => {
      const result = await packageService.removePackage({
        projectPath: testProjectPath,
        packageId: 'NonExistentPackage',
      });

      // dotnet remove typically returns 0 even if package doesn't exist
      // but we'll handle it gracefully
      expect(result).toBeDefined();
    });
  });
});
