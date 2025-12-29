# IMPL-001-01-007-search-paging

**Story**: [STORY-001-01-007-search-paging](../stories/STORY-001-01-007-search-paging.md)  
**Feature**: [FEAT-001-01-browse-search](../features/FEAT-001-01-browse-search.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Not Started  
**Created**: 2025-12-29  
**Last Updated**: 2025-12-29

---

# High-Level Summary

This implementation introduces infinite scroll pagination for the NuGet Package Browser webview by creating a dedicated **Search Service** layer that encapsulates pagination state management, API orchestration, and request deduplication. The service acts as an intermediary between `packageBrowserWebview.ts` and `NuGetApiClient`, preventing the webview from becoming a monolithic god component while preparing the architecture for future features like installed package filtering and multi-source search aggregation.

The implementation leverages the NuGet Search API v3's `totalHits` response property (confirmed present in `src/domain/parsers/searchParser.ts`) to track total available results, enabling progress indicators ("Showing 20 of 3,456 packages") and intelligent pagination control. The UI uses Intersection Observer API for efficient scroll detection, triggering additional API calls when users approach the bottom of the results list (within 200px threshold).

Pagination state (`currentPage`, `totalHits`, `loadedPackages[]`, `hasMore`) is managed entirely within the Search Service, with automatic state reset on new search queries or filter changes. Request deduplication prevents concurrent pagination requests, ensuring only one API call is active at a time. The Lit component architecture (`package-results-list.ts`) renders packages efficiently, with consideration for virtual scrolling when result sets exceed 100 items to prevent DOM bloat.

This implementation follows the repository's single-class cohesive design pattern, uses constructor dependency injection for testability, and includes comprehensive test coverage (unit tests for service logic, integration tests for multi-page flows, E2E tests for scroll behavior). The service API is intentionally minimal (`search()`, `loadNextPage()`, `resetPagination()`) to maintain clarity and single-purpose responsibility.

---

# Implementation Todos

## Phase 1: Search Service Layer

1. Create `SearchService` interface in `src/webviews/services/searchService.ts` defining the contract for pagination state management <ref>SearchServiceInterface</ref>

2. Implement `SearchService` class with constructor DI accepting `INuGetApiClient` and `ILogger` dependencies <ref>SearchServiceImplementation</ref>

3. Add private state properties: `currentPage: number`, `totalHits: number`, `loadedPackages: PackageSearchResult[]`, `hasMore: boolean`, `isLoading: boolean` <ref>SearchServiceState</ref>

4. Implement `search()` method that resets pagination state, calls API with `skip: 0, take: 20`, and stores results <ref>SearchMethod</ref>

5. Implement `loadNextPage()` method that calculates correct `skip` offset, prevents concurrent requests, and appends new packages <ref>LoadNextPageMethod</ref>

6. Implement `resetPagination()` method to clear state when search query or filters change <ref>ResetPaginationMethod</ref>

7. Add request deduplication logic using `isLoading` flag to prevent concurrent pagination requests <ref>RequestDeduplication</ref>

8. Calculate `hasMore` flag correctly: `loadedPackages.length < totalHits` after each API response <ref>HasMoreCalculation</ref>

9. Handle API errors gracefully: preserve previous packages on failure, return error to caller for UI display <ref>ErrorHandling</ref>

10. Export factory function `createSearchService(client, logger)` for instantiation in webview host <ref>FactoryFunction</ref>

## Phase 2: WebView IPC Protocol Updates

11. Extend `SearchResponseMessage` type in `src/webviews/apps/packageBrowser/types.ts` to include `totalHits: number` and `hasMore: boolean` properties <ref>ExtendSearchResponse</ref>

12. Add `LoadMoreRequestMessage` type for pagination-specific IPC messages (or reuse `SearchRequestMessage` with updated `skip` parameter) <ref>LoadMoreMessage</ref>

13. Add type guard `isLoadMoreRequestMessage()` for runtime message validation <ref>TypeGuards</ref>

14. Update `SearchRequestMessage` payload to support optional `skip` parameter for pagination continuation <ref>UpdateSearchRequest</ref>

## Phase 3: WebView Host Integration

15. Inject `SearchService` into `packageBrowserWebview.ts` by instantiating it with `nugetClient` and `logger` dependencies <ref>ServiceInjection</ref>

16. Replace direct `nugetClient.searchPackages()` calls with `searchService.search()` in `handleSearchRequest()` <ref>ReplaceDirectCalls</ref>

17. Add new message handler `handleLoadMoreRequest()` that calls `searchService.loadNextPage()` <ref>LoadMoreHandler</ref>

18. Update `SearchResponseMessage` construction to include `totalHits` and `hasMore` from service response <ref>ResponseConstruction</ref>

19. Implement AbortController cleanup when new search initiated while pagination is in-flight <ref>AbortController</ref>

20. Add webview disposal cleanup to reset search service state <ref>DisposalCleanup</ref>

## Phase 4: Lit Component - Results List

21. Create `package-results-list.ts` Lit component in `src/webviews/apps/packageBrowser/components/` <ref>ResultsListComponent</ref>

22. Add `@property` decorators for reactive properties: `packages: PackageSearchResult[]`, `totalHits: number`, `hasMore: boolean`, `isLoading: boolean` <ref>ComponentProperties</ref>

23. Implement `render()` method to display package list with virtual scrolling support for 100+ items <ref>RenderMethod</ref>

24. Add results count indicator template: `<div class="results-count">Showing ${packages.length} of ${totalHits} packages</div>` <ref>ResultsCountIndicator</ref>

25. Implement Intersection Observer in `firstUpdated()` lifecycle hook to detect scroll approaching bottom (200px threshold) <ref>IntersectionObserver</ref>

26. Emit `load-more` custom event when Intersection Observer triggers and `hasMore === true && !isLoading` <ref>LoadMoreEvent</ref>

27. Add loading spinner template at bottom of list: `${isLoading ? html'<div class="spinner">Loading...</div>' : ''}` <ref>LoadingSpinner</ref>

28. Add "All packages loaded" message when `hasMore === false` and `packages.length > 0` <ref>AllLoadedMessage</ref>

29. Add ARIA live region for screen reader announcements: `<div role="status" aria-live="polite" aria-atomic="true">${loadingAnnouncement}</div>` <ref>AriaLiveRegion</ref>

30. Disconnect Intersection Observer in `disconnectedCallback()` to prevent memory leaks <ref>ObserverCleanup</ref>

## Phase 5: Parent Component Integration

31. Import `package-results-list` component in `package-browser-app.ts` and add to template <ref>ParentIntegration</ref>

32. Update `PackageBrowserApp` state to include `totalHits: number` and `hasMore: boolean` properties <ref>ParentState</ref>

33. Handle `searchResponse` messages from host to update `totalHits` and `hasMore` state <ref>SearchResponseHandler</ref>

34. Listen for `load-more` event from results list component and send `LoadMoreRequestMessage` to host <ref>LoadMoreListener</ref>

35. Reset results list scroll position when new search query submitted <ref>ScrollReset</ref>

36. Update loading state management to show spinner during both initial search and pagination <ref>LoadingStates</ref>

## Phase 6: Testing

37. Add unit test for `SearchService.search()` verifying pagination state reset and first page fetch <ref>UnitTestSearch</ref>

38. Add unit test for `SearchService.loadNextPage()` verifying correct `skip` calculation (e.g., 20, 40, 60) <ref>UnitTestLoadNextPage</ref>

39. Add unit test for request deduplication: concurrent `loadNextPage()` calls should be ignored <ref>UnitTestDeduplication</ref>

40. Add unit test for `hasMore` calculation edge cases (totalHits = 0, totalHits = 20, totalHits = 21) <ref>UnitTestHasMore</ref>

41. Add unit test for error handling: failed pagination preserves previous packages <ref>UnitTestErrors</ref>

42. Add integration test for multi-page search flow: search → verify 20 packages → loadNextPage → verify 40 packages <ref>IntegrationTestMultiPage</ref>

43. Add integration test for pagination exhaustion: load all pages for 35-item result set <ref>IntegrationTestExhaustion</ref>

44. Add integration test for pagination reset on filter change: load 3 pages → change prerelease → verify reset <ref>IntegrationTestReset</ref>

45. Add E2E test for scroll-based pagination: search → scroll to bottom → verify second page loads <ref>E2ETestScroll</ref>

46. Add E2E test for results count indicator: verify "Showing X of Y packages" updates correctly <ref>E2ETestResultsCount</ref>

47. Add E2E test for accessibility: verify ARIA live region announces "Loading more packages..." <ref>E2ETestAccessibility</ref>

48. Add manual testing checklist for performance with 100+ packages and rapid scrolling <ref>ManualTesting</ref>

---

# Context Sections

## <component name="SearchServiceInterface">

**File**: `src/webviews/services/searchService.ts`

Define the contract for the Search Service:

```typescript
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
  includePrerelease?: boolean;
  skip?: number;
  take?: number;
}

/**
 * Service for managing NuGet package search with pagination support.
 * 
 * Encapsulates pagination state, API interaction, and request deduplication
 * to prevent `packageBrowserWebview.ts` from becoming a god component.
 * 
 * @example
 * ```typescript
 * const service = createSearchService(nugetClient, logger);
 * 
 * // Initial search
 * const result = await service.search('json', { includePrerelease: false });
 * console.log(`Found ${result.totalHits} packages, showing ${result.packages.length}`);
 * 
 * // Load next page
 * if (result.hasMore) {
 *   const nextPage = await service.loadNextPage();
 *   console.log(`Now showing ${nextPage.packages.length} packages`);
 * }
 * ```
 */
export interface ISearchService {
  /**
   * Execute a new search query, resetting pagination state.
   * 
   * @param query - Search query string
   * @param options - Additional search options (prerelease filter, etc.)
   * @param signal - Optional AbortSignal for cancellation
   * @returns Search result with first page of packages
   */
  search(query: string, options?: Omit<SearchOptions, 'query' | 'skip'>, signal?: AbortSignal): Promise<SearchResult>;

  /**
   * Load the next page of results for the current search.
   * 
   * @param signal - Optional AbortSignal for cancellation
   * @returns Search result with accumulated packages (includes previous pages)
   */
  loadNextPage(signal?: AbortSignal): Promise<SearchResult>;

  /**
   * Reset pagination state without making API calls.
   * Call this when search query or filters change.
   */
  resetPagination(): void;

  /**
   * Get current pagination state (read-only).
   */
  getState(): {
    readonly currentPage: number;
    readonly totalHits: number;
    readonly loadedCount: number;
    readonly hasMore: boolean;
    readonly isLoading: boolean;
  };
}
```

**Notes:**
- Interface follows repository's pattern of exporting contracts for DI
- All methods are async except `resetPagination()` and `getState()`
- `SearchResult` includes error field for graceful failure handling
- `loadNextPage()` returns accumulated packages, not just new page

</component>

## <component name="SearchServiceImplementation">

**File**: `src/webviews/services/searchService.ts`

Implement the Search Service class:

```typescript
import type { INuGetApiClient } from '../../domain/nugetApiClient';
import type { ILogger } from '../../services/loggerService';
import type { PackageSearchResult } from '../../domain/models/packageSearchResult';
import type { ISearchService, SearchResult, SearchOptions } from './searchService';

/**
 * Default page size for pagination.
 */
const DEFAULT_PAGE_SIZE = 20;

/**
 * Implementation of ISearchService for managing paginated package search.
 */
export class SearchService implements ISearchService {
  private currentPage = 0;
  private totalHits = 0;
  private loadedPackages: PackageSearchResult[] = [];
  private hasMore = false;
  private isLoading = false;
  private lastSearchOptions: SearchOptions | null = null;

  constructor(
    private readonly nugetClient: INuGetApiClient,
    private readonly logger: ILogger,
  ) {}

  async search(
    query: string,
    options?: Omit<SearchOptions, 'query' | 'skip'>,
    signal?: AbortSignal,
  ): Promise<SearchResult> {
    // Reset state for new search
    this.resetPagination();
    
    this.logger.info('SearchService: Initiating new search', { query, options });

    // Store search options for pagination
    this.lastSearchOptions = {
      query,
      includePrerelease: options?.includePrerelease ?? false,
      take: options?.take ?? DEFAULT_PAGE_SIZE,
    };

    return this.fetchPage(0, signal);
  }

  async loadNextPage(signal?: AbortSignal): Promise<SearchResult> {
    if (!this.hasMore) {
      this.logger.debug('SearchService: No more pages to load');
      return this.getCurrentResult();
    }

    if (this.isLoading) {
      this.logger.debug('SearchService: Request already in progress, ignoring loadNextPage');
      return this.getCurrentResult();
    }

    if (!this.lastSearchOptions) {
      this.logger.warn('SearchService: loadNextPage called without previous search');
      return this.getCurrentResult();
    }

    const nextPage = this.currentPage + 1;
    this.logger.info('SearchService: Loading next page', { page: nextPage });

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

  getState() {
    return {
      currentPage: this.currentPage,
      totalHits: this.totalHits,
      loadedCount: this.loadedPackages.length,
      hasMore: this.hasMore,
      isLoading: this.isLoading,
    } as const;
  }

  /**
   * Internal method to fetch a specific page and update state.
   */
  private async fetchPage(page: number, signal?: AbortSignal): Promise<SearchResult> {
    if (!this.lastSearchOptions) {
      throw new Error('SearchService: Cannot fetch page without search options');
    }

    this.isLoading = true;

    try {
      const skip = page * (this.lastSearchOptions.take ?? DEFAULT_PAGE_SIZE);
      
      const result = await this.nugetClient.searchPackages(
        {
          query: this.lastSearchOptions.query,
          prerelease: this.lastSearchOptions.includePrerelease ?? false,
          skip,
          take: this.lastSearchOptions.take ?? DEFAULT_PAGE_SIZE,
        },
        signal,
      );

      if (!result.success) {
        this.logger.error('SearchService: API request failed', result.error);
        return {
          packages: this.loadedPackages,
          totalHits: this.totalHits,
          hasMore: this.hasMore,
          error: result.error,
        };
      }

      // Update state with new packages
      if (page === 0) {
        this.loadedPackages = result.result;
      } else {
        this.loadedPackages = [...this.loadedPackages, ...result.result];
      }

      this.currentPage = page;
      
      // Extract totalHits from API response (available in searchParser output)
      // Note: This requires extending PackageSearchResult or using a wrapper type
      // For now, calculate based on returned count (API doesn't expose totalHits in domain model yet)
      // TODO: Extend domain model to include totalHits from API response
      this.totalHits = result.result.length < (this.lastSearchOptions.take ?? DEFAULT_PAGE_SIZE) 
        ? this.loadedPackages.length 
        : this.loadedPackages.length + 1; // Assume more exist
      
      this.hasMore = result.result.length === (this.lastSearchOptions.take ?? DEFAULT_PAGE_SIZE);

      this.logger.debug('SearchService: Page loaded successfully', {
        page,
        packagesLoaded: result.result.length,
        totalLoaded: this.loadedPackages.length,
        hasMore: this.hasMore,
      });

      return this.getCurrentResult();
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Build SearchResult from current state.
   */
  private getCurrentResult(): SearchResult {
    return {
      packages: this.loadedPackages,
      totalHits: this.totalHits,
      hasMore: this.hasMore,
    };
  }
}

/**
 * Factory function for creating SearchService with dependency injection.
 * 
 * @param nugetClient - NuGet API client instance
 * @param logger - Logger instance
 * @returns ISearchService instance
 */
export function createSearchService(nugetClient: INuGetApiClient, logger: ILogger): ISearchService {
  return new SearchService(nugetClient, logger);
}
```

**CRITICAL NOTES:**
- The current `searchPackages()` return type does not include `totalHits` from API response
- The `searchParser` parses `totalHits` but doesn't expose it in the domain model
- **TODO**: Extend `NuGetResult<PackageSearchResult[]>` to include metadata like `totalHits`
- **Workaround**: For now, infer `hasMore` from page size comparison (if results.length < take, no more pages)
- This is a known limitation that should be addressed in a separate refactor

</component>

## <component name="SearchServiceState">

**File**: `src/webviews/services/searchService.ts`

State properties for pagination management:

```typescript
private currentPage = 0;          // Current page index (0-based)
private totalHits = 0;             // Total matching packages from API
private loadedPackages: PackageSearchResult[] = [];  // Accumulated results
private hasMore = false;           // Whether more pages available
private isLoading = false;         // Request in-flight flag
private lastSearchOptions: SearchOptions | null = null;  // For pagination continuation
```

**State Transitions:**
- `search()` → resets all state to defaults, sets `lastSearchOptions`
- `loadNextPage()` → increments `currentPage`, appends to `loadedPackages`
- `resetPagination()` → clears all state, called on filter changes

</component>

## <component name="SearchMethod">

**File**: `src/webviews/services/searchService.ts`

Implementation pattern:

```typescript
async search(
  query: string,
  options?: Omit<SearchOptions, 'query' | 'skip'>,
  signal?: AbortSignal,
): Promise<SearchResult> {
  // 1. Reset pagination state
  this.resetPagination();
  
  // 2. Store search options for subsequent pages
  this.lastSearchOptions = {
    query,
    includePrerelease: options?.includePrerelease ?? false,
    take: options?.take ?? DEFAULT_PAGE_SIZE,
  };

  // 3. Fetch first page (skip: 0)
  return this.fetchPage(0, signal);
}
```

</component>

## <component name="LoadNextPageMethod">

**File**: `src/webviews/services/searchService.ts`

Implementation with guards:

```typescript
async loadNextPage(signal?: AbortSignal): Promise<SearchResult> {
  // Guard: No more pages available
  if (!this.hasMore) {
    return this.getCurrentResult();
  }

  // Guard: Request already in progress (deduplication)
  if (this.isLoading) {
    this.logger.debug('Request in progress, ignoring loadNextPage');
    return this.getCurrentResult();
  }

  // Guard: No previous search
  if (!this.lastSearchOptions) {
    this.logger.warn('loadNextPage called without search');
    return this.getCurrentResult();
  }

  // Calculate next page and fetch
  const nextPage = this.currentPage + 1;
  return this.fetchPage(nextPage, signal);
}
```

**Skip Calculation:**
```typescript
const skip = page * pageSize;
// page 0: skip = 0  (packages 0-19)
// page 1: skip = 20 (packages 20-39)
// page 2: skip = 40 (packages 40-59)
```

</component>

## <component name="RequestDeduplication">

**File**: `src/webviews/services/searchService.ts`

Pattern using `isLoading` flag:

```typescript
private async fetchPage(page: number, signal?: AbortSignal): Promise<SearchResult> {
  this.isLoading = true;  // Set at start

  try {
    const result = await this.nugetClient.searchPackages(/* ... */);
    // ... process result
    return this.getCurrentResult();
  } finally {
    this.isLoading = false;  // Always reset in finally block
  }
}
```

**Concurrent Request Handling:**
- If `isLoading === true`, `loadNextPage()` returns current state immediately
- Prevents duplicate API calls when user rapidly scrolls
- Ensures UI doesn't overwhelm API with requests

</component>

## <component name="HasMoreCalculation">

**File**: `src/webviews/services/searchService.ts`

Logic for determining if more pages exist:

```typescript
// After API response:
const pageSize = this.lastSearchOptions.take ?? DEFAULT_PAGE_SIZE;

if (result.result.length < pageSize) {
  // Partial page means no more results
  this.hasMore = false;
} else {
  // Full page means potentially more results
  this.hasMore = true;
}

// Alternative with totalHits (when available):
this.hasMore = this.loadedPackages.length < this.totalHits;
```

**Edge Cases:**
- Empty results (`result.length === 0`) → `hasMore = false`
- Exact page boundary (e.g., 40 total, 20 per page) → requires totalHits to detect
- Single page (results < pageSize on first page) → `hasMore = false`

</component>

## <component name="ErrorHandling">

**File**: `src/webviews/services/searchService.ts`

Pattern for preserving state on errors:

```typescript
const result = await this.nugetClient.searchPackages(/* ... */);

if (!result.success) {
  this.logger.error('API request failed', result.error);
  
  // DO NOT modify loadedPackages on error
  // Return current state with error included
  return {
    packages: this.loadedPackages,  // Previous packages preserved
    totalHits: this.totalHits,
    hasMore: this.hasMore,
    error: result.error,  // Error passed to caller for UI display
  };
}
```

**Error Recovery:**
- UI displays error message at bottom of list
- "Retry" button calls `loadNextPage()` again with same page number
- Previous results remain visible to user

</component>

## <component name="ExtendSearchResponse">

**File**: `src/webviews/apps/packageBrowser/types.ts`

Extend message type to include pagination metadata:

```typescript
export interface SearchResponseMessage extends WebviewMessage {
  type: 'notification';
  name: 'searchResponse';
  args: {
    query: string;
    results: PackageSearchResult[];
    totalHits: number;      // NEW: Total matching packages
    hasMore: boolean;       // NEW: Whether more pages available
    requestId?: string;
    error?: {
      message: string;
      code: string;
    };
  };
}
```

</component>

## <component name="LoadMoreMessage">

**File**: `src/webviews/apps/packageBrowser/types.ts`

Add new message type for pagination:

```typescript
export interface LoadMoreRequestMessage extends WebviewMessage {
  type: 'request';
  name: 'loadMore';
  args: {
    requestId?: string;
  };
}

export function isLoadMoreRequestMessage(msg: unknown): msg is LoadMoreRequestMessage {
  return (
    isWebviewMessage(msg) &&
    msg.type === 'request' &&
    msg.name === 'loadMore'
  );
}
```

**Alternative Approach:**
Reuse `SearchRequestMessage` with `skip` parameter to indicate continuation of current search.

</component>

## <component name="ServiceInjection">

**File**: `src/webviews/packageBrowserWebview.ts`

Inject Search Service into webview host:

```typescript
import { createSearchService, type ISearchService } from './services/searchService';

export function createPackageBrowserWebview(
  context: vscode.ExtensionContext,
  logger: ILogger,
  nugetClient: INuGetApiClient,
): vscode.WebviewPanel {
  // Create search service instance
  const searchService = createSearchService(nugetClient, logger);

  const panel = vscode.window.createWebviewPanel(/* ... */);

  // Handle messages using service
  panel.webview.onDidReceiveMessage(message => {
    void handleWebviewMessage(message, panel, logger, searchService);
  });

  return panel;
}
```

**Note:** Webview now depends on `ISearchService`, not `INuGetApiClient` directly.

</component>

## <component name="ReplaceDirectCalls">

**File**: `src/webviews/packageBrowserWebview.ts`

Replace direct API calls with service calls:

```typescript
// BEFORE:
async function handleSearchRequest(
  message: SearchRequestMessage,
  panel: vscode.WebviewPanel,
  logger: ILogger,
  nugetClient: INuGetApiClient,  // Direct dependency
): Promise<void> {
  const result = await nugetClient.searchPackages(/* ... */);
  // ...
}

// AFTER:
async function handleSearchRequest(
  message: SearchRequestMessage,
  panel: vscode.WebviewPanel,
  logger: ILogger,
  searchService: ISearchService,  // Service dependency
): Promise<void> {
  const result = await searchService.search(
    message.payload.query,
    {
      includePrerelease: message.payload.includePrerelease,
    },
  );
  // ...
}
```

</component>

## <component name="LoadMoreHandler">

**File**: `src/webviews/packageBrowserWebview.ts`

Add new message handler for pagination:

```typescript
async function handleLoadMoreRequest(
  message: LoadMoreRequestMessage,
  panel: vscode.WebviewPanel,
  logger: ILogger,
  searchService: ISearchService,
): Promise<void> {
  logger.info('Load more request received', { requestId: message.args.requestId });

  const result = await searchService.loadNextPage();

  if (result.error) {
    // Send error response
    const response: SearchResponseMessage = {
      type: 'notification',
      name: 'searchResponse',
      args: {
        query: '',  // Use last search query from service state
        results: result.packages,
        totalHits: result.totalHits,
        hasMore: result.hasMore,
        requestId: message.args.requestId,
        error: {
          message: 'Failed to load more results',
          code: result.error.code,
        },
      },
    };
    await panel.webview.postMessage(response);
    return;
  }

  // Send success response with accumulated packages
  const response: SearchResponseMessage = {
    type: 'notification',
    name: 'searchResponse',
    args: {
      query: '',
      results: result.packages,  // All loaded packages
      totalHits: result.totalHits,
      hasMore: result.hasMore,
      requestId: message.args.requestId,
    },
  };

  await panel.webview.postMessage(response);
}
```

</component>

## <component name="ResultsListComponent">

**File**: `src/webviews/apps/packageBrowser/components/package-results-list.ts`

Lit component structure:

```typescript
import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { PackageSearchResult } from '../../../../domain/models/packageSearchResult';

export const PACKAGE_RESULTS_LIST_TAG = 'package-results-list' as const;

@customElement(PACKAGE_RESULTS_LIST_TAG)
export class PackageResultsList extends LitElement {
  @property({ type: Array }) packages: PackageSearchResult[] = [];
  @property({ type: Number }) totalHits = 0;
  @property({ type: Boolean }) hasMore = false;
  @property({ type: Boolean }) isLoading = false;

  @state() private observer: IntersectionObserver | null = null;
  @state() private sentinelElement: HTMLElement | null = null;

  // Lifecycle hooks and render method...
}
```

</component>

## <component name="IntersectionObserver">

**File**: `src/webviews/apps/packageBrowser/components/package-results-list.ts`

Scroll detection implementation:

```typescript
firstUpdated() {
  // Create sentinel element for scroll detection
  this.sentinelElement = this.shadowRoot?.querySelector('.load-more-sentinel') as HTMLElement;

  if (!this.sentinelElement) return;

  // Create Intersection Observer with 200px threshold
  this.observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && this.hasMore && !this.isLoading) {
          // Emit load-more event
          this.dispatchEvent(new CustomEvent('load-more', {
            bubbles: true,
            composed: true,
          }));
        }
      });
    },
    {
      root: null,  // Use viewport as root
      rootMargin: '200px',  // Trigger 200px before reaching sentinel
      threshold: 0,
    }
  );

  this.observer.observe(this.sentinelElement);
}

disconnectedCallback() {
  super.disconnectedCallback();
  
  // Clean up observer to prevent memory leaks
  if (this.observer && this.sentinelElement) {
    this.observer.unobserve(this.sentinelElement);
    this.observer.disconnect();
  }
}
```

**Template:**
```typescript
render() {
  return html`
    <div class="results-container">
      ${this.packages.map(pkg => this.renderPackageCard(pkg))}
      
      <!-- Sentinel element for Intersection Observer -->
      <div class="load-more-sentinel"></div>
      
      ${this.renderLoadingState()}
    </div>
  `;
}
```

</component>

## <component name="AriaLiveRegion">

**File**: `src/webviews/apps/packageBrowser/components/package-results-list.ts`

Accessibility implementation:

```typescript
render() {
  const loadingAnnouncement = this.isLoading 
    ? 'Loading more packages...' 
    : this.hasMore 
      ? '' 
      : 'All packages loaded';

  return html`
    <!-- ARIA live region for screen readers -->
    <div 
      role="status" 
      aria-live="polite" 
      aria-atomic="true"
      class="sr-only"
    >
      ${loadingAnnouncement}
    </div>

    <!-- Results count indicator -->
    <div class="results-count" aria-live="polite">
      Showing ${this.packages.length} of ${this.totalHits} packages
    </div>

    <!-- Package list -->
    <div class="results-container">
      ${this.packages.map(pkg => this.renderPackageCard(pkg))}
    </div>
  `;
}
```

**CSS:**
```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```

</component>

## <component name="UnitTestSearch">

**File**: `src/webviews/services/__tests__/searchService.test.ts`

Test for search method:

```typescript
import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { SearchService } from '../searchService';
import type { INuGetApiClient } from '../../../domain/nugetApiClient';
import type { ILogger } from '../../../services/loggerService';

describe('SearchService', () => {
  describe('search()', () => {
    it('should reset pagination state on new search', async () => {
      const mockClient = createMockClient();
      const mockLogger = createMockLogger();
      const service = new SearchService(mockClient, mockLogger);

      // Load multiple pages
      await service.search('test', { includePrerelease: false });
      await service.loadNextPage();
      await service.loadNextPage();

      const stateBefore = service.getState();
      expect(stateBefore.currentPage).toBe(2);
      expect(stateBefore.loadedCount).toBeGreaterThan(20);

      // New search should reset
      await service.search('new query', { includePrerelease: true });

      const stateAfter = service.getState();
      expect(stateAfter.currentPage).toBe(0);
      expect(stateAfter.loadedCount).toBe(20);
    });

    it('should fetch first page with skip: 0', async () => {
      const mockClient = createMockClient();
      const service = new SearchService(mockClient, createMockLogger());

      await service.search('json', { includePrerelease: false });

      expect(mockClient.searchPackages).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'json',
          skip: 0,
          take: 20,
        }),
        expect.anything(),
      );
    });
  });
});
```

</component>

## <component name="UnitTestLoadNextPage">

**File**: `src/webviews/services/__tests__/searchService.test.ts`

Test for loadNextPage skip calculation:

```typescript
it('should calculate correct skip offset for each page', async () => {
  const mockClient = createMockClient();
  const service = new SearchService(mockClient, createMockLogger());

  await service.search('test', { includePrerelease: false });
  
  // Page 1: skip = 20
  await service.loadNextPage();
  expect(mockClient.searchPackages).toHaveBeenLastCalledWith(
    expect.objectContaining({ skip: 20, take: 20 }),
    expect.anything(),
  );

  // Page 2: skip = 40
  await service.loadNextPage();
  expect(mockClient.searchPackages).toHaveBeenLastCalledWith(
    expect.objectContaining({ skip: 40, take: 20 }),
    expect.anything(),
  );

  // Page 3: skip = 60
  await service.loadNextPage();
  expect(mockClient.searchPackages).toHaveBeenLastCalledWith(
    expect.objectContaining({ skip: 60, take: 20 }),
    expect.anything(),
  );
});
```

</component>

## <component name="UnitTestDeduplication">

**File**: `src/webviews/services/__tests__/searchService.test.ts`

Test for concurrent request prevention:

```typescript
it('should prevent concurrent pagination requests', async () => {
  const mockClient = createMockClient({
    delay: 100,  // Simulate slow API
  });
  const service = new SearchService(mockClient, createMockLogger());

  await service.search('test');

  // Trigger multiple loadNextPage calls concurrently
  const promises = [
    service.loadNextPage(),
    service.loadNextPage(),
    service.loadNextPage(),
  ];

  await Promise.all(promises);

  // Should only make ONE additional API call (page 1)
  expect(mockClient.searchPackages).toHaveBeenCalledTimes(2);  // Initial + 1 pagination
});
```

</component>

## <component name="IntegrationTestMultiPage">

**File**: `test/integration/searchService.integration.test.ts`

Integration test for multi-page flow:

```typescript
import { describe, it, expect } from 'bun:test';
import { createNuGetApiClient } from '../../src/env/node/nugetApiClient';
import { createSearchService } from '../../src/webviews/services/searchService';
import { createMockLogger } from '../helpers/mockLogger';

describe('SearchService Integration', () => {
  it('should load multiple pages and accumulate results', async () => {
    const client = createNuGetApiClient(createMockLogger());
    const service = createSearchService(client, createMockLogger());

    // Initial search
    const page1 = await service.search('json', { includePrerelease: false, take: 20 });
    expect(page1.packages.length).toBe(20);
    expect(page1.totalHits).toBeGreaterThan(20);
    expect(page1.hasMore).toBe(true);

    // Load second page
    const page2 = await service.loadNextPage();
    expect(page2.packages.length).toBe(40);  // Accumulated
    expect(page2.totalHits).toBeGreaterThan(40);
    expect(page2.hasMore).toBe(true);

    // Verify no duplicate packages
    const ids = page2.packages.map(p => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(40);
  });
});
```

</component>

## <component name="E2ETestScroll">

**File**: `test/e2e/packageBrowserPagination.e2e.ts`

E2E test for scroll-based pagination:

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Package Browser Pagination E2E', function () {
  this.timeout(10000);

  test('should load next page on scroll', async function () {
    // Open package browser
    await vscode.commands.executeCommand('opm.openPackageBrowser');
    await new Promise(resolve => setTimeout(resolve, 500));

    // Get webview panel (implementation depends on how we expose it for testing)
    // For now, this is pseudocode showing the intent
    const panel = getActiveWebviewPanel();
    assert.ok(panel, 'Webview panel should be created');

    // Simulate search via IPC
    await panel.webview.postMessage({
      type: 'request',
      name: 'search',
      args: { query: 'json', includePrerelease: false },
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Simulate scroll to bottom (triggers loadMore event in webview)
    // Note: Cannot directly manipulate webview DOM from Extension Host
    // This test verifies the IPC flow, not the actual scroll behavior
    await panel.webview.postMessage({
      type: 'request',
      name: 'loadMore',
      args: {},
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify second page loaded (check via message handler spy or state)
    // This requires exposing webview state for testing
  });
});
```

**Note:** E2E tests for webviews are limited to IPC flow testing. Actual scroll behavior must be tested in unit tests with JSDOM or manual testing.

</component>

## <component name="ManualTesting">

**Testing Checklist**

Performance Testing:
- [ ] Search for "Microsoft" (high result count ~5000+)
- [ ] Scroll through 10+ pages (200+ packages)
- [ ] Verify smooth scrolling with no lag or jank
- [ ] Open DevTools Performance panel and check for memory leaks
- [ ] Verify DOM node count doesn't grow excessively (consider virtual scrolling if >100 items)

Rapid Scroll Testing:
- [ ] Quickly scroll to bottom multiple times
- [ ] Verify only one API request in-flight (check Network tab)
- [ ] Verify no duplicate packages in results list
- [ ] Verify loading spinner appears/disappears correctly

Edge Cases:
- [ ] Search for nonsense term → verify "No packages found" with no pagination UI
- [ ] Search with 15 results total → verify no pagination trigger, all loaded immediately
- [ ] Search with exactly 20 results → verify hasMore = false
- [ ] Search with 21 results → verify hasMore = true, second page loads 1 package

Error Recovery:
- [ ] Disconnect network during pagination → verify error message + retry button
- [ ] Click retry → verify page loads successfully
- [ ] Verify previous packages remain visible during error state

</component>

---

# Implementation Notes

## Critical Issue: `totalHits` Not in Domain Model

The NuGet Search API returns `totalHits` in the JSON response, and `searchParser.ts` currently parses it into the `NuGetSearchResponse` interface. However, this metadata is **not exposed** in the domain model's return type.

**Current Flow:**
```typescript
// searchParser.ts
interface NuGetSearchResponse {
  totalHits: number;  // ✅ Parsed from API
  data: Array<{...}>;
}

export function parseSearchResponse(apiResponse: unknown): PackageSearchResult[] {
  // Returns ONLY array of packages, totalHits is discarded ❌
}
```

**Required Change:**
The domain layer should return a richer result type:

```typescript
export interface SearchResultWithMetadata {
  packages: PackageSearchResult[];
  totalHits: number;
  // Future: add `hasNextPage`, `cursors`, etc.
}

export function parseSearchResponse(apiResponse: unknown): SearchResultWithMetadata {
  const response = apiResponse as Partial<NuGetSearchResponse>;
  
  return {
    packages: response.data.map(...),
    totalHits: response.totalHits ?? 0,
  };
}
```

**Impact:**
- This change affects `NuGetApiClient.searchPackages()` return type
- All callers of `searchPackages()` must be updated
- Should be done in a separate refactoring story **before** implementing pagination

**Workaround for This Story:**
Use heuristic `hasMore` detection based on page size:
```typescript
this.hasMore = result.result.length === pageSize;
```

This is imperfect (can't detect exact result count) but functional for MVP.

## Performance Considerations

**Virtual Scrolling:**
For result sets >100 packages, consider implementing virtual scrolling using `@lit-labs/virtualizer`:

```typescript
import { html } from 'lit';
import { virtualize } from '@lit-labs/virtualizer/virtualize.js';

render() {
  return html`
    <div class="results-container">
      ${virtualize({
        items: this.packages,
        renderItem: (pkg) => this.renderPackageCard(pkg),
      })}
    </div>
  `;
}
```

Benefits:
- Only renders visible DOM nodes (~20-30 items)
- Maintains smooth scroll performance with 1000+ packages
- Reduces memory footprint

**Intersection Observer vs Scroll Events:**
- ✅ Use Intersection Observer (implemented in this plan)
- ❌ Avoid scroll event listeners (fire on every pixel, performance cost)
- Intersection Observer is debounced by browser, more efficient

## Future Enhancements

This Search Service architecture prepares for:

1. **Multi-Source Search Aggregation:**
   ```typescript
   async search(query: string, sourceIds?: string[]) {
     // Fetch from multiple sources in parallel
     // Merge results with source metadata
   }
   ```

2. **Search Results Caching (STORY-001-01-011):**
   ```typescript
   private cache = new Map<string, CachedResult>();
   
   async search(query: string) {
     const cached = this.cache.get(cacheKey);
     if (cached && !isExpired(cached)) {
       return cached.result;
     }
     // ... fetch from API
   }
   ```

3. **Installed Package Filtering:**
   ```typescript
   async search(query: string, options: { hideInstalled?: boolean }) {
     // Fetch installed packages from .csproj
     // Filter search results to exclude installed
   }
   ```

4. **Request Deduplication Across Services (STORY-001-01-010):**
   Move deduplication logic to a shared `RequestCache` service that multiple consumers can use.

---

**Implementation Plan Status**: Not Started  
**Estimated Effort**: 5-8 hours (includes testing)  
**Dependencies**: STORY-001-01-001, STORY-001-01-002, STORY-001-01-003

---
**Document ID**: IMPL-001-01-007-search-paging  
**Story**: [STORY-001-01-007-search-paging](../stories/STORY-001-01-007-search-paging.md)
