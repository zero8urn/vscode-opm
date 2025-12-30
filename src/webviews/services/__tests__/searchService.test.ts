import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { SearchService, createSearchService } from '../searchService';
import type { INuGetApiClient } from '../../../domain/nugetApiClient';
import type { ILogger } from '../../../services/loggerService';
import type { PackageSearchResult } from '../../../domain/models/packageSearchResult';
import type { NuGetResult } from '../../../domain/models/nugetError';
import type { PackageIndex } from '../../../domain/models/packageIndex';
import type { PackageVersionDetails } from '../../../domain/models/packageVersionDetails';

describe('SearchService', () => {
  let mockNugetClient: INuGetApiClient;
  let mockLogger: ILogger;
  let service: SearchService;

  // Mock package results
  const createMockPackages = (count: number, startIndex = 0): PackageSearchResult[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `Package${startIndex + i}`,
      version: '1.0.0',
      description: `Description ${startIndex + i}`,
      authors: ['Author'],
      downloadCount: 1000,
      iconUrl: 'https://example.com/icon.png',
      verified: false,
      tags: [],
    }));
  };

  beforeEach(() => {
    mockLogger = {
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
      debug: mock(() => {}),
      show: mock(() => {}),
      dispose: mock(() => {}),
      isDebugEnabled: mock(() => false),
    };

    mockNugetClient = {
      searchPackages: mock(async () => {
        return { success: true, result: createMockPackages(20) } as NuGetResult<PackageSearchResult[]>;
      }),
      getPackageIndex: mock(async () => {
        return { success: true, result: { id: 'test', versions: [], totalVersions: 0 } } as NuGetResult<PackageIndex>;
      }),
      getPackageVersion: mock(async () => {
        return {
          success: false,
          error: { code: 'NotFound', message: 'Not implemented' },
        } as NuGetResult<PackageVersionDetails>;
      }),
      getPackageReadme: mock(async () => {
        return { success: false, error: { code: 'NotFound', message: 'Not implemented' } } as NuGetResult<string>;
      }),
    };

    service = new SearchService(mockNugetClient, mockLogger);
  });

  describe('search()', () => {
    it('should reset pagination state on new search', async () => {
      // Perform initial search
      await service.search('test');

      // Verify state is reset
      const state = service.getState();
      expect(state.currentPage).toBe(0);
      expect(state.loadedCount).toBe(20);
    });

    it('should fetch first page with skip=0', async () => {
      await service.search('test', { prerelease: true });

      expect(mockNugetClient.searchPackages).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'test',
          prerelease: true,
          skip: 0,
          take: 20,
        }),
        undefined,
        undefined,
      );
    });

    it('should calculate hasMore correctly when full page returned', async () => {
      const result = await service.search('test');

      expect(result.hasMore).toBe(true);
      expect(result.packages.length).toBe(20);
    });

    it('should calculate hasMore=false when partial page returned', async () => {
      mockNugetClient.searchPackages = mock(async () => {
        return { success: true, result: createMockPackages(15) } as NuGetResult<PackageSearchResult[]>;
      });

      const result = await service.search('test');

      expect(result.hasMore).toBe(false);
      expect(result.packages.length).toBe(15);
    });

    it('should handle empty results', async () => {
      mockNugetClient.searchPackages = mock(async () => {
        return { success: true, result: [] } as NuGetResult<PackageSearchResult[]>;
      });

      const result = await service.search('nonexistent');

      expect(result.hasMore).toBe(false);
      expect(result.packages.length).toBe(0);
      expect(result.totalHits).toBe(0);
    });

    it('should return error when API fails', async () => {
      mockNugetClient.searchPackages = mock(async () => {
        return { success: false as const, error: { code: 'Network' as const, message: 'Connection failed' } };
      });

      const result = await service.search('test');

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('Network');
      expect(result.packages.length).toBe(0);
    });

    it('should use custom page size when provided', async () => {
      await service.search('test', { take: 50 });

      expect(mockNugetClient.searchPackages).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        }),
        undefined,
        undefined,
      );
    });
  });

  describe('loadNextPage()', () => {
    it('should calculate correct skip offset for page 2', async () => {
      // Initial search returns 20 items
      await service.search('test');

      // Load next page
      await service.loadNextPage();

      expect(mockNugetClient.searchPackages).toHaveBeenLastCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 20,
        }),
        undefined,
        undefined,
      );
    });

    it('should append new packages to accumulated results', async () => {
      mockNugetClient.searchPackages = mock(async options => {
        const skip = (options as any).skip || 0;
        return { success: true, result: createMockPackages(20, skip) } as NuGetResult<PackageSearchResult[]>;
      });

      await service.search('test');
      const result = await service.loadNextPage();

      expect(result.packages.length).toBe(40); // 20 + 20
      expect(result.packages[0]!.id).toBe('Package0');
      expect(result.packages[20]!.id).toBe('Package20');
    });

    it('should return immediately if hasMore=false', async () => {
      mockNugetClient.searchPackages = mock(async () => {
        return { success: true, result: createMockPackages(15) } as NuGetResult<PackageSearchResult[]>;
      });

      await service.search('test');
      const callCountBefore = (mockNugetClient.searchPackages as any).mock.calls.length;

      await service.loadNextPage();
      const callCountAfter = (mockNugetClient.searchPackages as any).mock.calls.length;

      expect(callCountAfter).toBe(callCountBefore); // No additional call
    });

    it('should return immediately if isLoading=true (request deduplication)', async () => {
      // First search completes
      await service.search('test');

      // Mock a slow API call for loadNextPage
      let resolvePending: ((value: NuGetResult<PackageSearchResult[]>) => void) | null = null;
      const pendingPromise = new Promise<NuGetResult<PackageSearchResult[]>>(resolve => {
        resolvePending = resolve;
      });

      mockNugetClient.searchPackages = mock(async () => pendingPromise);

      // Start first loadNextPage (will hang)
      const firstLoadPromise = service.loadNextPage();

      // Wait a tick to ensure first call sets isLoading
      await new Promise(resolve => setTimeout(resolve, 10));

      // Second loadNextPage should return immediately with current state
      const secondLoadResult = await service.loadNextPage();

      // Verify second call returned without waiting
      expect(secondLoadResult.packages.length).toBe(20); // Original search results
      expect(secondLoadResult.hasMore).toBe(true);

      // Cleanup: resolve the pending call
      resolvePending!({ success: true, result: createMockPackages(20, 20) });
      await firstLoadPromise;
    });

    it('should return empty result when no previous search exists', async () => {
      // Create fresh service without calling search (hasMore=false by default)
      const freshService = new SearchService(mockNugetClient, mockLogger);
      const result = await freshService.loadNextPage();

      // When hasMore=false and no previous search, returns empty state (not an error)
      expect(result.packages.length).toBe(0);
      expect(result.hasMore).toBe(false);
      expect(result.totalHits).toBe(0);
      expect(result.error).toBeUndefined();
    });

    it('should preserve previous packages on API error', async () => {
      await service.search('test');

      mockNugetClient.searchPackages = mock(async () => {
        return { success: false as const, error: { code: 'Network' as const, message: 'Connection failed' } };
      });

      const result = await service.loadNextPage();

      expect(result.error).toBeDefined();
      expect(result.packages.length).toBe(20); // Previous results preserved
    });
  });

  describe('resetPagination()', () => {
    it('should clear all state', async () => {
      await service.search('test');
      await service.loadNextPage();

      service.resetPagination();

      const state = service.getState();
      expect(state.currentPage).toBe(0);
      expect(state.totalHits).toBe(0);
      expect(state.loadedCount).toBe(0);
      expect(state.hasMore).toBe(false);
      expect(state.isLoading).toBe(false);
    });
  });

  describe('getState()', () => {
    it('should return current pagination state snapshot', async () => {
      await service.search('test');

      const state = service.getState();

      expect(state.currentPage).toBe(0);
      expect(state.loadedCount).toBe(20);
      expect(state.hasMore).toBe(true);
      expect(state.isLoading).toBe(false);
    });
  });

  describe('createSearchService()', () => {
    it('should create SearchService instance with injected dependencies', () => {
      const createdService = createSearchService(mockNugetClient, mockLogger);

      expect(createdService).toBeInstanceOf(SearchService);
    });
  });

  describe('Edge cases', () => {
    it('should handle exactly one page of results (20 items)', async () => {
      mockNugetClient.searchPackages = mock(async () => {
        return { success: true, result: createMockPackages(20) } as NuGetResult<PackageSearchResult[]>;
      });

      const result = await service.search('test');

      // Full page means potentially more results (we can't know for sure)
      expect(result.hasMore).toBe(true);
    });
  });
});
