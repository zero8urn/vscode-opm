import type { INuGetApiClient } from '../../domain/nugetApiClient';
import type { ILogger } from '../../services/loggerService';
import type { PackageSearchResult } from '../../domain/models/packageSearchResult';
import type { NuGetError } from '../../domain/models/nugetError';

/**
 * Result type for search operations.
 */
export interface SearchResult {
  packages: PackageSearchResult[];
  totalHits: number;
  hasMore: boolean;
  error?: NuGetError;
}

/**
 * Options for search operations.
 */
export interface SearchOptions {
  query: string;
  prerelease?: boolean;
  sourceId?: string;
  take?: number;
}

/**
 * Pagination state snapshot for external consumers.
 */
export interface PaginationState {
  currentPage: number;
  totalHits: number;
  loadedCount: number;
  hasMore: boolean;
  isLoading: boolean;
}

/**
 * Service for managing NuGet package search with pagination support.
 *
 * This service encapsulates pagination state management, API orchestration,
 * and request deduplication to prevent `packageBrowserWebview.ts` from
 * becoming a monolithic component.
 *
 * @remarks
 * - Manages pagination state: currentPage, totalHits, loadedPackages, hasMore
 * - Prevents concurrent pagination requests via isLoading flag
 * - Automatically resets state on new search queries or filter changes
 * - Returns accumulated packages on each page load for simple UI integration
 *
 * @example
 * ```typescript
 * const service = createSearchService(nugetClient, logger);
 *
 * // Initial search
 * const result = await service.search('json', { prerelease: false });
 * console.log(`Showing ${result.packages.length} of ${result.totalHits}`);
 *
 * // Load next page
 * if (result.hasMore) {
 *   const nextPage = await service.loadNextPage();
 *   console.log(`Now showing ${nextPage.packages.length} of ${nextPage.totalHits}`);
 * }
 *
 * // New search resets pagination
 * await service.search('serilog');
 * ```
 */
export interface ISearchService {
  /**
   * Execute a new search query, resetting pagination state.
   *
   * @param query - Search keyword or package name
   * @param options - Optional search parameters (prerelease, sourceId, take)
   * @param signal - Optional AbortSignal for cancellation
   * @returns SearchResult with first page of packages and pagination metadata
   *
   * @remarks
   * - Resets all pagination state (currentPage = 0, loadedPackages = [])
   * - Fetches first page with skip=0
   * - Calculates hasMore based on returned result count vs page size
   */
  search(query: string, options?: Partial<SearchOptions>, signal?: AbortSignal): Promise<SearchResult>;

  /**
   * Load the next page of results for the current search query.
   *
   * @param signal - Optional AbortSignal for cancellation
   * @returns SearchResult with all accumulated packages from all loaded pages
   *
   * @remarks
   * - Returns immediately if isLoading=true or hasMore=false
   * - Calculates correct skip offset based on loadedPackages.length
   * - Appends new packages to accumulated results
   * - Recalculates hasMore after each page load
   */
  loadNextPage(signal?: AbortSignal): Promise<SearchResult>;

  /**
   * Reset all pagination state.
   *
   * @remarks
   * Called automatically on new search queries or when filters change.
   * Can be called manually to clear state when webview is disposed.
   */
  resetPagination(): void;

  /**
   * Get current pagination state snapshot.
   *
   * @returns Read-only view of current pagination state
   */
  getState(): Readonly<PaginationState>;
}

/**
 * Default page size for pagination.
 */
const DEFAULT_PAGE_SIZE = 20;

/**
 * Implementation of ISearchService for managing paginated package search.
 *
 * @remarks
 * CRITICAL NOTE: The current NuGet API client does NOT expose totalHits from
 * the API response. As a workaround, we infer hasMore from page size comparison:
 * - If returned results.length < take, no more pages exist
 * - If returned results.length === take, potentially more pages exist
 */
export class SearchService implements ISearchService {
  private currentPage = 0;
  private totalHits = 0;
  private loadedPackages: PackageSearchResult[] = [];
  private hasMore = false;
  private isLoading = false;
  private lastSearchOptions: SearchOptions | null = null;

  constructor(private readonly nugetClient: INuGetApiClient, private readonly logger: ILogger) {}

  async search(query: string, options: Partial<SearchOptions> = {}, signal?: AbortSignal): Promise<SearchResult> {
    // Reset pagination state
    this.currentPage = 0;
    this.totalHits = 0;
    this.loadedPackages = [];
    this.hasMore = false;
    this.isLoading = false;

    // Store search options for pagination continuation
    this.lastSearchOptions = {
      query,
      prerelease: options.prerelease,
      sourceId: options.sourceId,
      take: options.take ?? DEFAULT_PAGE_SIZE,
    };

    this.logger.debug('SearchService: Starting new search', { query, options });
    return this.fetchPage(0, signal);
  }

  async loadNextPage(signal?: AbortSignal): Promise<SearchResult> {
    // Guard: No more pages available
    if (!this.hasMore) {
      this.logger.debug('SearchService: No more pages to load');
      return {
        packages: this.loadedPackages,
        totalHits: this.totalHits,
        hasMore: false,
      };
    }

    // Guard: Request already in-flight
    if (this.isLoading) {
      this.logger.debug('SearchService: Request already in-flight, ignoring');
      return {
        packages: this.loadedPackages,
        totalHits: this.totalHits,
        hasMore: this.hasMore,
      };
    }

    // Guard: No previous search
    if (!this.lastSearchOptions) {
      this.logger.warn('SearchService: loadNextPage called without previous search');
      return {
        packages: [],
        totalHits: 0,
        hasMore: false,
        error: { code: 'ApiError', message: 'No active search query' },
      };
    }

    const nextPage = this.currentPage + 1;
    this.logger.debug('SearchService: Loading next page', { page: nextPage });
    return this.fetchPage(nextPage, signal);
  }

  resetPagination(): void {
    this.currentPage = 0;
    this.totalHits = 0;
    this.loadedPackages = [];
    this.hasMore = false;
    this.isLoading = false;
    this.lastSearchOptions = null;
    this.logger.debug('SearchService: Pagination state reset');
  }

  getState(): Readonly<PaginationState> {
    return {
      currentPage: this.currentPage,
      totalHits: this.totalHits,
      loadedCount: this.loadedPackages.length,
      hasMore: this.hasMore,
      isLoading: this.isLoading,
    };
  }

  private async fetchPage(page: number, signal?: AbortSignal): Promise<SearchResult> {
    this.isLoading = true;

    try {
      if (!this.lastSearchOptions) {
        throw new Error('No search options available');
      }

      const pageSize = this.lastSearchOptions.take ?? DEFAULT_PAGE_SIZE;
      const skip = page * pageSize;

      this.logger.debug('SearchService: Fetching page', { page, skip, take: pageSize });

      const result = await this.nugetClient.searchPackages(
        {
          query: this.lastSearchOptions.query,
          prerelease: this.lastSearchOptions.prerelease,
          skip,
          take: pageSize,
        },
        signal,
        this.lastSearchOptions.sourceId,
      );

      if (!result.success) {
        this.logger.error(`SearchService: API request failed - ${result.error.code}: ${result.error.message}`);
        return {
          packages: this.loadedPackages,
          totalHits: this.totalHits,
          hasMore: this.hasMore,
          error: result.error,
        };
      }

      // Update pagination state
      this.currentPage = page;
      if (page === 0) {
        this.loadedPackages = result.result;
      } else {
        this.loadedPackages = [...this.loadedPackages, ...result.result];
      }

      // Infer hasMore from page size (workaround for missing totalHits in API response)
      // If we got fewer results than requested, we've reached the end
      if (result.result.length < pageSize) {
        this.hasMore = false;
        this.totalHits = this.loadedPackages.length; // Best estimate
      } else {
        this.hasMore = true;
        // Estimate totalHits as "at least loadedPackages.length + 1"
        // This will be updated as we load more pages
        this.totalHits = this.loadedPackages.length + 1;
      }

      this.logger.debug('SearchService: Page fetched successfully', {
        page,
        packagesInPage: result.result.length,
        totalLoaded: this.loadedPackages.length,
        hasMore: this.hasMore,
      });

      return {
        packages: this.loadedPackages,
        totalHits: this.totalHits,
        hasMore: this.hasMore,
      };
    } catch (error) {
      this.logger.error('SearchService: Unexpected error during fetch', error as Error);
      return {
        packages: this.loadedPackages,
        totalHits: this.totalHits,
        hasMore: this.hasMore,
        error: {
          code: 'ApiError',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    } finally {
      this.isLoading = false;
    }
  }
}

/**
 * Factory function for creating SearchService with dependency injection.
 *
 * @param nugetClient - NuGet API client instance
 * @param logger - Logger service instance
 * @returns Configured SearchService instance
 */
export function createSearchService(nugetClient: INuGetApiClient, logger: ILogger): ISearchService {
  return new SearchService(nugetClient, logger);
}
