/**
 * Unit tests for solution context service.
 */

import { describe, expect, it, mock } from 'bun:test';
import type { SolutionContext } from '../solutionContextService';

const mockWorkspace = {
  workspaceFolders: [
    {
      uri: { fsPath: '/workspace' },
      name: 'test-workspace',
      index: 0,
    },
  ],
  getWorkspaceFolder: mock(() => ({
    uri: { fsPath: '/workspace' },
    name: 'test-workspace',
    index: 0,
  })),
};

const mockLogger = {
  debug: mock(() => {}),
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
};

const mockDiscoveryService = {
  discoverSolutions: mock(async () => []),
  isSolutionFile: mock(() => true),
};

const mockSolutionParser = {
  parseSolution: mock(async () => ({
    solutionPath: '/workspace/test.sln',
    projects: [],
    format: 'sln' as const,
  })),
};

describe('SolutionContextService', () => {
  describe('discoverAsync', () => {
    it('should initialize with no solutions and enter workspace mode', async () => {
      const { createSolutionContextService } = await import('../solutionContextService');

      const service = createSolutionContextService(
        mockWorkspace as any,
        mockLogger as any,
        mockDiscoveryService as any,
        mockSolutionParser as any,
      );

      await service.discoverAsync();

      const context = service.getContext();
      expect(context.mode).toBe('workspace');
      expect(context.solution).toBeNull();
      expect(context.projects).toEqual([]);

      service.dispose();
    });

    it('should fall back to workspace mode with multiple solutions', async () => {
      const discoveryService = {
        ...mockDiscoveryService,
        discoverSolutions: mock(async () => [
          {
            path: '/workspace/Solution1.sln',
            name: 'Solution1.sln',
            workspaceFolder: mockWorkspace.workspaceFolders[0],
            format: 'sln' as const,
          },
          {
            path: '/workspace/Solution2.sln',
            name: 'Solution2.sln',
            workspaceFolder: mockWorkspace.workspaceFolders[0],
            format: 'sln' as const,
          },
        ]),
      };

      const { createSolutionContextService } = await import('../solutionContextService');

      const service = createSolutionContextService(
        mockWorkspace as any,
        mockLogger as any,
        discoveryService as any,
        mockSolutionParser as any,
      );

      await service.discoverAsync();

      const context = service.getContext();
      expect(context.mode).toBe('workspace');
      expect(context.solution).toBeNull();

      service.dispose();
    });
  });

  describe('getContext', () => {
    it('should return current context', async () => {
      const { createSolutionContextService } = await import('../solutionContextService');

      const service = createSolutionContextService(
        mockWorkspace as any,
        mockLogger as any,
        mockDiscoveryService as any,
        mockSolutionParser as any,
      );

      const context = service.getContext();
      expect(context).toBeDefined();
      expect(context.mode).toBe('none');

      service.dispose();
    });

    it('should return default state before discovery runs', async () => {
      const { createSolutionContextService } = await import('../solutionContextService');

      const service = createSolutionContextService(
        mockWorkspace as any,
        mockLogger as any,
        mockDiscoveryService as any,
        mockSolutionParser as any,
      );

      const context = service.getContext();
      expect(context.mode).toBe('none');
      expect(context.solution).toBeNull();
      expect(context.projects).toEqual([]);

      service.dispose();
    });
  });

  describe('dispose', () => {
    it('should dispose resources', async () => {
      const { createSolutionContextService } = await import('../solutionContextService');

      const service = createSolutionContextService(
        mockWorkspace as any,
        mockLogger as any,
        mockDiscoveryService as any,
        mockSolutionParser as any,
      );

      await service.discoverAsync();
      service.dispose();

      // Should not throw
      expect(true).toBe(true);
    });
  });
});
