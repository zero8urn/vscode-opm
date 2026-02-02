# IMPL-001-01-018 — Multi-source Package Sources Implementation Plan

**Story Reference:** [STORY-001-01-018](./STORY-001-01-018-multi-source-package-sources.md)

---

## Executive Summary

This implementation adds first-class multi-source support to the OPM package browser. Users can select a package source (including "All feeds" for aggregated search) from a dropdown in the Browse Packages header. The Package Details panel receives the source that supplied the selected package result and uses it for metadata API calls, but no longer displays an editable source selector. Install/update operations use the standard `dotnet add` / `dotnet restore` flow, which honors the full nuget.config feed list and credential configuration.

**Key Changes:**
- **Browse view:** Add source selector dropdown (All feeds + individual sources) in header
- **Package details panel:** Remove source selector, add read-only source badge
- **API client:** Support parallel multi-source search with merge/dedupe for "All feeds"
- **IPC protocol:** Pass `sourceId` with package selection events
- **Error handling:** Empty states, "Try other feeds" affordances, auth hints

**Performance Focus:**
- Parallel search requests for "All feeds" with Promise.all
- Deduplication by packageId + version in memory (no DB overhead)
- Cache-first service index resolution (existing pattern)
- Abort signal propagation for user-initiated cancellations

**Testing Strategy:**
- Unit tests for merge/dedupe logic, source filtering
- Integration tests for multi-source API calls (mocked endpoints)
- E2E tests for UI interactions, source selection, error states

---

## Consolidated Task List

<tasks>

### Phase 1: API Client Multi-Source Support
- [ ] <a href="#api-client-search">Implement parallel multi-source search in NuGetApiClient</a>
- [ ] <a href="#api-client-dedupe">Add result deduplication logic (packageId + version)</a>
- [ ] <a href="#api-client-source-passing">Update getPackageIndex/getPackageVersion to use sourceId</a>
- [ ] <a href="#api-client-error-handling">Add per-source error handling and partial results</a>
- [ ] <a href="#api-client-tests">Write unit tests for multi-source logic</a>

### Phase 2: Configuration & Source Management
- [ ] <a href="#config-filter-sources">Add helper to filter enabled sources</a>
- [ ] <a href="#config-source-metadata">Extend PackageSource with display metadata</a>
- [ ] <a href="#config-tests">Write tests for source filtering and merging</a>

### Phase 3: IPC Protocol Updates
- [ ] <a href="#ipc-types">Add sourceId to SearchResponseMessage and PackageDetailsRequestMessage</a>
- [ ] <a href="#ipc-source-list">Add getPackageSourcesRequest/Response messages</a>
- [ ] <a href="#ipc-handler-updates">Update extension host IPC handlers to pass sourceId</a>

### Phase 4: Browse UI (Source Selector)
- [ ] <a href="#ui-source-dropdown">Create source-selector component (All feeds + sources)</a>
- [ ] <a href="#ui-header-integration">Integrate source selector into packageBrowser header</a>
- [ ] <a href="#ui-search-scoping">Update search logic to pass selectedSourceId</a>
- [ ] <a href="#ui-state-management">Add state for selectedSourceId in packageBrowser</a>

### Phase 5: Package Details Panel Updates
- [ ] <a href="#details-remove-selector">Remove source-select dropdown from packageDetailsPanel</a>
- [ ] <a href="#details-source-badge">Add read-only source badge/indicator</a>
- [ ] <a href="#details-receive-source">Update panel to receive sourceId from parent</a>
- [ ] <a href="#details-pass-source">Pass sourceId to metadata API calls</a>

### Phase 6: Error Handling & UX
- [ ] <a href="#error-empty-state">Add "No results in selected feed" empty state</a>
- [ ] <a href="#error-try-all">Add "Try All feeds" action in empty state</a>
- [ ] <a href="#error-auth-hint">Add auth error hints for protected feeds</a>
- [ ] <a href="#error-partial-results">Handle partial failures in multi-source search</a>

### Phase 7: Testing & Documentation
- [ ] <a href="#test-unit">Write unit tests for new components/logic</a>
- [ ] <a href="#test-integration">Write integration tests for multi-source API behavior</a>
- [ ] <a href="#test-e2e">Write E2E tests for source selection flows</a>
- [ ] <a href="#docs-update">Update user documentation and screenshots</a>

</tasks>

---

## Detailed Implementation Sections

<section id="api-client-search">

### API Client: Parallel Multi-Source Search

**File:** `src/env/node/nugetApiClient.ts`

**Changes:**

1. **Update `searchPackages` signature** to accept `sourceId?: string | 'all'`
   - `undefined` or `'all'` → search all enabled sources
   - Specific sourceId → search that source only

2. **Implement parallel search logic:**
   ```typescript
   async searchPackages(
     options: SearchOptions,
     signal?: AbortSignal,
     sourceId?: string | 'all',
   ): Promise<NuGetResult<PackageSearchResult[]>> {
     // Filter sources
     const sources = this.getSearchSources(sourceId);
     
     if (sources.length === 0) {
       return { success: false, error: { code: 'ApiError', message: 'No sources' } };
     }

     // Single source: existing path
     if (sources.length === 1) {
       return this.searchSingleSource(sources[0]!, options, signal);
     }

     // Multi-source: parallel + merge
     return this.searchMultipleSources(sources, options, signal);
   }
   ```

3. **Add `searchMultipleSources` helper:**
   ```typescript
   private async searchMultipleSources(
     sources: PackageSource[],
     options: SearchOptions,
     signal?: AbortSignal,
   ): Promise<NuGetResult<PackageSearchResult[]>> {
     this.logger.debug('Searching multiple sources', { count: sources.length });

     // Execute searches in parallel
     const promises = sources.map(source =>
       this.searchSingleSource(source, options, signal)
         .then(result => ({ source, result }))
         .catch(error => ({ 
           source, 
           result: { 
             success: false as const, 
             error: { code: 'Network' as const, message: error.message } 
           } 
         }))
     );

     const results = await Promise.all(promises);

     // Collect successful results
     const allPackages: Array<PackageSearchResult & { sourceId: string }> = [];
     const errors: Array<{ sourceId: string; error: string }> = [];

     for (const { source, result } of results) {
       if (result.success) {
         // Tag each result with sourceId
         allPackages.push(...result.result.map(pkg => ({ ...pkg, sourceId: source.id })));
       } else {
         errors.push({ sourceId: source.id, error: result.error.message });
       }
     }

     // Log partial failures but continue
     if (errors.length > 0) {
       this.logger.warn('Some sources failed during multi-source search', { errors });
     }

     // Dedupe and return
     const deduped = this.deduplicateResults(allPackages);
     
     return {
       success: true,
       result: deduped,
     };
   }
   ```

**Performance:**
- Promise.all for concurrent execution (not sequential)
- Fail-fast disabled: partial results returned even if some sources fail
- Abort signal propagated to all child requests

**Logging:**
- `logger.debug()` for multi-source query start
- `logger.warn()` for partial failures (includes failed sourceIds)
- `logger.debug()` for deduplication stats (before/after counts)

</section>

<section id="api-client-dedupe">

### API Client: Result Deduplication

**File:** `src/env/node/nugetApiClient.ts`

**Add deduplication helper:**

```typescript
/**
 * Deduplicates package search results by packageId (case-insensitive).
 * 
 * When multiple sources return the same package:
 * - Prefer result with highest version number
 * - If versions equal, prefer result from first source in config order
 * - Preserve sourceId in result for UI display
 * 
 * @param results - Array of search results tagged with sourceId
 * @returns Deduplicated array
 */
private deduplicateResults(
  results: Array<PackageSearchResult & { sourceId: string }>
): PackageSearchResult[] {
  const map = new Map<string, PackageSearchResult & { sourceId: string }>();

  for (const pkg of results) {
    const key = pkg.id.toLowerCase();
    const existing = map.get(key);

    if (!existing) {
      map.set(key, pkg);
      continue;
    }

    // Compare versions using semantic version comparator
    const cmp = compareVersions(pkg.version, existing.version);
    
    if (cmp > 0) {
      // New package has higher version
      map.set(key, pkg);
    }
    // If equal or lower, keep existing (first source wins)
  }

  const deduped = Array.from(map.values());
  
  this.logger.debug('Deduplication complete', { 
    before: results.length, 
    after: deduped.length,
    removed: results.length - deduped.length,
  });

  return deduped;
}
```

**Behavior:**
- Case-insensitive packageId comparison
- Semantic version comparison for duplicates
- sourceId preserved on returned results (for UI badge)

</section>

<section id="api-client-source-passing">

### API Client: Pass sourceId to Metadata Calls

**Files:**
- `src/env/node/nugetApiClient.ts`
- `src/domain/nugetApiClient.ts` (interface)

**Changes:**

Currently `getPackageIndex` and `getPackageVersion` accept `sourceId?: string` but default to first source. Update to:

1. **Make sourceId required for details calls** (no sensible default for multi-source)
2. **Update callers** to pass sourceId explicitly

```typescript
// Interface update
export interface INuGetApiClient {
  getPackageIndex(
    packageId: string, 
    sourceId: string,  // Now required
    signal?: AbortSignal
  ): Promise<NuGetResult<PackageIndex>>;

  getPackageVersion(
    packageId: string,
    version: string,
    sourceId: string,  // Now required
    signal?: AbortSignal
  ): Promise<NuGetResult<PackageVersionDetails>>;
}

// Implementation: remove default source selection
async getPackageIndex(
  packageId: string,
  sourceId: string,
  signal?: AbortSignal,
): Promise<NuGetResult<PackageIndex>> {
  const source = this.options.sources.find(s => s.id === sourceId && s.enabled);
  
  if (!source) {
    return {
      success: false,
      error: { 
        code: 'ApiError', 
        message: `Source '${sourceId}' not found or disabled` 
      },
    };
  }

  // Rest of implementation unchanged...
}
```

</section>

<section id="api-client-error-handling">

### API Client: Per-Source Error Handling

**File:** `src/env/node/nugetApiClient.ts`

**Add partial failure tracking:**

```typescript
interface MultiSourceSearchResult {
  packages: PackageSearchResult[];
  failedSources: Array<{ id: string; name: string; error: string }>;
  successCount: number;
  totalCount: number;
}

// Update searchMultipleSources return type
private async searchMultipleSources(
  sources: PackageSource[],
  options: SearchOptions,
  signal?: AbortSignal,
): Promise<NuGetResult<PackageSearchResult[]>> {
  // ... parallel search logic ...

  const metadata: MultiSourceSearchResult = {
    packages: deduped,
    failedSources: errors.map(e => ({
      id: e.sourceId,
      name: sources.find(s => s.id === e.sourceId)?.name ?? e.sourceId,
      error: e.error,
    })),
    successCount: sources.length - errors.length,
    totalCount: sources.length,
  };

  // Log summary
  this.logger.info('Multi-source search complete', {
    totalSources: metadata.totalCount,
    successful: metadata.successCount,
    failed: metadata.failedSources.length,
    resultsReturned: deduped.length,
  });

  // If ALL sources failed, return error
  if (metadata.successCount === 0) {
    return {
      success: false,
      error: {
        code: 'ApiError',
        message: `All ${sources.length} sources failed`,
        details: JSON.stringify(metadata.failedSources),
      },
    };
  }

  // Partial success: return results with warning logged
  if (metadata.failedSources.length > 0) {
    this.logger.warn('Partial multi-source failure', { 
      failed: metadata.failedSources 
    });
  }

  return { success: true, result: deduped };
}
```

**UI Impact:**
- Extension host can detect partial failures from logs
- Future enhancement: surface warnings in UI toast

</section>

<section id="api-client-tests">

### API Client: Unit Tests

**File:** `src/env/node/__tests__/nugetApiClient.multisource.test.ts` (new)

**Test Coverage:**

```typescript
describe('NuGetApiClient - Multi-source Search', () => {
  test('searches all sources when sourceId is "all"', async () => {
    // Mock multiple sources with different results
    // Verify Promise.all pattern
    // Assert merged results
  });

  test('deduplicates by packageId (case-insensitive)', async () => {
    // Mock sources returning same package with different casing
    // Assert single result
  });

  test('prefers higher version when deduplicating', async () => {
    // Mock source1: package v1.0.0
    // Mock source2: package v2.0.0
    // Assert v2.0.0 result
  });

  test('preserves sourceId on deduplicated results', async () => {
    // Assert result.sourceId exists and matches source
  });

  test('handles partial source failures gracefully', async () => {
    // Mock source1 success, source2 network error
    // Assert success=true with source1 results
    // Assert warning logged
  });

  test('returns error when all sources fail', async () => {
    // Mock all sources failing
    // Assert success=false
  });

  test('propagates abort signal to all source requests', async () => {
    // Create AbortController, abort during search
    // Assert all child requests cancelled
  });
});
```

**Performance Tests:**
```typescript
describe('Multi-source Performance', () => {
  test('executes searches in parallel (not sequential)', async () => {
    // Mock 3 sources with 100ms delay each
    // Assert total time < 200ms (parallel) not ~300ms (sequential)
  });
});
```

</section>

<section id="config-filter-sources">

### Configuration: Source Filtering Helpers

**File:** `src/services/configurationService.ts`

**Add helper functions:**

```typescript
/**
 * Filters package sources to only enabled sources.
 * 
 * @param sources - All configured sources
 * @returns Enabled sources only
 */
export function getEnabledSources(sources: PackageSource[]): PackageSource[] {
  return sources.filter(s => s.enabled);
}

/**
 * Gets a specific source by ID.
 * 
 * @param sources - All configured sources
 * @param sourceId - Source ID to find
 * @returns Matching source or undefined
 */
export function getSourceById(
  sources: PackageSource[], 
  sourceId: string
): PackageSource | undefined {
  return sources.find(s => s.id === sourceId);
}

/**
 * Formats sources for UI display (dropdown options).
 * 
 * @param sources - Package sources
 * @returns Array of display options with id, name, enabled status
 */
export function formatSourcesForUI(sources: PackageSource[]): Array<{
  id: string;
  name: string;
  enabled: boolean;
  provider: string;
}> {
  return sources.map(s => ({
    id: s.id,
    name: s.name,
    enabled: s.enabled,
    provider: s.provider,
  }));
}
```

</section>

<section id="config-source-metadata">

### Configuration: Source Metadata Extensions

**File:** `src/domain/models/nugetApiOptions.ts`

**Extend PackageSource interface (optional, for future use):**

```typescript
export interface PackageSource {
  id: string;
  name: string;
  provider: PackageSourceProvider;
  indexUrl: string;
  enabled: boolean;
  auth?: PackageSourceAuth;
  metadata?: Record<string, unknown>;
  
  // Optional display metadata (future use)
  displayOrder?: number;        // For UI sorting
  iconUrl?: string;              // Provider icon
  description?: string;          // Tooltip text
}
```

**No immediate changes needed** — existing interface supports the implementation.

</section>

<section id="config-tests">

### Configuration: Tests

**File:** `src/services/__tests__/configurationService.test.ts`

**Add test cases:**

```typescript
describe('Source Filtering', () => {
  test('getEnabledSources filters disabled sources', () => {
    const sources = [
      { id: 'a', enabled: true, ...defaultProps },
      { id: 'b', enabled: false, ...defaultProps },
    ];
    expect(getEnabledSources(sources)).toHaveLength(1);
  });

  test('getSourceById finds source case-sensitive', () => {
    const sources = [{ id: 'NuGet.org', ...defaultProps }];
    expect(getSourceById(sources, 'NuGet.org')).toBeDefined();
    expect(getSourceById(sources, 'nuget.org')).toBeUndefined();
  });

  test('formatSourcesForUI returns display-friendly objects', () => {
    const formatted = formatSourcesForUI([defaultNuGetSource]);
    expect(formatted[0]).toMatchObject({
      id: 'nuget.org',
      name: 'nuget.org',
      enabled: true,
      provider: 'nuget.org',
    });
  });
});
```

</section>

<section id="ipc-types">

### IPC: Protocol Updates

**File:** `src/webviews/apps/packageBrowser/types.ts`

**Add sourceId fields:**

```typescript
// Update SearchResponseMessage to include sourceId
export interface SearchResponseMessage {
  type: 'searchResponse';
  results: Array<PackageSearchResult & { sourceId: string }>; // Tag results
  totalHits: number;
  hasMore: boolean;
}

// Update PackageDetailsRequestMessage to pass sourceId
export interface PackageDetailsRequestMessage {
  type: 'packageDetails';
  packageId: string;
  sourceId: string;  // Required: which source to query
}

// Add new message for fetching available sources
export interface GetPackageSourcesRequestMessage {
  type: 'getPackageSources';
}

export interface GetPackageSourcesResponseMessage {
  type: 'packageSourcesResponse';
  sources: Array<{
    id: string;
    name: string;
    enabled: boolean;
    provider: string;
  }>;
}

// Update discriminated union
export type WebviewToHostMessage =
  | SearchRequestMessage
  | LoadMoreRequestMessage
  | PackageDetailsRequestMessage
  | GetPackageSourcesRequestMessage
  | InstallPackageRequestMessage
  | UninstallPackageRequestMessage;

export type HostToWebviewMessage =
  | SearchResponseMessage
  | PackageDetailsResponseMessage
  | GetPackageSourcesResponseMessage
  | InstallPackageResponseMessage
  | UninstallPackageResponseMessage
  | ProjectsChangedNotification;
```

**Type Guards:**

```typescript
export function isGetPackageSourcesResponseMessage(
  msg: unknown
): msg is GetPackageSourcesResponseMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    msg.type === 'packageSourcesResponse'
  );
}
```

</section>

<section id="ipc-handler-updates">

### IPC: Extension Host Handlers

**File:** `src/commands/openPackageBrowserCommand.ts` (or webview handler)

**Add source list handler:**

```typescript
// In webview message handler
case 'getPackageSources': {
  const options = getNuGetApiOptions();
  const formatted = formatSourcesForUI(options.sources);
  
  panel.webview.postMessage({
    type: 'packageSourcesResponse',
    sources: formatted,
  });
  break;
}

// Update search handler to pass sourceId to API client
case 'search': {
  const { query, prerelease, skip, take, sourceId } = message;
  
  // sourceId can be 'all' or specific source ID
  const result = await apiClient.searchPackages(
    { query, prerelease, skip, take },
    undefined,
    sourceId === 'all' ? undefined : sourceId
  );
  
  panel.webview.postMessage({
    type: 'searchResponse',
    results: result.success ? result.result : [],
    totalHits: result.success ? result.result.length : 0,
    hasMore: false,
  });
  break;
}

// Update package details handler to require sourceId
case 'packageDetails': {
  const { packageId, sourceId } = message;
  
  // Now sourceId is required (no default)
  const result = await apiClient.getPackageIndex(packageId, sourceId);
  
  // ... rest of handler
}
```

</section>

<section id="ui-source-dropdown">

### Browse UI: Source Selector Component

**File:** `src/webviews/apps/packageBrowser/components/sourceSelector.ts` (new)

**Component Implementation:**

```typescript
import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

export const SOURCE_SELECTOR_TAG = 'source-selector' as const;

export interface PackageSourceOption {
  id: string;
  name: string;
  enabled: boolean;
  provider: string;
}

@customElement(SOURCE_SELECTOR_TAG)
export class SourceSelector extends LitElement {
  @property({ type: Array })
  sources: PackageSourceOption[] = [];

  @property({ type: String })
  selectedSourceId = 'all';

  @property({ type: Boolean })
  disabled = false;

  static override styles = css`
    :host {
      display: block;
    }

    .source-select {
      min-width: 150px;
      padding: 4px 8px;
      font-size: 13px;
      font-family: var(--vscode-font-family);
      color: var(--vscode-input-foreground);
      background-color: var(--vscode-dropdown-background);
      border: 1px solid var(--vscode-dropdown-border);
      border-radius: 2px;
      cursor: pointer;
    }

    .source-select:hover:not(:disabled) {
      background-color: var(--vscode-dropdown-listBackground);
    }

    .source-select:focus {
      outline: 2px solid var(--vscode-focusBorder);
      outline-offset: 2px;
    }

    .source-select:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .option-all {
      font-weight: 600;
    }
  `;

  override render() {
    return html`
      <select
        class="source-select"
        .value=${this.selectedSourceId}
        ?disabled=${this.disabled}
        @change=${this.handleChange}
        aria-label="Package source"
      >
        <option value="all" class="option-all">All feeds</option>
        ${this.sources
          .filter(s => s.enabled)
          .map(
            source => html`
              <option value=${source.id}>
                ${source.name}
              </option>
            `
          )}
      </select>
    `;
  }

  private handleChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    this.selectedSourceId = select.value;
    
    this.dispatchEvent(
      new CustomEvent('source-changed', {
        detail: { sourceId: this.selectedSourceId },
        bubbles: true,
        composed: true,
      })
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    [SOURCE_SELECTOR_TAG]: SourceSelector;
  }
}
```

**Event Interface:**
```typescript
// In types.ts
export interface SourceChangedEvent {
  sourceId: string;
}
```

</section>

<section id="ui-header-integration">

### Browse UI: Header Integration

**File:** `src/webviews/apps/packageBrowser/packageBrowser.ts`

**Template Changes:**

```typescript
// Add import
import './components/sourceSelector';
import type { PackageSourceOption } from './components/sourceSelector';

// Add state
@state()
private packageSources: PackageSourceOption[] = [];

@state()
private selectedSourceId = 'all';

// Update render method
override render() {
  return html`
    <div class="app-header">
      <div class="search-container">
        <div class="search-header">
          <div class="search-input-wrapper">
            <input
              type="text"
              class="search-input"
              placeholder="Search by package name, keyword, or author."
              .value=${this.searchQuery}
              @input=${this.handleSearchInput}
              aria-label="Search packages"
            />
          </div>
          
          <!-- NEW: Source selector -->
          <source-selector
            .sources=${this.packageSources}
            .selectedSourceId=${this.selectedSourceId}
            .disabled=${this.loading}
            @source-changed=${this.handleSourceChanged}
          ></source-selector>
          
          <prerelease-toggle
            .checked=${this.includePrerelease}
            .disabled=${this.loading}
            @toggle=${this.handlePrereleaseToggle}
          ></prerelease-toggle>
          
          <button
            class="refresh-button"
            @click=${this.handleRefreshSearch}
            ?disabled=${this.loading}
            aria-label="Refresh search results"
            title="Refresh"
          >
            ${refreshIcon}
          </button>
        </div>
      </div>
    </div>
    
    <!-- ... rest of template ... -->
  `;
}
```

**CSS Updates:**

```css
.search-header {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap; /* Allow wrapping on narrow viewports */
}

source-selector {
  flex: 0 0 auto;
}
```

</section>

<section id="ui-search-scoping">

### Browse UI: Search Scoping Logic

**File:** `src/webviews/apps/packageBrowser/packageBrowser.ts`

**Update search methods:**

```typescript
private handleSourceChanged(e: CustomEvent<{ sourceId: string }>) {
  this.selectedSourceId = e.detail.sourceId;
  
  // Re-run search if query exists
  if (this.searchQuery.trim()) {
    this.performSearch();
  }
  
  this.logger.debug('Source selection changed', { 
    sourceId: this.selectedSourceId 
  });
}

private performSearch() {
  if (this.loading) return;

  const query = this.searchQuery.trim();
  if (!query) {
    this.searchResults = [];
    this.totalHits = 0;
    this.hasMore = false;
    return;
  }

  this.loading = true;

  const message: SearchRequestMessage = {
    type: 'search',
    query,
    prerelease: this.includePrerelease,
    skip: 0,
    take: 20,
    sourceId: this.selectedSourceId, // NEW: pass selected source
  };

  vscode.postMessage(message);
}
```

**Fetch sources on init:**

```typescript
override connectedCallback() {
  super.connectedCallback();
  window.addEventListener('message', this.handleHostMessage);

  // Fetch package sources
  vscode.postMessage({ type: 'getPackageSources' });

  // ... existing ready logic ...
}

private handleHostMessage = (event: MessageEvent) => {
  const message = event.data;

  if (isGetPackageSourcesResponseMessage(message)) {
    this.packageSources = message.sources;
    this.logger.debug('Package sources loaded', { 
      count: this.packageSources.length 
    });
    return;
  }

  // ... existing handlers ...
};
```

</section>

<section id="ui-state-management">

### Browse UI: State Management

**File:** `src/webviews/apps/packageBrowser/packageBrowser.ts`

**State properties (already covered above):**

```typescript
@state()
private packageSources: PackageSourceOption[] = [];

@state()
private selectedSourceId = 'all';
```

**State reset on source change:**

```typescript
private handleSourceChanged(e: CustomEvent<{ sourceId: string }>) {
  const previousSource = this.selectedSourceId;
  this.selectedSourceId = e.detail.sourceId;
  
  // Clear results when switching sources (fresh search)
  if (previousSource !== this.selectedSourceId) {
    this.searchResults = [];
    this.totalHits = 0;
    this.hasMore = false;
  }
  
  // Re-run search if query exists
  if (this.searchQuery.trim()) {
    this.performSearch();
  }
}
```

</section>

<section id="details-remove-selector">

### Package Details: Remove Source Selector

**File:** `src/webviews/apps/packageBrowser/components/packageDetailsPanel.ts`

**Remove from template:**

```typescript
// BEFORE (lines ~319-327):
<div class="controls-row">
  <version-selector ... ></version-selector>
  
  <select class="source-select" aria-label="Package source">
    <option selected>nuget.org</option>
  </select>
</div>

// AFTER:
<div class="controls-row">
  <version-selector ... ></version-selector>
  <!-- Source selector removed - source is fixed per package selection -->
</div>
```

**Remove CSS:**

```css
/* DELETE these rules: */
.source-select {
  flex: 1;
  min-width: 120px;
  max-width: 155px;
  padding: 4px 8px;
  font-size: 13px;
  font-family: var(--vscode-font-family);
  color: var(--vscode-input-foreground);
  background-color: var(--vscode-dropdown-background);
  border: 1px solid var(--vscode-dropdown-border);
  border-radius: 2px;
  cursor: pointer;
}

.source-select:hover { ... }
.source-select:focus { ... }
```

</section>

<section id="details-source-badge">

### Package Details: Add Source Badge

**File:** `src/webviews/apps/packageBrowser/components/packageDetailsPanel.ts`

**Add to header after package name:**

```typescript
private renderHeader(pkg: PackageDetailsData, currentVersion: string) {
  return html`
    <div class="header">
      <div class="header-row">
        ${pkg.iconUrl
          ? html`<img class="package-icon" src="${pkg.iconUrl}" alt="${pkg.id} icon" />`
          : html`<span class="package-icon">📦</span>`}
        <h2 id="panel-title" class="package-name" title="${pkg.id}">${pkg.id}</h2>
        ${pkg.verified ? html`<span class="verified-badge" title="Verified Publisher">✓</span>` : ''}
        
        <!-- NEW: Source badge -->
        ${this.sourceId 
          ? html`
              <span class="source-badge" title="Source: ${this.sourceName}">
                ${this.sourceName}
              </span>
            `
          : ''}
        
        <button class="close-button" ... >✕</button>
      </div>

      <div class="controls-row">
        <version-selector ... ></version-selector>
        <!-- Source selector removed -->
      </div>
    </div>
  `;
}
```

**Add CSS:**

```css
.source-badge {
  flex-shrink: 0;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 500;
  color: var(--vscode-descriptionForeground);
  background: var(--vscode-badge-background);
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
```

</section>

<section id="details-receive-source">

### Package Details: Receive sourceId

**File:** `src/webviews/apps/packageBrowser/components/packageDetailsPanel.ts`

**Add properties:**

```typescript
@property({ type: String })
sourceId: string | null = null;

@property({ type: String })
sourceName: string | null = null;
```

**Update parent (packageBrowser) to pass sourceId:**

```typescript
// In packageBrowser.ts
private handlePackageSelected(e: CustomEvent) {
  const { packageId, sourceId, sourceName } = e.detail;
  
  this.selectedPackageId = packageId;
  this.detailsPanelOpen = true;
  
  // Fetch details with sourceId
  this.fetchPackageDetails(packageId, sourceId, sourceName);
}

private async fetchPackageDetails(
  packageId: string, 
  sourceId: string,
  sourceName: string
) {
  this.detailsLoading = true;

  const message: PackageDetailsRequestMessage = {
    type: 'packageDetails',
    packageId,
    sourceId, // Required
  };

  vscode.postMessage(message);
  
  // Store for passing to details panel
  this.selectedPackageSourceId = sourceId;
  this.selectedPackageSourceName = sourceName;
}

// In render method, pass to panel:
<package-details-panel
  .packageData=${this.packageDetailsData}
  .open=${this.detailsPanelOpen}
  .sourceId=${this.selectedPackageSourceId}
  .sourceName=${this.selectedPackageSourceName}
  ... other props ...
></package-details-panel>
```

</section>

<section id="details-pass-source">

### Package Details: Pass sourceId to API

**File:** `src/webviews/apps/packageBrowser/components/packageDetailsPanel.ts`

**No changes needed** — sourceId is already passed in PackageDetailsRequestMessage.

Extension host handler uses it:

```typescript
// In extension host
case 'packageDetails': {
  const { packageId, sourceId } = message;
  
  const indexResult = await apiClient.getPackageIndex(packageId, sourceId);
  const versionResult = await apiClient.getPackageVersion(packageId, version, sourceId);
  
  // ...
}
```

</section>

<section id="error-empty-state">

### Error Handling: Empty State for Source-Scoped Search

**File:** `src/webviews/apps/packageBrowser/packageBrowser.ts`

**Update empty state template:**

```typescript
private renderEmptyState() {
  if (!this.searchQuery.trim()) {
    return html`
      <div class="empty-state">
        <p>Enter a package name, keyword, or author to search.</p>
      </div>
    `;
  }

  // No results after search
  if (this.selectedSourceId === 'all') {
    return html`
      <div class="empty-state">
        <p>No packages found matching "${this.searchQuery}".</p>
        <p class="empty-hint">Try adjusting your search terms or enabling prerelease packages.</p>
      </div>
    `;
  }

  // Scoped to specific source with no results
  const sourceName = this.packageSources.find(s => s.id === this.selectedSourceId)?.name ?? 'selected feed';
  
  return html`
    <div class="empty-state">
      <p>No packages found in <strong>${sourceName}</strong>.</p>
      <p class="empty-hint">
        The package may be available in other feeds.
        <button class="link-button" @click=${this.switchToAllFeeds}>
          Search all feeds
        </button>
      </p>
    </div>
  `;
}

private switchToAllFeeds() {
  this.selectedSourceId = 'all';
  this.performSearch();
}
```

**CSS:**

```css
.empty-state {
  padding: 2rem;
  text-align: center;
  color: var(--vscode-descriptionForeground);
}

.empty-hint {
  font-size: 13px;
  margin-top: 0.5rem;
}

.link-button {
  background: none;
  border: none;
  color: var(--vscode-textLink-foreground);
  text-decoration: underline;
  cursor: pointer;
  padding: 0;
  font: inherit;
}

.link-button:hover {
  color: var(--vscode-textLink-activeForeground);
}
```

</section>

<section id="error-try-all">

### Error Handling: "Try Other Feeds" Action

**File:** `src/webviews/apps/packageBrowser/components/packageDetailsPanel.ts`

**Add error state for metadata fetch failure:**

```typescript
@state()
private metadataError: string | null = null;

// In render method, show error banner
private renderContent(pkg: PackageDetailsData, currentVersion: string) {
  if (this.metadataError) {
    return html`
      <div class="error-banner">
        <div class="error-title">Failed to load package details</div>
        <div class="error-message">${this.metadataError}</div>
        ${this.selectedSourceId !== 'all' 
          ? html`
              <button class="try-other-feeds-button" @click=${this.handleTryOtherFeeds}>
                Try other feeds
              </button>
            `
          : ''}
      </div>
    `;
  }

  // ... existing content rendering ...
}

private handleTryOtherFeeds() {
  // Dispatch event to parent (packageBrowser) to retry with 'all' sources
  this.dispatchEvent(
    new CustomEvent('retry-other-sources', {
      detail: { packageId: this.packageData?.id },
      bubbles: true,
      composed: true,
    })
  );
}
```

**CSS:**

```css
.error-banner {
  padding: 1rem;
  margin: 1rem;
  background: var(--vscode-inputValidation-errorBackground);
  border: 1px solid var(--vscode-inputValidation-errorBorder);
  border-radius: 3px;
}

.error-title {
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.error-message {
  font-size: 13px;
  margin-bottom: 0.75rem;
}

.try-other-feeds-button {
  padding: 4px 12px;
  font-size: 13px;
  color: var(--vscode-button-foreground);
  background: var(--vscode-button-background);
  border: none;
  border-radius: 2px;
  cursor: pointer;
}

.try-other-feeds-button:hover {
  background: var(--vscode-button-hoverBackground);
}
```

</section>

<section id="error-auth-hint">

### Error Handling: Authentication Hints

**File:** `src/env/node/nugetApiClient.ts`

**Detect 401/403 responses and return helpful error:**

```typescript
// In fetch error handling
if (!response.ok) {
  if (response.status === 401 || response.status === 403) {
    this.logger.warn(`Authentication required for source: ${source.name}`);
    return {
      success: false,
      error: {
        code: 'AuthRequired',
        message: `Authentication required for ${source.name}. Configure credentials in nuget.config or VS Code settings.`,
        statusCode: response.status,
      },
    };
  }

  // ... existing error handling ...
}
```

**UI display:**

```typescript
// In packageBrowser.ts handleSearchResponse
if (!result.success && result.error.code === 'AuthRequired') {
  // Show info message with action
  this.showAuthHint(result.error.message);
}
```

</section>

<section id="error-partial-results">

### Error Handling: Partial Results UI

**File:** `src/webviews/apps/packageBrowser/packageBrowser.ts`

**Add state for partial failure warnings:**

```typescript
@state()
private sourceWarnings: Array<{ sourceName: string; error: string }> = [];

// After receiving search results, check for warnings
private handleSearchResponse(message: SearchResponseMessage) {
  this.searchResults = message.results;
  this.totalHits = message.totalHits;
  this.hasMore = message.hasMore;
  this.loading = false;

  // Check for partial failures (future: extension sends warning metadata)
  if (message.warnings && message.warnings.length > 0) {
    this.sourceWarnings = message.warnings;
  } else {
    this.sourceWarnings = [];
  }
}

// Render warning banner
private renderWarnings() {
  if (this.sourceWarnings.length === 0) return '';

  return html`
    <div class="partial-failure-banner">
      <span class="warning-icon">⚠</span>
      <span class="warning-text">
        Some package sources failed to respond. Results may be incomplete.
      </span>
      <button class="dismiss-button" @click=${() => (this.sourceWarnings = [])}>
        Dismiss
      </button>
    </div>
  `;
}
```

</section>

<section id="test-unit">

### Testing: Unit Tests

**Files:**
- `src/env/node/__tests__/nugetApiClient.multisource.test.ts`
- `src/services/__tests__/configurationService.test.ts`
- `src/webviews/apps/packageBrowser/components/__tests__/sourceSelector.test.ts`

**Coverage:**
- Multi-source search logic (parallel execution, deduplication)
- Source filtering and formatting helpers
- Source selector component (event emission, rendering)
- Empty state conditions

</section>

<section id="test-integration">

### Testing: Integration Tests

**File:** `test/integration/nugetApiClient.multisource.integration.test.ts` (new)

**Tests:**

```typescript
describe('Multi-Source Integration Tests', () => {
  test('searches nuget.org and myget.org in parallel', async () => {
    // Use real NuGet API endpoints (not mocked)
    // Assert parallel execution and merged results
  });

  test('handles one source timeout gracefully', async () => {
    // Mock slow source with realistic timeout
    // Assert partial results returned
  });

  test('authenticated source returns 401 with helpful message', async () => {
    // Use test private feed (no credentials)
    // Assert AuthRequired error code
  });
});
```

</section>

<section id="test-e2e">

### Testing: E2E Tests

**File:** `test/e2e/multiSourceSearch.e2e.ts` (new)

**Tests:**

```typescript
suite('Multi-Source Package Search E2E', () => {
  test('Source selector displays All feeds by default', async function () {
    this.timeout(10000);
    
    await vscode.commands.executeCommand('opm.openPackageBrowser');
    await sleep(500);
    
    // Verify command executed
    // Note: Cannot inspect webview DOM from Extension Host
    // Test focuses on command registration and execution
  });

  test('Searching with specific source executes successfully', async function () {
    this.timeout(10000);
    
    // Open webview
    await vscode.commands.executeCommand('opm.openPackageBrowser');
    await sleep(500);
    
    // Send IPC message to simulate source selection + search
    // Verify no errors thrown
  });

  test('Empty state action switches to All feeds', async function () {
    this.timeout(10000);
    
    // Test flow:
    // 1. Open webview
    // 2. Select specific source (via IPC)
    // 3. Search for non-existent package
    // 4. Trigger "Search all feeds" action
    // 5. Verify IPC message sent with sourceId='all'
  });
});
```

**Note:** E2E tests verify command execution and IPC contracts, NOT webview UI internals (no DOM access from Extension Host).

</section>

<section id="docs-update">

### Documentation: User Guides

**Files:**
- `docs/QUICK-START.md` - Add section on source selection
- `README.md` - Update screenshots with new source selector UI
- `CHANGELOG.md` - Add entry for multi-source feature

**Content:**

```markdown
## Using Multiple Package Sources

OPM supports multiple NuGet package sources configured via `nuget.config` or VS Code settings.

### Source Selection

- **All feeds (default):** Searches all enabled sources in parallel and merges results.
- **Specific source:** Select a source from the dropdown to search only that feed.

### Configuration

1. **Via nuget.config** (recommended):
   - Place `nuget.config` in workspace root or user config directory
   - Sources are auto-discovered following NuGet's standard hierarchy

2. **Via VS Code settings:**
   ```json
   {
     "nugetPackageManager.api.sources": [
       {
         "id": "nuget.org",
         "name": "NuGet.org",
         "provider": "nuget.org",
         "indexUrl": "https://api.nuget.org/v3/index.json",
         "enabled": true
       }
     ]
   }
   ```

### Authenticated Sources

For private feeds requiring authentication, configure credentials in `nuget.config`:

```xml
<configuration>
  <packageSources>
    <add key="MyPrivateFeed" value="https://pkgs.dev.azure.com/..." />
  </packageSources>
  <packageSourceCredentials>
    <MyPrivateFeed>
      <add key="Username" value="user@example.com" />
      <add key="ClearTextPassword" value="your-pat-token" />
    </MyPrivateFeed>
  </packageSourceCredentials>
</configuration>
```

**Security Note:** Store credentials securely. Use Azure DevOps PATs or GitHub tokens instead of passwords.
```

</section>

---

## Performance Considerations

### 1. **Parallel Search Execution**
- Use `Promise.all()` for concurrent source queries (not sequential `await` in loop)
- Typical 3-source search: ~1-2s total vs. ~3-6s sequential
- Abort signal propagation ensures cleanup on user cancellation

### 2. **Deduplication Algorithm**
- In-memory Map with case-insensitive keys (O(n) time, O(n) space)
- No database or file system overhead
- Suitable for typical result sets (20-100 packages per search)

### 3. **Service Index Caching**
- Existing implementation caches per-source service index URLs
- Reduces HTTPS roundtrips for repeated searches
- Cache invalidation on extension reload (acceptable for beta)

### 4. **Partial Failure Handling**
- Fast-fail disabled: don't abort on first source failure
- Collect all results before returning
- Typical degradation: 1 slow source delays aggregation by ~5s (timeout)

### 5. **UI Responsiveness**
- Search debounce: 300ms (existing)
- Loading indicators on source selector during search
- Empty states render immediately (no spinner delay)

---

## Security & Privacy

### 1. **Credential Handling**
- Credentials loaded from nuget.config into memory (existing pattern)
- NEVER log credentials or include in telemetry
- Auth headers added per-request, not cached
- Recommendation: Use PATs/tokens, not passwords

### 2. **Error Messages**
- Generic auth errors: "Authentication required for <source name>"
- Do not expose usernames, API keys, or internal URLs in UI

### 3. **Source Validation**
- Only HTTPS sources supported (HTTP rejected in parser)
- Local file paths rejected (existing behavior)
- URL validation before fetch (prevent SSRF)

---

## Migration Path

### Phase 1 (This Implementation)
- All feeds search (parallel, no pagination across sources)
- UI source selector
- Details panel shows originating source

### Phase 2 (Future Enhancements)
- Per-source pagination (complex: requires aggregation logic)
- Package source mapping (Visual Studio feature parity)
- Source priority/ordering configuration
- Cache shared across sources (packageId-based key)

### Phase 3 (Long-term)
- Source health monitoring (response times, availability)
- Smart source selection (prefer fastest source for common packages)
- Offline mode (cached metadata only)

---

## Acceptance Criteria Checklist

- [ ] Browse Packages header displays "Package source" dropdown
- [ ] Dropdown includes "All feeds" option (default) + enabled sources
- [ ] Selecting "All feeds" searches all enabled sources in parallel
- [ ] Search results are deduplicated by packageId (case-insensitive)
- [ ] Selecting specific source limits search to that source
- [ ] Package Details panel receives sourceId from Browse selection
- [ ] Package Details panel shows read-only source badge (name)
- [ ] Package Details panel removed editable source selector dropdown
- [ ] Empty state for source-scoped search shows "Try All feeds" action
- [ ] Clicking "Try All feeds" switches to All feeds and re-runs search
- [ ] Authentication errors show helpful hint with configuration guidance
- [ ] Install/update operations use dotnet CLI (respect nuget.config)
- [ ] Unit tests pass for multi-source logic (>80% coverage)
- [ ] Integration tests verify parallel search behavior
- [ ] E2E tests verify UI command execution (not DOM internals)
- [ ] Documentation updated with source selection screenshots
- [ ] CHANGELOG.md entry added
- [ ] No credentials logged in console or telemetry

---

## Dependencies & Prerequisites

### Existing Features (Required)
- ✅ NuGet API client with service index caching
- ✅ Package search API implementation
- ✅ Package details API implementation
- ✅ nuget.config parsing and merging
- ✅ IPC message types and handlers
- ✅ PackageBrowser webview component
- ✅ PackageDetailsPanel webview component

### New Dependencies
- None (uses existing Lit, vscode API, node fetch)

### Configuration
- No VS Code settings changes required
- Backward compatible: defaults to "All feeds" if no selection

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Slow source delays All feeds search | High | Medium | Implement per-source timeout (5s), show partial results |
| Deduplication prefers wrong source | Low | Low | Document priority rules, use semantic versioning for comparison |
| Auth errors confuse users | Medium | Low | Clear error messages with actionable hints |
| Breaking change to IPC protocol | Low | High | Add sourceId as optional field first, make required in follow-up |
| Package Details panel source mismatch | Low | Medium | Pass sourceId explicitly, validate on receive |

---

## Rollout Plan

### Phase 1: API Client (Week 1)
- Implement multi-source search
- Add deduplication logic
- Write unit tests

### Phase 2: Configuration & IPC (Week 1-2)
- Add source filtering helpers
- Update IPC types
- Update extension host handlers

### Phase 3: UI Components (Week 2)
- Create source selector component
- Integrate into Browse header
- Update Package Details panel

### Phase 4: Error Handling (Week 2-3)
- Empty states
- Auth hints
- Partial failure handling

### Phase 5: Testing & Documentation (Week 3)
- Integration tests
- E2E tests
- User documentation
- CHANGELOG update

### Phase 6: Code Review & Polish (Week 3-4)
- Performance profiling
- Security review
- Accessibility review
- Final QA

---

**Implementation Owner:** TBD  
**Reviewer:** TBD  
**Target Completion:** Q1 2026  
**Story Points:** 13 (large, multi-component feature)

