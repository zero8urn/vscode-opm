# Package Details Panel Implementation Plan

**Story**: [STORY-001-01-009-package-details-panel](../stories/STORY-001-01-009-package-details-panel.md)  
**Feature**: [FEAT-001-01-browse-search](../features/FEAT-001-01-browse-search.md)  
**Created**: 2025-12-30

## High-Level Summary

This plan implements a slide-in package details panel for the Package Browser webview. The panel displays comprehensive package metadata including versions, dependencies, README content, and warnings (deprecation/vulnerabilities). The architecture introduces a new `PackageDetailsService` to orchestrate API calls, caching, and sanitization, keeping the UI component self-contained and focused solely on rendering.

**Key Architecture Changes:**

1. **Service Layer** - New `PackageDetailsService` abstracts `NuGetApiClient` operations for the webview, managing:
   - Package metadata fetching (versions, dependencies, README)
   - Response caching with 10-minute TTL (aligns with STORY-001-01-012)
   - HTML sanitization for README content
   - Error transformation to webview-friendly formats

2. **Component Layer** - New Lit components form a self-contained details panel:
   - `package-details-panel.ts` - Main panel container with slide-in animation
   - `version-list.ts` - Scrollable version selector with prerelease badges
   - `dependency-tree.ts` - Framework-grouped dependency tree with expand/collapse
   - `readme-viewer.ts` - Sanitized README renderer with theme-aware styling
   - `package-badges.ts` - Verified/deprecated/vulnerable status indicators

3. **IPC Protocol** - Extensions to webview messaging for details requests:
   - `packageDetailsRequest` - Fetch full package metadata
   - `packageDetailsResponse` - Return structured metadata or error
   - `readmeRequest` - Lazy-load README content on tab switch
   - `readmeResponse` - Return sanitized HTML

4. **Data Flow** - Request orchestration sequence:
   ```
   packageCard (click) 
     → packageBrowser (emit package-selected)
     → packageDetailsPanel (show + postMessage)
     → Extension Host (PackageDetailsService)
     → NuGetApiClient (getPackageIndex, getPackageVersion, getReadme)
     → Cache check (10min TTL)
     → HTML sanitization (README only)
     → Response to webview
     → Panel renders
   ```

**Self-Contained Design:**
- Panel component manages its own loading/error states
- Service layer handles all business logic (fetching, caching, sanitization)
- Panel communicates via simple request/response IPC
- Parent app (`packageBrowser.ts`) only forwards events, doesn't orchestrate
- No direct NuGetApiClient access from webview components

---

## Implementation Checklist

<section id="service-layer">

### 1. Create PackageDetailsService

**File**: `src/webviews/services/packageDetailsService.ts`

- [ ] Define `IPackageDetailsService` interface with methods:
  - `getPackageDetails(packageId, version?, signal?)` - Fetch metadata + versions
  - `getReadme(packageId, version, signal?)` - Lazy-load README
  - `clearCache(packageId?)` - Manual cache invalidation
- [ ] Implement `PackageDetailsService` class with constructor DI:
  - `nugetClient: INuGetApiClient` - API operations
  - `logger: ILogger` - Debug logging
  - `sanitizer: (html: string) => string` - HTML sanitization function
- [ ] Add in-memory cache with 10-minute TTL:
  - Cache key: `${packageId}@${version}` for version details
  - Cache key: `${packageId}` for package index (all versions)
  - Cache key: `${packageId}@${version}:readme` for README content
  - Use `Map<string, { data: T; expires: number }>` structure
- [ ] Implement `getPackageDetails()`:
  - Call `nugetClient.getPackageIndex(packageId)` for all versions
  - Call `nugetClient.getPackageVersion(packageId, version)` for specific version
  - Transform `PackageIndex` and `PackageVersionDetails` to webview types
  - Return combined result with versions array + selected version details
  - Cache both API responses separately
- [ ] Implement `getReadme()`:
  - Call `nugetClient.getReadme(packageId, version)`
  - **Sanitize HTML using `sanitizeHtml()` from `src/webviews/sanitizer.ts`**
  - Cache sanitized result (not raw HTML)
  - Return sanitized HTML string
- [ ] Add `createPackageDetailsService(client, logger)` factory function
- [ ] Handle all `NuGetError` types and transform to webview-friendly messages
- [ ] Add debug logging for cache hits/misses
- [ ] Write unit tests with mocked NuGetApiClient (>80% coverage)

**Reference**: Similar pattern to existing `SearchService` (#file:searchService.ts)

</section>

<section id="ipc-protocol">

### 2. Extend IPC Protocol for Package Details

**File**: `src/webviews/apps/packageBrowser/types.ts`

- [ ] Add `PackageDetailsRequestMessage` type:
  ```typescript
  {
    type: 'packageDetailsRequest';
    payload: {
      packageId: string;
      version?: string; // Optional - defaults to latest
      requestId: string;
    };
  }
  ```
- [ ] Add `PackageDetailsResponseMessage` type:
  ```typescript
  {
    type: 'notification';
    name: 'packageDetailsResponse';
    args: {
      packageId: string;
      version: string;
      versions: VersionSummary[]; // All available versions
      dependencies: DependencyGroup[]; // Grouped by framework
      description: string | null;
      authors: string[];
      iconUrl: string | null;
      projectUrl: string | null;
      licenseUrl: string | null;
      licenseExpression: string | null;
      totalDownloads: number;
      verified: boolean;
      deprecated: boolean;
      deprecationReasons: string[];
      alternativePackage: string | null;
      vulnerabilities: Vulnerability[];
      requestId?: string;
      error?: { message: string; code: string };
    };
  }
  ```
- [ ] Add `ReadmeRequestMessage` and `ReadmeResponseMessage` types (lazy loading)
- [ ] Add type guards: `isPackageDetailsRequestMessage()`, `isReadmeRequestMessage()`
- [ ] Define webview domain types:
  - `VersionSummary` - { version, publishedDate, isPrerelease, isDeprecated, downloads }
  - `DependencyGroup` - { framework, dependencies: Dependency[] }
  - `Dependency` - { id, versionRange } (direct dependencies only, no transitive flag needed)
  - `Vulnerability` - { severity, cveId, advisoryUrl }

**Reference**: Existing `SearchRequestMessage` pattern in same file

</section>

<section id="message-handlers">

### 3. Add Message Handlers in packageBrowserWebview.ts

**File**: `src/webviews/packageBrowserWebview.ts`

- [ ] Import `PackageDetailsService` and create instance in `createPackageBrowserWebview()`:
  ```typescript
  const detailsService = createPackageDetailsService(nugetClient, logger);
  ```
- [ ] Update webview options to persist state:
  ```typescript
  const panel = vscode.window.createWebviewPanel(
    'opmPackageBrowser',
    'NuGet Package Browser',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true, // Preserve panel state when hidden
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'out')],
    }
  );
  ```
- [ ] Add `handlePackageDetailsRequest()` function:
  - Extract `{ packageId, version, requestId }` from message payload
  - Create AbortController with 60s timeout
  - Call `detailsService.getPackageDetails(packageId, version, signal)`
  - Transform result to `PackageDetailsResponseMessage`
  - Send response via `panel.webview.postMessage()`
  - Handle errors with user-friendly messages
- [ ] Add `handleReadmeRequest()` function (similar pattern):
  - Call `detailsService.getReadme(packageId, version, signal)`
  - Return `ReadmeResponseMessage` with sanitized HTML
- [ ] Wire handlers in `handleWebviewMessage()`:
  ```typescript
  if (isPackageDetailsRequestMessage(msg)) {
    await handlePackageDetailsRequest(msg, panel, logger, detailsService);
  } else if (isReadmeRequestMessage(msg)) {
    await handleReadmeRequest(msg, panel, logger, detailsService);
  }
  ```
- [ ] Dispose `detailsService` on panel disposal (if service holds resources)

**Reference**: Existing `handleSearchRequest()` pattern (#file:packageBrowserWebview.ts lines 94-157)

</section>

<section id="component-panel">

### 4. Create PackageDetailsPanel Component

**File**: `src/webviews/apps/packageBrowser/components/packageDetailsPanel.ts`

- [ ] Define component with `@customElement('package-details-panel')`
- [ ] Export tag constant: `export const PACKAGE_DETAILS_PANEL_TAG = 'package-details-panel' as const;`
- [ ] Add reactive properties:
  - `@property({ type: Object }) packageData` - Full package metadata from IPC
  - `@property({ type: Boolean }) open = false` - Controls slide-in animation
  - `@state() selectedTab: 'readme' | 'dependencies' | 'versions' = 'readme'`
  - `@state() loading = false`
  - `@state() readmeHtml: string | null = null` - Lazy-loaded
- [ ] Implement slide-in CSS animation:
  - Panel positioned `position: fixed; right: 0; top: 0; height: 100vh`
  - Width: `60%` with `min-width: 400px`
  - Transform: `translateX(100%)` when closed, `translateX(0)` when open
  - Transition: `transform 200ms ease-out`
  - Backdrop overlay with `background: rgba(0,0,0,0.3)` when open
- [ ] Render panel header:
  - Package icon with fallback
  - Package name + version
  - Verified badge (if `verified: true`)
  - Close button (emits `close` event)
- [ ] Render tab navigation:
  - Three tabs: README (default), Dependencies, Versions
  - Keyboard navigation (Arrow keys, Tab, Enter)
  - Active tab indicator with `border-bottom: 2px solid var(--vscode-focusBorder)`
- [ ] Render tab content with `<section>` for each tab:
  - README tab: `<readme-viewer .html=${readmeHtml}>`
  - Dependencies tab: `<dependency-tree .groups=${packageData.dependencies}>`
  - Versions tab: `<version-list .versions=${packageData.versions}>`
- [ ] Add deprecation warning banner (conditional):
  - Show if `packageData.deprecated === true`
  - Display `packageData.deprecationReasons`
  - Link to `packageData.alternativePackage` if available
  - Use `var(--vscode-inputValidation-warningBackground)` for styling
- [ ] Add vulnerability warning banner (conditional):
  - Show if `packageData.vulnerabilities.length > 0`
  - Display severity (Critical, High, Medium, Low)
  - List CVE IDs with links to `advisoryUrl`
  - Use `var(--vscode-inputValidation-errorBackground)` for critical
- [ ] Implement lazy README loading:
  - On first tab switch to README, emit `readme-request` event
  - Show loading spinner while fetching
  - Cache result in `readmeHtml` state
- [ ] Add keyboard event handler:
  - Escape key closes panel
  - Tab key cycles through focusable elements (tabs, close button, links)
- [ ] Add ARIA attributes:
  - `role="dialog"` on panel container
  - `aria-labelledby` referencing package name heading
  - `aria-label` on close button
  - `aria-selected` on active tab
- [ ] Emit events:
  - `close` - User clicked close or pressed Escape
  - `readme-request` - Need to fetch README content
  - `version-selected` - User selected different version from version list

**Reference**: Panel structure similar to VS Code's built-in extensions detail view

</section>

<section id="component-version-list">

### 5. Create VersionList Component

**File**: `src/webviews/apps/packageBrowser/components/versionList.ts`

- [ ] Define component with `@customElement('version-list')`
- [ ] Export tag: `export const VERSION_LIST_TAG = 'version-list' as const;`
- [ ] Add reactive properties:
  - `@property({ type: Array }) versions: VersionSummary[]`
  - `@property({ type: String }) selectedVersion: string` - Currently shown version
- [ ] Render scrollable version list:
  - Use `overflow-y: auto` with `max-height: calc(100vh - 300px)`
  - Each version row shows: version number, publish date, download count
  - Prerelease badge for `isPrerelease === true` versions
  - Deprecation badge for `isDeprecated === true` versions
  - Selected version highlighted with `background: var(--vscode-list-activeSelectionBackground)`
- [ ] Format publish date with relative time (e.g., "2 months ago")
- [ ] Format download count (e.g., "1.2M downloads")
- [ ] Make rows clickable - emit `version-select` event with version string
- [ ] Add virtual scrolling if `versions.length > 50` (performance optimization)
- [ ] Add keyboard navigation (Arrow up/down, Enter to select)
- [ ] Show "No versions available" if `versions.length === 0`

**Reference**: Similar list pattern to `packageList.ts`

</section>

<section id="component-dependency-tree">

### 6. Create DependencyTree Component

**File**: `src/webviews/apps/packageBrowser/components/dependencyTree.ts`

- [ ] Define component with `@customElement('dependency-tree')`
- [ ] Export tag: `export const DEPENDENCY_TREE_TAG = 'dependency-tree' as const;`
- [ ] Add reactive properties:
  - `@property({ type: Array }) groups: DependencyGroup[]` - Dependencies grouped by framework
  - `@state() expandedFrameworks: Set<string>` - Track expanded/collapsed state
- [ ] Render framework groups:
  - Each group header shows framework name (e.g., ".NET 8.0", ".NET Standard 2.0")
  - Expand/collapse chevron icon next to framework name
  - Click header to toggle expanded state
- [ ] Render dependency list per framework:
  - Show only **direct dependencies** (not transitive dependencies)
  - Display package ID and version range (e.g., "Newtonsoft.Json >= 13.0.1")
  - Use standard list styling with `var(--vscode-foreground)` color
  - Make dependency names clickable - emit `dependency-select` event to open that package's details panel
  - No indentation or tree expansion needed (flat list of direct deps only)
- [ ] Show empty state per framework:
  - "No dependencies for this framework" if `dependencies.length === 0`
- [ ] Add keyboard navigation:
  - Enter/Space to expand/collapse framework groups
  - Arrow keys to navigate between groups

**Reference**: Tree-like structure similar to VS Code's file explorer

</section>

<section id="component-readme-viewer">

### 7. Create ReadmeViewer Component

**File**: `src/webviews/apps/packageBrowser/components/readmeViewer.ts`

- [ ] Define component with `@customElement('readme-viewer')`
- [ ] Export tag: `export const README_VIEWER_TAG = 'readme-viewer' as const;`
- [ ] Add reactive properties:
  - `@property({ type: String }) html: string | null` - Pre-sanitized HTML from service
  - `@property({ type: Boolean }) loading = false`
- [ ] Render sanitized HTML:
  - Use `unsafeHTML()` directive from `lit/directives/unsafe-html.js`
  - **CRITICAL**: HTML is already sanitized by `PackageDetailsService`, safe to render
  - **HTML-only for MVP** - NuGet API returns pre-rendered HTML, no Markdown parsing needed
  - Wrap in `<div class="readme-content">` with scoped styles
- [ ] Apply README-specific CSS:
  - Headings use `var(--vscode-foreground)` with appropriate font sizes
  - Code blocks use `var(--vscode-textCodeBlock-background)`
  - Links use `var(--vscode-textLink-foreground)` with hover states
  - Images constrained to `max-width: 100%`
  - Tables styled with borders using `var(--vscode-panel-border)`
- [ ] Handle external links:
  - Add `target="_blank" rel="noopener noreferrer"` to all `<a>` tags
  - Use CSS to append external link icon: `a[href^="http"]::after`
- [ ] Show loading state:
  - Spinner with "Loading README..." text when `loading === true`
- [ ] Show empty state:
  - "No README available for this package. Visit the project site for more information."
  - Include link to `projectUrl` if available
- [ ] Add smooth scroll behavior for anchor links

**Reference**: Sanitization already handled by `PackageDetailsService` using `sanitizeHtml()` from `src/webviews/sanitizer.ts`

</section>

<section id="component-badges">

### 8. Create PackageBadges Component

**File**: `src/webviews/apps/packageBrowser/components/packageBadges.ts`

- [ ] Define component with `@customElement('package-badges')`
- [ ] Export tag: `export const PACKAGE_BADGES_TAG = 'package-badges' as const;`
- [ ] Add reactive properties:
  - `@property({ type: Boolean }) verified = false`
  - `@property({ type: Boolean }) deprecated = false`
  - `@property({ type: Boolean }) hasVulnerabilities = false`
- [ ] Render badge container with flex layout:
  - Display badges inline with `gap: 0.5rem`
  - Each badge is a pill-shaped element with icon + text
- [ ] Render "Verified Publisher" badge:
  - Show if `verified === true`
  - Icon: ✓ (checkmark)
  - Background: `var(--vscode-badge-background)`
  - Tooltip: "This package is published by a verified author"
- [ ] Render "Deprecated" badge:
  - Show if `deprecated === true`
  - Icon: ⚠️ (warning)
  - Background: `var(--vscode-inputValidation-warningBackground)`
  - Tooltip: "This package is deprecated"
- [ ] Render "Vulnerability" badge:
  - Show if `hasVulnerabilities === true`
  - Icon: 🛡️ (shield)
  - Background: `var(--vscode-inputValidation-errorBackground)`
  - Tooltip: "This package has known security vulnerabilities"
- [ ] Make badges keyboard accessible with `tabindex="0"` and ARIA labels

**Reference**: Simple presentational component, similar to status badges in VS Code UI

</section>

<section id="integration">

### 9. Integrate Panel into PackageBrowser App

**File**: `src/webviews/apps/packageBrowser/packageBrowser.ts`

- [ ] Import panel component and tag:
  ```typescript
  import './components/packageDetailsPanel';
  import { PACKAGE_DETAILS_PANEL_TAG } from './components/packageDetailsPanel';
  ```
- [ ] Add reactive state properties:
  - `@state() selectedPackageId: string | null = null`
  - `@state() packageDetailsData: PackageDetailsData | null = null`
  - `@state() detailsPanelOpen = false`
  - `@state() detailsLoading = false`
- [ ] Update render template to include panel:
  ```html
  <package-details-panel
    .packageData=${this.packageDetailsData}
    .open=${this.detailsPanelOpen}
    .loading=${this.detailsLoading}
    @close=${this.handlePanelClose}
    @readme-request=${this.handleReadmeRequest}
    @version-selected=${this.handleVersionSelected}
  ></package-details-panel>
  ```
- [ ] Update `handlePackageSelected()` to request package details:
  ```typescript
  private handlePackageSelected(e: CustomEvent): void {
    const { packageId } = e.detail;
    this.selectedPackageId = packageId;
    this.detailsPanelOpen = true;
    this.detailsLoading = true;
    
    const request: PackageDetailsRequestMessage = {
      type: 'packageDetailsRequest',
      payload: {
        packageId,
        requestId: Date.now().toString(),
      },
    };
    
    this.vscode.postMessage(request);
  }
  ```
- [ ] Add `handleHostMessage()` case for `packageDetailsResponse`:
  ```typescript
  if (isPackageDetailsResponseMessage(msg)) {
    this.packageDetailsData = msg.args;
    this.detailsLoading = false;
  }
  ```
- [ ] Add `handlePanelClose()` to close panel:
  ```typescript
  private handlePanelClose(): void {
    this.detailsPanelOpen = false;
    this.selectedPackageId = null;
    // Cancel any in-flight requests
    this.currentDetailsController?.abort();
  }
  ```
- [ ] Implement AbortController for concurrent request handling:
  ```typescript
  private currentDetailsController: AbortController | null = null;
  
  private handlePackageSelected(e: CustomEvent): void {
    // Cancel previous request if still in-flight
    this.currentDetailsController?.abort();
    
    const controller = new AbortController();
    this.currentDetailsController = controller;
    
    // ... existing code to send request
  }
  ```
- [ ] Add `handleReadmeRequest()` to lazy-load README:
  ```typescript
  private handleReadmeRequest(e: CustomEvent): void {
    const request: ReadmeRequestMessage = {
      type: 'readmeRequest',
      payload: {
        packageId: this.selectedPackageId!,
        version: this.packageDetailsData!.version,
        requestId: Date.now().toString(),
      },
    };
    this.vscode.postMessage(request);
  }
  ```
- [ ] Add `handleVersionSelected()` to fetch different version:
  ```typescript
  private handleVersionSelected(e: CustomEvent): void {
    const { version } = e.detail;
    // Re-request package details with specific version
    // Similar to handlePackageSelected but include version in payload
  }
  ```
- [ ] Update CSS to position panel overlay correctly

**Reference**: Integration pattern similar to existing `handleSearchInput()` and IPC flow

</section>

<section id="styling">

### 10. Implement Theme-Aware Styling

**Files**: All component `.ts` files with `static styles` property

- [ ] Use VS Code CSS custom properties for all colors:
  - Backgrounds: `var(--vscode-editor-background)`, `var(--vscode-panel-background)`
  - Foregrounds: `var(--vscode-foreground)`, `var(--vscode-descriptionForeground)`
  - Borders: `var(--vscode-panel-border)`, `var(--vscode-focusBorder)`
  - Interactive: `var(--vscode-button-background)`, `var(--vscode-button-hoverBackground)`
  - Links: `var(--vscode-textLink-foreground)`, `var(--vscode-textLink-activeForeground)`
  - Warnings: `var(--vscode-inputValidation-warningBackground)`
  - Errors: `var(--vscode-inputValidation-errorBackground)`
- [ ] Test all components in light, dark, and high-contrast themes
- [ ] Ensure sufficient color contrast for WCAG AA compliance
- [ ] Add focus indicators for all interactive elements (2px solid `var(--vscode-focusBorder)`)
- [ ] Test with VS Code's built-in theme switcher

**Reference**: Existing `packageCard.ts` component uses VS Code theme variables (#file:packageCard.ts lines 24-90)

</section>

<section id="testing">

### 11. Write Unit Tests

**File**: `src/webviews/services/__tests__/packageDetailsService.test.ts`

- [ ] Test `getPackageDetails()`:
  - Mock `nugetClient.getPackageIndex()` to return test data
  - Mock `nugetClient.getPackageVersion()` to return test data
  - Assert correct transformation to webview types
  - Assert caching behavior (second call returns cached data)
  - Test error handling (API errors, network failures)
  - Test AbortSignal cancellation
- [ ] Test `getReadme()`:
  - Mock `nugetClient.getReadme()` to return raw HTML
  - Assert HTML sanitization is applied
  - Assert caching behavior
  - Test error handling
- [ ] Test cache expiration:
  - Mock `Date.now()` to simulate time passing
  - Assert cache invalidation after 10 minutes
  - Assert fresh API call after cache expiry
- [ ] Test `clearCache()`:
  - Populate cache with test data
  - Call `clearCache()` with/without packageId
  - Assert cache is cleared correctly

**Coverage Target**: >80% for `PackageDetailsService`

</section>

<section id="testing-integration">

### 12. Write Integration Tests

**File**: `test/integration/packageDetailsPanel.integration.test.ts`

- [ ] Test full request/response flow:
  - Mock `panel.webview.postMessage()`
  - Send `packageDetailsRequest` message
  - Assert `handlePackageDetailsRequest()` is called
  - Assert API calls are made to NuGetApiClient
  - Assert response message is sent to webview
- [ ] Test README lazy loading:
  - Send `readmeRequest` message
  - Assert `getReadme()` is called
  - Assert sanitized HTML is returned
- [ ] Test error scenarios:
  - Package not found (404)
  - API timeout
  - Network failure
  - Assert error messages are user-friendly

**Coverage Target**: All IPC message handlers tested with real NuGet API responses (mocked)

</section>

<section id="testing-e2e">

### 13. Write E2E Tests

**File**: `test/e2e/packageDetailsPanel.e2e.ts`

- [ ] Test panel open/close workflow:
  - Open Package Browser webview
  - Trigger search for "Newtonsoft.Json"
  - Click on first search result
  - Assert `opm.openWebview` command was triggered
  - Wait for panel to appear (use delays)
  - Assert panel is visible
  - Press Escape key
  - Assert panel closes
- [ ] Test tab navigation:
  - Open panel
  - Click "Dependencies" tab
  - Assert dependency tree is rendered
  - Click "Versions" tab
  - Assert version list is rendered
- [ ] Test version selection:
  - Open panel
  - Click on different version in version list
  - Assert panel updates to show selected version metadata
- [ ] Test README loading:
  - Open panel for package with README
  - Assert README tab shows sanitized content
  - Open panel for package without README
  - Assert empty state message is shown

**Note**: E2E tests run in Extension Host with Mocha, not Bun. Use `suite()` and `test()`, not `describe()` and `it()`.

**Reference**: `test/e2e/packageBrowser.e2e.ts` for existing patterns

</section>

<section id="documentation">

### 14. Update Documentation

**Files**: Various documentation files

- [ ] Update [code-layout.md](../technical/code-layout.md):
  - Add `PackageDetailsService` to services section
  - Add new webview components to components list
- [ ] Update [webviews.md](../technical/webviews.md):
  - Document `packageDetailsRequest`/`packageDetailsResponse` IPC protocol
  - Document `readmeRequest`/`readmeResponse` protocol
  - Add data flow diagram for package details
- [ ] Update [STORY-001-01-009-package-details-panel.md](../stories/STORY-001-01-009-package-details-panel.md):
  - Mark story as "In Progress" once work begins
  - Update with implementation notes and decisions
  - Mark as "Done" when all acceptance criteria are met
- [ ] Add inline JSDoc comments to all new service methods
- [ ] Add README comment to `packageDetailsPanel.ts` explaining component architecture

</section>

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ Webview (Browser Context)                                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  PackageCard.click                                                  │
│      ↓                                                              │
│  PackageBrowser.handlePackageSelected()                            │
│      ↓                                                              │
│  postMessage(packageDetailsRequest)                                │
│      ↓                                                              │
│  ┌──────────────────────────────┐                                  │
│  │ PackageDetailsPanel          │                                  │
│  │ - loading state              │                                  │
│  │ - skeleton UI                │                                  │
│  └──────────────────────────────┘                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                            ↓ IPC
┌─────────────────────────────────────────────────────────────────────┐
│ Extension Host (Node.js Context)                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  packageBrowserWebview.handleWebviewMessage()                      │
│      ↓                                                              │
│  handlePackageDetailsRequest()                                     │
│      ↓                                                              │
│  ┌─────────────────────────────────────────┐                       │
│  │ PackageDetailsService                   │                       │
│  │                                         │                       │
│  │  getPackageDetails(packageId, version)  │                       │
│  │      ↓                                  │                       │
│  │  Check cache (10min TTL)                │                       │
│  │      ↓ (cache miss)                     │                       │
│  │  ┌────────────────────────────┐         │                       │
│  │  │ NuGetApiClient             │         │                       │
│  │  │ - getPackageIndex()        │         │                       │
│  │  │ - getPackageVersion()      │         │                       │
│  │  └────────────────────────────┘         │                       │
│  │      ↓                                  │                       │
│  │  Transform to webview types             │                       │
│  │      ↓                                  │                       │
│  │  Cache result                           │                       │
│  │      ↓                                  │                       │
│  │  Return structured data                 │                       │
│  └─────────────────────────────────────────┘                       │
│      ↓                                                              │
│  postMessage(packageDetailsResponse)                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                            ↓ IPC
┌─────────────────────────────────────────────────────────────────────┐
│ Webview (Browser Context)                                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  PackageBrowser.handleHostMessage()                                │
│      ↓                                                              │
│  Update packageDetailsData state                                   │
│      ↓                                                              │
│  ┌──────────────────────────────┐                                  │
│  │ PackageDetailsPanel          │                                  │
│  │ - Render header              │                                  │
│  │ - Render tabs                │                                  │
│  │ - Render content:            │                                  │
│  │   • ReadmeViewer             │  (lazy-loaded)                   │
│  │   • DependencyTree           │                                  │
│  │   • VersionList              │                                  │
│  │ - Render badges              │                                  │
│  └──────────────────────────────┘                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Cache Strategy

**PackageDetailsService Cache Design:**

| Cache Key Format | Data Type | TTL | Example |
|------------------|-----------|-----|---------|
| `${packageId}` | `PackageIndex` (all versions) | 10 min | `Newtonsoft.Json` |
| `${packageId}@${version}` | `PackageVersionDetails` | 10 min | `Newtonsoft.Json@13.0.3` |
| `${packageId}@${version}:readme` | Sanitized HTML string | 10 min | `Newtonsoft.Json@13.0.3:readme` |

**Cache Invalidation:**
- Automatic expiry after 10 minutes (aligns with STORY-001-01-012)
- Manual invalidation via `clearCache(packageId?)` method
- Version changes trigger separate cache entries (no invalidation needed)

**Performance Benefits:**
- Repeated panel opens for same package return instantly (<10ms)
- Switching between tabs (README/Dependencies/Versions) uses cached data
- Version selector populates from cached `PackageIndex`
- Only README is lazy-loaded on first tab switch

---

## Component Dependency Graph

```
packageBrowser.ts (root app)
    ├── packageList.ts (existing)
    │   └── packageCard.ts (existing)
    │
    └── packageDetailsPanel.ts (NEW)
        ├── packageBadges.ts (NEW)
        ├── versionList.ts (NEW)
        ├── dependencyTree.ts (NEW)
        └── readmeViewer.ts (NEW)
```

**Import Pattern**: All components imported at app level, no circular dependencies.

---

## Acceptance Criteria Mapping

This checklist maps to story acceptance criteria:

- **Scenario: Display Package Details on Selection** → #9 Integration
- **Scenario: Show All Available Versions** → #5 VersionList Component
- **Scenario: Display Dependency Tree** → #6 DependencyTree Component
- **Scenario: Render Package README** → #7 ReadmeViewer Component
- **Scenario: Handle Missing README** → #7 ReadmeViewer empty state
- **Scenario: Show Deprecation Warning** → #4 PackageDetailsPanel banner
- **Scenario: Display Vulnerability Alerts** → #4 PackageDetailsPanel banner
- **Scenario: Close Details Panel** → #4 PackageDetailsPanel close handler
- **Scenario: Navigate Between Packages** → #9 Integration state update
- **Scenario: Theme Compatibility** → #10 Styling

All additional criteria covered across components and service layer.

---

## Estimated Effort

| Section | Estimated Time | Complexity |
|---------|---------------|------------|
| 1. PackageDetailsService | 3-4 hours | Medium (caching logic) |
| 2. IPC Protocol Types | 1 hour | Low |
| 3. Message Handlers | 2 hours | Low-Medium |
| 4. PackageDetailsPanel Component | 4-5 hours | High (animations, tabs, state) |
| 5. VersionList Component | 2 hours | Low-Medium |
| 6. DependencyTree Component | 3-4 hours | Medium (tree structure) |
| 7. ReadmeViewer Component | 2 hours | Low-Medium |
| 8. PackageBadges Component | 1 hour | Low |
| 9. Integration into PackageBrowser | 2-3 hours | Medium |
| 10. Theme Styling | 2 hours | Low |
| 11-12. Testing (Unit + Integration) | 4-5 hours | Medium |
| 13. E2E Testing | 2-3 hours | Medium |
| 14. Documentation | 1-2 hours | Low |

**Total Estimated Effort**: 29-36 hours (approximately 4-5 working days)

---

## Design Decisions (Resolved)

1. **Dependency Tree Depth**: ✅ Display all **direct dependencies only** without showing transitive dependency details. Show the full list of immediate dependencies but don't expand into nested transitive trees. Keeps UI clean and performance high.

2. **Version Selector UI**: ✅ Version list remains in the **"Versions" tab** within the panel. Provides dedicated space for viewing all versions with metadata (publish dates, downloads, prerelease badges) without cluttering the panel header.

3. **README Markdown vs HTML**: ✅ **HTML-only** for MVP. NuGet API returns pre-rendered HTML, no need for client-side Markdown parsing. Simplifies implementation and ensures consistent rendering.

4. **Concurrent Panel Updates**: ✅ Use **AbortController** to cancel in-flight requests when user rapidly clicks different packages. Prevents race conditions and stale data from appearing after newer requests complete.

5. **Panel Persistence**: ✅ Enable **`retainContextWhenHidden: true`** on webview panel. Preserves search state and panel content when user switches tabs/editors. Improves UX by maintaining context.

---

## Future Enhancements (Out of Scope for MVP)

- Package comparison view (side-by-side comparison of 2-3 packages)
- Version diff viewer (show what changed between versions)
- Dependency graph visualization (interactive tree diagram)
- "Install" button directly in panel (deferred to FEAT-001-02)
- Package download statistics chart (downloads over time)
- Related packages suggestions
- Full-text search within README content
- Copy dependency snippets for .csproj
