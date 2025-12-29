# STORY-001-01-006-search-sorting

**Feature**: [FEAT-001-01-browse-search](../features/FEAT-001-01-browse-search.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Descoped  
**Priority**: Low  
**Estimate**: 2 Story Points  
**Created**: 2025-11-16  
**Last Updated**: 2025-12-29

## User Story

**As a** developer browsing NuGet packages  
**I want** to sort search results by different criteria  
**So that** I can find the most relevant, popular, or recently updated packages for my needs

## Description

This story implements server-side search result sorting functionality using the NuGet v3 Search API's native ordering capabilities. The implementation provides users with three sort options that match nuget.org's web interface: **Relevance** (default), **Downloads**, and **Recently Updated**.

The sorting feature enhances package discoverability by allowing users to prioritize results based on their specific needs. Developers searching for established solutions benefit from sorting by Downloads (popularity), while those seeking cutting-edge packages or active maintenance can sort by Recently Updated. The default Relevance sort balances multiple signals (name match, tags, description) to surface the most contextually appropriate results.

This implementation strictly uses **server-side sorting only**—no client-side re-ordering is performed. The extension passes the selected sort mode to the NuGet API via query parameters and renders results in the order returned by the server. This approach ensures consistency with nuget.org behavior, reduces client-side complexity, and leverages the NuGet service's optimized ranking algorithms. The UI provides a simple, accessible sort control integrated into the package browser webview following VS Code design patterns.

## Acceptance Criteria

### Scenario: Sort by Relevance (Default)
**Given** I have opened the NuGet Package Browser  
**When** I perform a search without changing the sort option  
**Then** results are displayed in Relevance order (NuGet API default)  
**And** the sort control shows "Relevance" as selected

### Scenario: Sort by Downloads (Popularity)
**Given** I have search results displayed  
**When** I select "Downloads" from the sort dropdown  
**Then** results are re-fetched from the NuGet API with the Downloads sort parameter  
**And** packages are displayed in descending download count order  
**And** the sort selection persists for subsequent searches in the same session

### Scenario: Sort by Recently Updated
**Given** I have search results displayed  
**When** I select "Recently Updated" from the sort dropdown  
**Then** results are re-fetched from the NuGet API with the Recently Updated sort parameter  
**And** packages are displayed with the most recently updated packages first  
**And** the sort selection persists for subsequent searches in the same session

### Scenario: Sort Selection Persists Across Searches
**Given** I have selected "Downloads" as the sort mode  
**When** I perform a new search with a different query  
**Then** the new results are fetched using the Downloads sort parameter  
**And** the sort dropdown still shows "Downloads" as selected

### Additional Criteria
- [ ] Sort control is a dropdown/select element with three options: Relevance, Downloads, Recently Updated
- [ ] Sort control is **only visible when connected to nuget.org sources** (hidden for third-party sources)
- [ ] Source detection logic implemented: `isSortSupported(sourceUrl)` checks if URL matches nuget.org endpoints
- [ ] Sort control is keyboard accessible (Tab to focus, Arrow keys to navigate, Enter/Space to select)
- [ ] Changing sort mode triggers a new API request with the appropriate `orderBy` parameter
- [ ] Sort selection is stored in webview state and persists within the same webview session
- [ ] Sort selection **resets to Relevance** when switching to a different package source
- [ ] Sort control uses VS Code theming (vscode-webview-ui-toolkit components preferred)
- [ ] Loading indicator is shown while re-fetching results after sort change
- [ ] Sort control is disabled/grayed out when no search results are available
- [ ] ARIA labels are provided for screen reader accessibility
- [ ] No client-side sorting is implemented—all ordering is server-side only
- [ ] When connected to third-party sources, results display in default API-returned order (no user control)

## Technical Implementation

### Implementation Plan
No separate technical implementation document required—implementation details are documented below.

### Key Components
- **UI Component**: `src/webviews/apps/package-browser/components/search-controls.ts` - Sort dropdown UI element
- **State Management**: Webview state to persist selected sort mode across searches
- **API Client**: `src/env/node/nugetApiClient.ts` - NuGet Search API integration with `orderBy` parameter support
- **IPC Protocol**: Request/response messages between webview and extension host for sort changes

### Technical Approach

**NuGet Search API v3 - Sort Parameters (nuget.org-specific)**

⚠️ **IMPORTANT**: The `orderBy` parameter is **not part of the official NuGet v3 API specification** (see [Microsoft documentation](https://learn.microsoft.com/en-us/nuget/api/search-query-service-resource)). It is a **proprietary extension implemented by nuget.org's Azure Search backend**.

The nuget.org Search API endpoint (`https://azuresearch-usnc.nuget.org/query`) supports the following **unofficial** `orderBy` values:

| Sort Mode | `orderBy` Value | API Behavior | nuget.org Only |
|-----------|----------------|--------------|----------------|
| Relevance | (omit parameter or empty) | Default semantic relevance ranking | ✅ |
| Downloads | `totalDownloads-desc` | Sort by total download count, descending | ✅ |
| Recently Updated | `lastEdited-desc` or `published-desc` | Sort by last publish/edit date, descending | ✅ |

**Third-party NuGet sources (Artifactory, GitHub Packages, Azure Artifacts, MyGet, BaGet, NuGet.Server) do NOT support this parameter.**

**Implementation Flow:**
1. User opens Package Browser connected to a package source
2. Extension detects if source is nuget.org (`isSortSupported()` checks source URL)
3. **If nuget.org**: Show sort dropdown with Relevance/Downloads/Recently Updated options
4. **If third-party source**: Hide sort dropdown entirely (no sorting available)
5. User selects sort option from dropdown (nuget.org only)
6. Webview sends `searchPackages` request to extension host with `orderBy` parameter
7. Extension host calls `NuGetApiClient.searchPackages()` with sort parameter
8. API client constructs URL: `https://azuresearch-usnc.nuget.org/query?q={query}&orderBy={sortMode}&take={pageSize}&skip={offset}`
9. Results are returned to webview and rendered in API-provided order
10. Sort selection is persisted in webview component state (resets when switching sources)

**UI Design - VS Code Extension Ergonomics:**

```typescript
// Webview UI (Lit component)
<div class="search-controls">
  <vscode-text-field 
    placeholder="Search packages..." 
    @input=${this.handleSearchInput}>
  </vscode-text-field>
  
  <vscode-dropdown 
    id="sort-mode"
    aria-label="Sort search results by"
    @change=${this.handleSortChange}>
    <vscode-option value="">Relevance</vscode-option>
    <vscode-option value="totalDownloads-desc">Downloads</vscode-option>
    <vscode-option value="lastEdited-desc">Recently Updated</vscode-option>
  </vscode-dropdown>
</div>
```

**Accessibility & UX Considerations:**
- Place sort control to the right of the search input, aligned horizontally
- Use `vscode-dropdown` from `@vscode/webview-ui-toolkit` for native VS Code styling
- Label the dropdown with `aria-label="Sort search results by"`
- Show visual loading state during re-fetch (spinner overlay or disabled state)
- Display result count with current sort mode: "1,234 packages (sorted by Downloads)"

### API/Integration Points
- **NuGet Search API v3**: `GET /query?q={query}&orderBy={mode}&take={size}&skip={offset}`
  - Reference: https://learn.microsoft.com/en-us/nuget/api/search-query-service-resource
  - Parameter: `orderBy` (optional, string: `totalDownloads-desc`, `lastEdited-desc`, `published-desc`)
- **Webview IPC Protocol**: `searchPackages` request with `{ query, orderBy, take, skip }` payload
- **VS Code Webview API**: `vscode.postMessage()` for webview-to-host communication
- **@vscode/webview-ui-toolkit**: `vscode-dropdown` component for theme-aware UI

## Testing Strategy

### Unit Tests
- [ ] `NuGetApiClient.searchPackages()` constructs correct URL with `orderBy` parameter for each sort mode
- [ ] `NuGetApiClient.searchPackages()` omits `orderBy` parameter when sort mode is Relevance/default
- [ ] Webview component state correctly stores and retrieves selected sort mode
- [ ] Sort dropdown component renders all three options correctly
- [ ] Sort dropdown emits correct event payload when selection changes

### Integration Tests
- [ ] Search with `orderBy=totalDownloads-desc` returns results in download count order (verify first result has highest downloads)
- [ ] Search with `orderBy=lastEdited-desc` returns results in chronological order (verify first result is most recently updated)
- [ ] Search with no `orderBy` parameter returns relevance-ordered results (default API behavior)
- [ ] Sort parameter persists across multiple searches in the same session
- [ ] Changing sort mode from Downloads to Recently Updated triggers new API request with correct parameter

### Manual Testing
- [ ] Open Package Browser, perform search, verify default sort is Relevance
- [ ] Change sort to Downloads, verify results re-order (check download counts decrease down the list)
- [ ] Change sort to Recently Updated, verify results re-order (check publish dates are chronological)
- [ ] Perform a new search while Downloads sort is selected, verify new results use Downloads sorting
- [ ] Verify sort dropdown is keyboard accessible (Tab, Arrow keys, Enter/Space)
- [ ] Verify sort dropdown matches VS Code theme (light/dark/high contrast)
- [ ] Verify loading indicator appears during sort-triggered refetch
- [ ] Verify sort dropdown is disabled when no results are present

## Dependencies

### Blocked By
- STORY-001-01-001 (NuGet Search API Integration) - Must have base search API client implemented
- STORY-001-01-002 (Search Webview UI Component) - Must have search input and results list UI
- STORY-001-01-013 (Webview IPC Protocol) - Must have request/response protocol for search operations

### Blocks
- None - This is an enhancement to existing search functionality

### External Dependencies
- NuGet Search API v3 availability (nuget.org only for sorting)
- `@vscode/webview-ui-toolkit` for `vscode-dropdown` component
- **Third-party package sources DO NOT support sorting** - `orderBy` is a nuget.org-specific extension, not part of the v3 API spec

## INVEST Check

- [x] **I**ndependent - Depends on base search API and webview UI, but can be developed independently once those are complete
- [x] **N**egotiable - Sort options and UI placement can be adjusted based on UX feedback
- [x] **V**aluable - Improves package discoverability and matches user expectations from nuget.org
- [x] **E**stimable - 2 story points: UI component + API parameter + state management
- [x] **S**mall - Single feature, can be completed in one iteration
- [x] **T**estable - Clear acceptance criteria with verifiable API behavior and UI interactions

## Notes

### Design Decisions

**Server-Side Only Sorting**  
This implementation strictly uses server-side sorting provided by the NuGet API. No client-side re-ordering is performed. Rationale:
- Ensures consistency with nuget.org behavior
- Leverages NuGet service's optimized ranking algorithms (Relevance uses complex semantic search)
- Reduces client-side complexity and memory usage
- Avoids inconsistencies when paginating results (client-side sort would only affect current page)

**Sort Persistence**  
The selected sort mode persists within the same webview session (stored in component state) but resets when the Package Browser is reopened. This matches typical web application behavior and avoids surprising users with unexpected sort orders on fresh launches.

**No "Alphabetical" Sort**  
Unlike JetBrains Rider (which offers "Smart" and "Alphabetically"), this implementation does not include alphabetical sorting because:
- The NuGet v3 Search API does not provide a native alphabetical sort parameter
- Adding client-side alphabetical sort violates the "server-side only" principle
- Alphabetical sorting is less useful for package discovery (relevance/popularity are better signals)
- Can be added as a future enhancement if user demand warrants client-side implementation

### Third-Party Package Source Compatibility Research

**IMPORTANT**: The NuGet v3 Search API specification **does NOT include an `orderBy` parameter**. The Microsoft documentation for the [Search Query Service Resource](https://learn.microsoft.com/en-us/nuget/api/search-query-service-resource) lists only: `q`, `skip`, `take`, `prerelease`, `semVerLevel`, and `packageType`. **There is no standard `orderBy` parameter in the NuGet v3 API specification.**

This means:
1. **nuget.org** implements sorting as a **proprietary server-side feature**, not part of the official v3 API spec
2. Third-party implementations are **not required** to support sorting and likely **do not**
3. The sort options visible on nuget.org's web UI are specific to their Azure Search backend

**Third-Party Source Analysis** (based on documentation review):

| Source | NuGet v3 API Support | Sorting Support | Notes |
|--------|---------------------|----------------|-------|
| **Artifactory (JFrog)** | ✅ Yes (v3 endpoint available) | ❌ **NO** - Not documented | Supports v3 API (`/api/nuget/v3/<repo>/index.json`) but no mention of `orderBy` or sorting parameters in documentation |
| **GitHub Packages** | ✅ Yes (v3 endpoint available) | ❌ **NO** - Not documented | Provides v3 endpoint (`https://nuget.pkg.github.com/<namespace>/index.json`) but no sorting parameters mentioned |
| **Azure Artifacts** | ✅ Yes (Microsoft-owned) | ⚠️ **UNKNOWN** - Likely YES | Microsoft product, may share nuget.org backend, but documentation doesn't specify `orderBy` support |
| **MyGet** | ✅ Yes (v3 endpoint available) | ❌ **NO** - Not documented | Supports v3 API (`/F/<feed>/api/v3/index.json`) but no `orderBy` parameter documented |
| **NuGet.Server** | ⚠️ **V2 ONLY** | ❌ **NO** - V2 protocol | Open-source NuGet.Server package targets .NET Framework 4.6, implements **v2 API only** (no v3 search endpoint) |
| **BaGet (self-hosted)** | ✅ Yes (v3 implementation) | ❌ **NO** - Not documented | Lightweight v3 server, no mention of `orderBy` in documentation; likely returns results in default order only |

**Key Findings:**
- **Only nuget.org** is confirmed to support sorting via its proprietary Azure Search implementation
- **All third-party sources** either don't support v3 search at all (NuGet.Server) or don't document `orderBy` support
- The `orderBy` parameter is **not part of the NuGet v3 API specification** and should be considered a nuget.org-specific extension

**Recommended Fallback Strategy:**
1. **Implement sorting for nuget.org only** (check source URL matches `api.nuget.org` or `azuresearch-*.nuget.org`)
2. **Hide sort dropdown** when using third-party sources (Option A from original analysis)
3. Add source capability detection: `isSortSupported(sourceUrl)` → returns `true` only for nuget.org endpoints
4. Display notice when connected to non-nuget.org sources: "Sorting is only available for nuget.org sources"

**Open Question for Future:**
- Should we add a configuration setting to allow users to **opt-in to experimental sorting** for third-party sources that may support it? This would let power users test `orderBy` against sources like Azure Artifacts without code changes.

### Edge Cases

- **Empty search results**: Sort dropdown should be disabled (no results to sort)
- **Network error during sort change**: Show error message, keep previous results visible
- **Slow API response**: Show loading spinner overlay, disable sort dropdown during refetch
- **Cache invalidation**: Changing sort mode should bypass cache or use separate cache keys per sort mode

### Related Research

- NuGet API v3 Search documentation: https://learn.microsoft.com/en-us/nuget/api/search-query-service-resource (No `orderBy` parameter in official spec)
- VS Code webview UI toolkit: https://github.com/microsoft/vscode-webview-ui-toolkit
- JetBrains Rider NuGet UI analysis: Offers "Smart" (heuristic relevance + client boosts) and "Alphabetically" (client-side)
- nuget.org web UI: Offers "Relevance", "Downloads", "Recently Updated" (proprietary Azure Search backend, not standard v3 API)
- Third-party source documentation reviewed:
  - Artifactory: https://jfrog.com/help/r/jfrog-artifactory-documentation/nuget-repositories (v3 supported, no `orderBy`)
  - GitHub Packages: https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-nuget-registry (v3 supported, no `orderBy`)
  - MyGet: https://docs.myget.org/docs/reference/feed-endpoints (v3 supported, no `orderBy`)
  - BaGet: https://loic-sharma.github.io/BaGet/ (v3 implementation, no `orderBy`)
  - NuGet.Server: https://github.com/NuGet/NuGet.Server (v2 only, no v3 search endpoint)

## Changelog

| Date | Change | Author |
|---|---|---|
| 2025-11-16 | Story created | AI Assistant |
| 2025-12-29 | Detailed implementation spec added; server-side only constraint documented; third-party source compatibility questions added | AI Assistant |

---
**Story ID**: STORY-001-01-006-search-sorting  
**Feature**: [FEAT-001-01-browse-search](../features/FEAT-001-01-browse-search.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)
