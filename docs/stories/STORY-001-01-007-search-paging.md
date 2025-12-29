# STORY-001-01-007-search-paging

**Feature**: [FEAT-001-01-browse-search](../features/FEAT-001-01-browse-search.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Done
**Priority**: Medium  
**Estimate**: 3 Story Points  
**Created**: 2025-11-16  
**Last Updated**: 2025-12-29

## User Story

**As a** developer using the NuGet Package Management extension  
**I want** to scroll through paginated search results seamlessly  
**So that** I can browse large package sets without manual page navigation or overwhelming the UI

## Description

This story implements infinite scroll pagination for NuGet package search results in the Package Browser webview. Currently, the API client fetches only the first 20 packages (`take: 20, skip: 0`), limiting users to viewing a small subset of available packages. With thousands of packages matching common search terms, users need the ability to load additional results dynamically as they scroll.

The implementation leverages the NuGet API's `totalHits` response property to determine the total number of available results, enabling the UI to show progress indicators ("Showing 20 of 1,234 packages") and load subsequent pages using the `skip` and `take` parameters. The scroll detection logic will trigger additional API calls when the user approaches the bottom of the results list, creating a seamless browsing experience without explicit "Next Page" buttons.

To prevent `packageBrowserWebview.ts` from becoming a monolithic "god component," this story introduces a dedicated **Search Service** component that encapsulates all pagination logic, state management, and API interaction. This service acts as an intermediary layer between the webview and the NuGet API client, isolating search-specific concerns and preparing the architecture for future features like installed package filtering and multi-source search aggregation.

## Acceptance Criteria

### Scenario: Initial Search Results Load
**Given** a user searches for "json" in the Package Browser  
**When** the search completes  
**Then** the first 20 packages are displayed with a results count indicator (e.g., "Showing 20 of 3,456 packages")  
**And** the scroll container allows vertical scrolling if results exceed viewport height

### Scenario: Load More Results on Scroll
**Given** the user has searched for a common package keyword with 100+ total results  
**When** the user scrolls to within 200px of the bottom of the results list  
**Then** the next 20 packages are automatically fetched and appended to the results list  
**And** a loading spinner appears at the bottom during the fetch operation  
**And** the results count updates (e.g., "Showing 40 of 3,456 packages")

### Scenario: All Results Loaded
**Given** the user has scrolled through all available search results  
**When** the total number of displayed packages equals `totalHits` from the API response  
**Then** no additional API calls are triggered on scroll  
**And** the UI displays "All packages loaded" or hides the loading indicator  
**And** the scroll trigger is disabled to prevent unnecessary API calls

### Scenario: Pagination State Reset on New Search
**Given** the user has scrolled through 3 pages of results (60 packages loaded)  
**When** the user enters a new search query or changes filters (prerelease toggle)  
**Then** the pagination state resets to page 1 (skip: 0)  
**And** the results list clears before showing new results  
**And** the results count reflects the new search (e.g., "Showing 20 of 842 packages")

### Scenario: Error Handling During Pagination
**Given** the user is on page 2 of search results  
**When** an API request for page 3 fails (network error, rate limit, etc.)  
**Then** an error message appears at the bottom of the results list  
**And** a "Retry" button allows re-fetching the failed page  
**And** previously loaded results remain visible  
**And** the results count does not change

### Scenario: Concurrent Pagination Requests Prevented
**Given** the user rapidly scrolls down while a pagination request is in-flight  
**When** the scroll position crosses the pagination threshold multiple times  
**Then** only one API request is active at a time  
**And** subsequent scroll events are ignored until the current request completes  
**And** the loading spinner remains visible until the request resolves

### Additional Criteria
- [ ] **API Integration**: Search Service uses NuGet API's `skip` and `take` parameters for pagination (default: `take=20`)
- [ ] **Total Results**: UI displays total package count from API's `totalHits` property
- [ ] **Scroll Detection**: Intersection Observer or scroll event listener triggers pagination when user is within 200px of bottom
- [ ] **Loading States**: Loading spinner displayed at bottom of list during API calls; disabled state prevents interaction
- [ ] **Request Deduplication**: Only one pagination request allowed in-flight at a time; subsequent scroll events queued or ignored
- [ ] **State Management**: Pagination state (currentPage, totalHits, hasMore) encapsulated in Search Service
- [ ] **Component Isolation**: `packageBrowserWebview.ts` delegates all search/pagination logic to Search Service; no direct NuGet API client dependency
- [ ] **Performance**: Virtual scrolling or DOM recycling considered for 100+ package lists to prevent memory bloat
- [ ] **Accessibility**: Scroll loading announced to screen readers via ARIA live region ("Loading more packages...")
- [ ] **Empty State**: Zero-result searches display "No packages found" without pagination controls
- [ ] **Single Page Results**: If `totalHits <= 20`, pagination controls are hidden and scroll trigger is disabled

## Technical Implementation

### Implementation Plan
This story introduces a **Search Service** layer to encapsulate pagination state, API interaction, and business logic, preventing `packageBrowserWebview.ts` from becoming a god component.

### Key Components

**New Components:**
- **File**: `src/webviews/services/searchService.ts` - Pagination state manager and API orchestrator
  - Manages pagination state: `currentPage`, `totalHits`, `loadedPackages[]`, `hasMore`
  - Handles API calls via injected `INuGetApiClient`
  - Implements request deduplication for in-flight pagination requests
  - Exposes methods: `search()`, `loadNextPage()`, `resetPagination()`
  - Returns typed results: `{ packages: PackageSearchResult[], totalHits: number, hasMore: boolean }`

- **File**: `src/webviews/apps/packageBrowser/components/package-results-list.ts` - Lit component for results display
  - Renders package list with virtual scrolling support (if >100 items)
  - Implements Intersection Observer for scroll-based pagination triggers
  - Displays loading spinner during API calls
  - Shows results count indicator ("Showing X of Y packages")
  - Emits `load-more` custom event when scroll threshold reached

**Modified Components:**
- **File**: `src/webviews/packageBrowserWebview.ts`
  - Delegates search/pagination to `SearchService` instead of calling `nugetClient` directly
  - Handles IPC messages (`searchRequest`) by invoking `searchService.search()` or `searchService.loadNextPage()`
  - Passes search results to webview via existing `searchResponse` message format
  - Injects `ILogger` and `INuGetApiClient` into `SearchService` constructor

- **File**: `src/webviews/apps/packageBrowser/types.ts`
  - Extends `SearchResponseMessage` args to include `totalHits: number` and `hasMore: boolean` properties
  - Adds `LoadMoreRequestMessage` type for pagination-specific IPC messages (optional, can reuse `SearchRequestMessage` with updated `skip` value)

### Technical Approach

**Pagination Algorithm:**
1. User initiates search → `SearchService.search(query, options)` called with `skip: 0, take: 20`
2. API response includes `totalHits` and first 20 `data` items
3. Service calculates `hasMore = (loadedPackages.length < totalHits)`
4. UI renders packages and displays "Showing 20 of {totalHits} packages"
5. Intersection Observer detects scroll approaching bottom (within 200px)
6. UI emits `load-more` event → webview sends `LoadMoreRequest` message
7. Service calls `loadNextPage()` → API request with `skip: loadedPackages.length, take: 20`
8. New packages appended to `loadedPackages[]` array
9. `hasMore` recalculated; if false, scroll trigger disabled

**Request Deduplication:**
- Service maintains `isLoading: boolean` flag
- `loadNextPage()` returns immediately if `isLoading === true` or `hasMore === false`
- Flag set to `true` at request start, `false` on completion/error

**State Reset on New Search:**
- `search()` method clears `loadedPackages[]` and resets `currentPage = 0`
- New search invalidates previous pagination state completely

### API/Integration Points
- **NuGet Search API**: Uses `skip` (pagination offset) and `take` (page size) query parameters
- **API Response**: Extracts `totalHits` from root response object for total count indicator
- **VS Code IPC**: Webview communicates search/pagination requests via `postMessage`; host responds with `SearchResponseMessage`
- **Intersection Observer API**: Browser API for efficient scroll position detection without constant event listeners

## Testing Strategy

### Unit Tests
- [ ] **SearchService.search()**: Verify pagination state reset on new search query
- [ ] **SearchService.loadNextPage()**: Verify correct `skip` and `take` calculation based on loaded packages count
- [ ] **SearchService request deduplication**: Verify concurrent `loadNextPage()` calls are ignored while request is in-flight
- [ ] **SearchService.hasMore calculation**: Verify `hasMore` flag correctly reflects when all results loaded (`loadedPackages.length >= totalHits`)
- [ ] **SearchService error handling**: Verify failed pagination request does not corrupt state (previous packages retained)
- [ ] **Parse totalHits from API response**: Verify `totalHits` extracted correctly from NuGet Search API response schema

### Integration Tests
- [ ] **Multi-page search flow**: Search for "json" → verify first 20 packages → trigger pagination → verify next 20 packages appended → verify `totalHits` matches API response
- [ ] **Pagination exhaustion**: Load all pages for small result set (e.g., 35 total packages, 2 pages) → verify no additional requests after final page
- [ ] **Pagination reset on filter change**: Load 3 pages → toggle prerelease filter → verify pagination resets to page 1 with cleared results

### E2E Tests
- [ ] **Scroll-based pagination**: Open Package Browser → search for common term → scroll to bottom → verify second page loads automatically → verify loading spinner appears/disappears
- [ ] **Results count indicator**: Verify "Showing X of Y packages" updates correctly after each page load
- [ ] **Pagination error recovery**: Simulate network failure on page 2 → verify retry button appears → click retry → verify page 2 loads successfully
- [ ] **Accessibility**: Verify ARIA live region announces "Loading more packages..." when pagination triggered

### Manual Testing
- [ ] **Performance with 100+ packages**: Search for "Microsoft" (high result count) → scroll through 5+ pages → verify smooth scrolling and no memory leaks
- [ ] **Rapid scroll handling**: Quickly scroll to bottom multiple times → verify only one request in-flight, no duplicate API calls
- [ ] **Zero results**: Search for nonsense term "xyzabc123" → verify "No packages found" message, no pagination controls displayed
- [ ] **Single page results**: Search with prerelease=false and uncommon term (15 results) → verify no pagination trigger, all results loaded immediately

## Dependencies

### Blocked By
- [STORY-001-01-001](./STORY-001-01-001-nuget-search-api.md) - NuGet API client must support `skip`/`take` parameters (✅ Completed)
- [STORY-001-01-002](./STORY-001-01-002-search-webview-ui.md) - Base webview UI must exist for rendering results (✅ Completed)
- [STORY-001-01-003](./STORY-001-01-003-search-results-list.md) - Package results list component must render packages (✅ Completed)

### Blocks
- [STORY-001-01-011](./STORY-001-01-011-search-cache.md) - Search cache implementation depends on pagination state management
- Future: Installed package filtering in browser view (context mentioned by user)

### External Dependencies
- **NuGet Search API v3**: Must return `totalHits` property in response (✅ Verified in API spec)
- **Intersection Observer API**: Browser API for scroll detection (widely supported in modern browsers)
- **Lit 3.x**: Required for Lit component implementation

## INVEST Check

- [x] **I**ndependent - Can be developed independently (depends on STORY-001-01-001/002/003 which are completed)
- [x] **N**egotiable - Details can be adjusted (page size, scroll threshold, loading states)
- [x] **V**aluable - Delivers value to users (enables browsing large package sets beyond first 20 results)
- [x] **E**stimable - Can be estimated (3 story points: Search Service + scroll detection + state management)
- [x] **S**mall - Can be completed in one iteration (focused on pagination only, no complex UI changes)
- [x] **T**estable - Has clear acceptance criteria (unit, integration, E2E tests defined)

## Notes

### Architectural Decision: Search Service Introduction
To prevent `packageBrowserWebview.ts` from becoming a "god component," this story introduces a dedicated **Search Service** that encapsulates all search and pagination logic. This service layer provides several benefits:

1. **Separation of Concerns**: Webview focuses on IPC and rendering; service handles business logic and state
2. **Testability**: Service can be unit tested in isolation without webview or VS Code APIs
3. **Future Extensibility**: Prepares architecture for upcoming features:
   - Installed package filtering/overlay on search results (future story)
   - Multi-source search aggregation (NuGet.org + private feeds)
   - Search caching with TTL-based invalidation (STORY-001-01-011)
   - Request deduplication across concurrent searches (STORY-001-01-010)

### API Response Structure
The NuGet Search API v3 returns pagination metadata in the root response object:
```json
{
  "totalHits": 3456,  // Total matching packages (ignores skip/take)
  "data": [ /* array of 20 packages */ ]
}
```
This enables the UI to display accurate progress indicators ("Showing 20 of 3,456 packages") without additional API calls.

### Page Size Considerations
- **Default**: 20 packages per page (matches current implementation)
- **Maximum**: NuGet.org enforces a max `take` value of 1000, but smaller page sizes (20-50) provide better UX with faster load times
- **Virtual Scrolling**: For result sets >100 packages, consider implementing virtual scrolling (e.g., using `@lit-labs/virtualizer`) to prevent DOM bloat and maintain scroll performance

### Scroll Threshold Tuning
- **200px from bottom**: Triggers next page load when user is 200px from the bottom of the scroll container
- Alternative approaches: trigger at 80% scroll position or when last 3 packages become visible
- Use Intersection Observer for performance; avoid scroll event listeners that fire on every pixel

### Edge Cases
- **Zero results**: Display "No packages found" message; disable pagination entirely
- **Single page**: If `totalHits <= 20`, hide pagination controls and loading indicators
- **Slow network**: Show loading spinner indefinitely until request completes or times out (60s)
- **Rapid filter changes**: Cancel in-flight pagination requests when user changes search query or filters (use AbortController)

### Future Considerations
This pagination implementation sets the foundation for:
- **Installed package overlay**: Display installed packages at top of search results, with search filtering applied to both sections
- **Source switching**: Paginate across multiple package sources (NuGet.org, private feeds) with per-source result counts
- **Keyboard navigation**: Support PgUp/PgDown and Home/End keys for page-based navigation

## Changelog

| Date | Change | Author |
|---|---|---|
| 2025-12-29 | Updated with product-level acceptance criteria, Search Service architecture, API integration details, and comprehensive testing strategy | GitHub Copilot |
| 2025-11-16 | Story created | AI Assistant |

---
**Story ID**: STORY-001-01-007-search-paging  
**Feature**: [FEAT-001-01-browse-search](../features/FEAT-001-01-browse-search.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)
