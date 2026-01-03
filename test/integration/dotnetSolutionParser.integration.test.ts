/**
 * Integration tests for dotnet solution parser.
 *
 * These tests execute real `dotnet sln list` commands against test fixtures.
 * Requires dotnet CLI to be installed and available on PATH.
 */

import { describe, expect, it, beforeAll } from 'bun:test';
import { createDotnetSolutionParser } from '../../src/services/cli/dotnetSolutionParser.js';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { spawn } from 'node:child_process';

// Check if dotnet CLI is available
async function isDotnetAvailable(): Promise<boolean> {
  return new Promise(resolve => {
    const proc = spawn('dotnet', ['--version']);
    proc.on('error', () => resolve(false));
    proc.on('close', code => resolve(code === 0));
  });
}

const mockLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

const FIXTURES_DIR = path.join(import.meta.dir, '../fixtures/solutions');
const TEST_SOLUTION_PATH = path.join(FIXTURES_DIR, 'TestSolution.sln');

describe('DotnetSolutionParser Integration Tests', () => {
  let dotnetAvailable = false;

  beforeAll(async () => {
    dotnetAvailable = await isDotnetAvailable();

    if (!dotnetAvailable) {
      console.warn('⚠️  Skipping integration tests: dotnet CLI not available');
      return;
    }

    // Verify test fixture exists
    try {
      await fs.access(TEST_SOLUTION_PATH);
    } catch (error) {
      throw new Error(`Test fixture not found: ${TEST_SOLUTION_PATH}. Run test setup first.`);
    }
  });

  it('should parse real solution file using dotnet CLI', async () => {
    if (!dotnetAvailable) {
      console.log('⏭️  Skipped: dotnet CLI not available');
      return;
    }

    const parser = createDotnetSolutionParser(mockLogger as any);

    const result = await parser.parseSolution(TEST_SOLUTION_PATH);

    expect(result.solutionPath).toBe(TEST_SOLUTION_PATH);
    expect(result.format).toBe('sln');
    expect(result.projects).toBeArray();
    expect(result.projects.length).toBeGreaterThan(0);

    // Verify project path is absolute
    const firstProject = result.projects[0];
    expect(firstProject).toBeDefined();
    expect(path.isAbsolute(firstProject!.path)).toBe(true);
    expect(firstProject!.name).toMatch(/\.csproj$/);
  });

  it('should cache parsed results', async () => {
    if (!dotnetAvailable) {
      console.log('⏭️  Skipped: dotnet CLI not available');
      return;
    }

    const parser = createDotnetSolutionParser(mockLogger as any);

    // First parse
    const result1 = await parser.parseSolution(TEST_SOLUTION_PATH);

    // Second parse (should use cache)
    const result2 = await parser.parseSolution(TEST_SOLUTION_PATH);

    expect(result1).toEqual(result2);
  });

  it('should throw error for non-existent solution file', async () => {
    if (!dotnetAvailable) {
      console.log('⏭️  Skipped: dotnet CLI not available');
      return;
    }

    const parser = createDotnetSolutionParser(mockLogger as any);
    const nonExistentPath = path.join(FIXTURES_DIR, 'NonExistent.sln');

    await expect(parser.parseSolution(nonExistentPath)).rejects.toThrow();
  });
});
