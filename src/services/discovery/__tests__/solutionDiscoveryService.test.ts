/**
 * Unit tests for solution discovery service.
 */

import { describe, expect, it, mock } from 'bun:test';
import type { DiscoveredSolution } from '../solutionDiscoveryService';

// Mock VS Code workspace API
const mockWorkspace = {
  getConfiguration: mock(() => ({
    get: mock((key: string, defaultValue: unknown) => {
      if (key === 'solutionScanDepth') {
        return 'root-only';
      }
      return defaultValue;
    }),
  })),
  findFiles: mock(async () => []),
  getWorkspaceFolder: mock(() => ({
    uri: { fsPath: '/workspace' },
    name: 'test-workspace',
    index: 0,
  })),
  workspaceFolders: [
    {
      uri: { fsPath: '/workspace' },
      name: 'test-workspace',
      index: 0,
    },
  ],
};

// Mock logger
const mockLogger = {
  debug: mock(() => {}),
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
};

describe('SolutionDiscoveryService', () => {
  describe('isSolutionFile', () => {
    it('should return true for .sln files', async () => {
      const { createSolutionDiscoveryService } = await import('../solutionDiscoveryService');
      const service = createSolutionDiscoveryService(mockWorkspace as any, mockLogger as any);

      expect(service.isSolutionFile('/path/to/MySolution.sln')).toBe(true);
      expect(service.isSolutionFile('/path/to/MySolution.SLN')).toBe(true);
    });

    it('should return true for .slnx files', async () => {
      const { createSolutionDiscoveryService } = await import('../solutionDiscoveryService');
      const service = createSolutionDiscoveryService(mockWorkspace as any, mockLogger as any);

      expect(service.isSolutionFile('/path/to/MySolution.slnx')).toBe(true);
      expect(service.isSolutionFile('/path/to/MySolution.SLNX')).toBe(true);
    });

    it('should return false for non-solution files', async () => {
      const { createSolutionDiscoveryService } = await import('../solutionDiscoveryService');
      const service = createSolutionDiscoveryService(mockWorkspace as any, mockLogger as any);

      expect(service.isSolutionFile('/path/to/project.csproj')).toBe(false);
      expect(service.isSolutionFile('/path/to/file.txt')).toBe(false);
      expect(service.isSolutionFile('/path/to/MySolution')).toBe(false);
    });
  });

  describe('discoverSolutions', () => {
    it('should return empty array when no solutions found', async () => {
      const workspace = {
        ...mockWorkspace,
        findFiles: mock(async () => []),
      };

      const { createSolutionDiscoveryService } = await import('../solutionDiscoveryService');
      const service = createSolutionDiscoveryService(workspace as any, mockLogger as any);

      const solutions = await service.discoverSolutions();
      expect(solutions).toEqual([]);
    });

    it('should discover solutions from workspace', async () => {
      const workspace = {
        ...mockWorkspace,
        getConfiguration: mock(() => ({
          get: mock(() => 'root-only'),
        })),
        findFiles: mock(async () => [
          { fsPath: '/workspace/AnotherSolution.slnx' },
          { fsPath: '/workspace/MySolution.sln' },
        ]),
        getWorkspaceFolder: mock(() => ({
          uri: { fsPath: '/workspace' },
          name: 'test-workspace',
          index: 0,
        })),
      };

      const { createSolutionDiscoveryService } = await import('../solutionDiscoveryService');
      const service = createSolutionDiscoveryService(workspace as any, mockLogger as any);

      const solutions = await service.discoverSolutions();

      expect(solutions).toHaveLength(2);
      // Solutions are sorted alphabetically by name
      expect(solutions[0]?.name).toBe('AnotherSolution.slnx');
      expect(solutions[0]?.format).toBe('slnx');
      expect(solutions[1]?.name).toBe('MySolution.sln');
      expect(solutions[1]?.format).toBe('sln');
    });

    it('should skip solutions outside workspace folders', async () => {
      const workspace = {
        ...mockWorkspace,
        findFiles: mock(async () => [{ fsPath: '/workspace/MySolution.sln' }]),
        getWorkspaceFolder: mock(() => null), // No workspace folder
      };

      const { createSolutionDiscoveryService } = await import('../solutionDiscoveryService');
      const service = createSolutionDiscoveryService(workspace as any, mockLogger as any);

      const solutions = await service.discoverSolutions();
      expect(solutions).toEqual([]);
    });

    it('should sort solutions by workspace folder then by name', async () => {
      const workspace = {
        ...mockWorkspace,
        findFiles: mock(async () => [{ fsPath: '/workspace/ZSolution.sln' }, { fsPath: '/workspace/ASolution.sln' }]),
        getWorkspaceFolder: mock(() => ({
          uri: { fsPath: '/workspace' },
          name: 'test-workspace',
          index: 0,
        })),
      };

      const { createSolutionDiscoveryService } = await import('../solutionDiscoveryService');
      const service = createSolutionDiscoveryService(workspace as any, mockLogger as any);

      const solutions = await service.discoverSolutions();

      expect(solutions).toHaveLength(2);
      expect(solutions[0]?.name).toBe('ASolution.sln');
      expect(solutions[1]?.name).toBe('ZSolution.sln');
    });
  });
});
