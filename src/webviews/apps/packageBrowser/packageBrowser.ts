import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import './components/packageList';
import './components/prerelease-toggle';
import './components/packageDetailsPanel';
import './components/sourceSelector';
import { refreshIcon } from './components/icons';
import type {
  PackageSearchResult,
  SearchRequestMessage,
  LoadMoreRequestMessage,
  PackageDetailsRequestMessage,
  InstallPackageRequestMessage,
  UninstallPackageRequestMessage,
  ProjectInfo,
} from './types';
import {
  isSearchResponseMessage,
  isPackageDetailsResponseMessage,
  isInstallPackageResponseMessage,
  isUninstallPackageResponseMessage,
  isGetProjectsResponseMessage,
  isProjectsChangedNotification,
  isGetPackageSourcesResponseMessage,
} from './types';
import type { PackageDetailsData } from '../../services/packageDetailsService';
import type { PackageSourceOption } from './components/sourceSelector';

import { vscode } from './vscode-api';

/**
 * Root application component for the Package Browser webview.
 * Manages search results, pagination state, and coordinates IPC with the extension host.
 */
@customElement('package-browser-app')
export class PackageBrowserApp extends LitElement {
  @state()
  private searchQuery = '';

  @state()
  private searchResults: PackageSearchResult[] = [];

  @state()
  private totalHits = 0;

  @state()
  private hasMore = false;

  @state()
  private loading = false;

  @state()
  private includePrerelease = false;

  @state()
  private selectedPackageId: string | null = null;

  @state()
  private packageDetailsData: PackageDetailsData | null = null;

  @state()
  private detailsPanelOpen = false;

  @state()
  private detailsLoading = false;

  @state()
  private cachedProjects: ProjectInfo[] = [];

  @state()
  private projectsLoading = false;

  @state()
  private projectsFetched = false;

  @state()
  private cacheWarmed = false;

  @state()
  private cacheWarming = false;

  @state()
  private packageSources: PackageSourceOption[] = [];

  @state()
  private selectedSourceId = 'all';

  @state()
  private selectedPackageSourceId: string | null = null;

  @state()
  private selectedPackageSourceName: string | null = null;

  @state()
  private searchError: { message: string; code: string } | null = null;

  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private currentDetailsController: AbortController | null = null;

  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      width: 100%;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      --opm-header-height: 56px;
    }

    .app-header {
      position: sticky;
      top: 0;
      z-index: 1100;
      background-color: var(--vscode-editor-background);
    }

    .app-body {
      display: flex;
      flex-direction: column;
      flex: 1;
      overflow: hidden;
    }

    .search-container {
      flex-shrink: 0;
      padding: 8px 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .search-header {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .search-input-wrapper {
      flex: 1 1 260px;
      min-width: 200px;
    }

    .search-input {
      width: 100%;
      padding: 6px 10px;
      font-size: 14px;
      font-family: var(--vscode-font-family);
      color: var(--vscode-input-foreground);
      background-color: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 2px;
      outline: none;
      box-sizing: border-box;
    }

    .search-input:focus {
      border-color: var(--vscode-focusBorder);
    }

    .search-input::placeholder {
      color: var(--vscode-input-placeholderForeground);
    }

    .refresh-button {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 6px;
      width: 32px;
      height: 32px;
      font-size: 16px;
      font-family: var(--vscode-font-family);
      color: var(--vscode-icon-foreground);
      background-color: transparent;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .refresh-button:hover {
      background-color: var(--vscode-toolbar-hoverBackground);
    }

    .refresh-button:active {
      opacity: 0.8;
    }

    .icon {
      width: 18px;
      height: 18px;
      fill: currentColor;
      display: block;
      flex-shrink: 0;
    }

    prerelease-toggle {
      flex: 0 0 auto;
    }

    source-selector {
      flex: 0 0 auto;
    }

    .results-container {
      flex: 1;
      overflow: hidden;
    }

    .error-banner {
      padding: 12px 16px;
      margin: 8px 12px;
      border-radius: 4px;
      background-color: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      color: var(--vscode-errorForeground);
    }

    .error-title {
      font-weight: 600;
      margin-bottom: 6px;
    }

    .error-content {
      font-size: 13px;
      line-height: 1.5;
    }

    .auth-hint {
      margin-top: 8px;
      padding: 8px;
      background-color: var(--vscode-textBlockQuote-background);
      border-left: 3px solid var(--vscode-textBlockQuote-border);
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    @media (max-width: 600px) {
      :host {
        --opm-header-height: 72px;
      }

      .search-header {
        align-items: stretch;
      }

      .refresh-button {
        justify-content: center;
      }
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener('message', this.handleHostMessage);

    // Signal to extension host that webview is ready
    // Extension will proactively push discovered projects (no request needed)
    vscode.postMessage({ type: 'ready' });

    // Fetch available package sources
    this.fetchPackageSources();

    // This handles edge cases where ready message is lost or extension is slow
    setTimeout(() => {
      if (!this.projectsFetched && !this.projectsLoading) {
        console.log('Ready push timeout - falling back to explicit fetch');
        this.fetchProjectsEarly();
      }
    }, 500);

    // : Pre-warm DotnetProjectParser cache
    this.warmProjectCache();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('message', this.handleHostMessage);
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
  }

  private renderErrorBanner(error: { message: string; code: string }) {
    const isAuthError = error.code === 'AuthRequired' || error.code === 'Forbidden';
    return html`
      <div class="error-banner">
        <div class="error-title">${isAuthError ? '🔒 Authentication Required' : '⚠ Search Error'}</div>
        <div class="error-content">${error.message}</div>
        ${isAuthError
          ? html`<div class="auth-hint">
              💡 Configure authentication in VS Code settings for protected package sources.
            </div>`
          : ''}
      </div>
    `;
  }

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
            <prerelease-toggle
              .checked=${this.includePrerelease}
              .disabled=${this.loading}
              @change=${this.handlePrereleaseToggle}
            ></prerelease-toggle>
            <source-selector
              .sources=${this.packageSources}
              .selectedSourceId=${this.selectedSourceId}
              .disabled=${this.loading}
              @source-changed=${this.handleSourceChanged}
            ></source-selector>
            <button
              class="refresh-button"
              @click=${this.handleRefreshProjects}
              title="Refresh project list and installed packages"
              aria-label="Refresh projects"
            >
              ${refreshIcon}
            </button>
          </div>
        </div>
      </div>

      <div class="app-body">
        ${this.searchError ? this.renderErrorBanner(this.searchError) : ''}
        <div class="results-container">
          <package-list
            .packages=${this.searchResults}
            .totalHits=${this.totalHits}
            .hasMore=${this.hasMore}
            .loading=${this.loading}
            .selectedSourceId=${this.selectedSourceId}
            .searchQuery=${this.searchQuery}
            @package-selected=${this.handlePackageSelected}
            @load-more=${this.handleLoadMore}
            @try-all-feeds=${this.handleTryAllFeeds}
          ></package-list>
        </div>

        <package-details-panel
          .packageData=${this.packageDetailsData}
          .includePrerelease=${this.includePrerelease}
          .sourceId=${this.selectedPackageSourceId}
          .sourceName=${this.selectedPackageSourceName}
          .cachedProjects=${this.cachedProjects}
          .parentProjectsLoading=${this.projectsLoading}
          ?open=${this.detailsPanelOpen}
          @close=${this.handlePanelClose}
          @version-selected=${this.handleVersionSelected}
          @install-package=${this.handleInstallPackage}
          @uninstall-package=${this.handleUninstallPackage}
          @package-selected=${this.handlePackageSelected}
        ></package-details-panel>
      </div>
    `;
  }

  private handleHostMessage = (event: MessageEvent): void => {
    const msg = event.data;

    // Handle both old format (method/data) and new format (type/args)
    if (isSearchResponseMessage(msg)) {
      this.searchResults = msg.args.results || [];
      this.totalHits = msg.args.totalHits || 0;
      this.hasMore = msg.args.hasMore || false;
      this.searchError = msg.args.error || null;
      this.loading = false;
    } else if (isPackageDetailsResponseMessage(msg)) {
      console.log('PackageDetailsResponse received:', msg.args);
      this.packageDetailsData = msg.args.data || null;
      this.detailsLoading = false;
      if (this.packageDetailsData) {
        console.log('Opening panel with data:', this.packageDetailsData);
        this.detailsPanelOpen = true;
      } else if (msg.args.error) {
        console.error('Package details error:', msg.args.error);
      }
    } else if (isInstallPackageResponseMessage(msg)) {
      console.log('Install package response received:', msg.args);

      // Forward response to package-details-panel for UI updates
      const detailsPanel = this.shadowRoot?.querySelector('package-details-panel');
      if (detailsPanel) {
        // The panel will forward results to project-selector component
        // Note: This requires adding handleInstallResponse method to PackageDetailsPanel
        (detailsPanel as any).handleInstallResponse?.(msg.args);
      }

      // Toast notifications are handled entirely by extension host
      // Webview only updates UI state (progress indicators, result badges)
    } else if (isUninstallPackageResponseMessage(msg)) {
      console.log('Uninstall package response received:', msg.args);

      // Forward response to package-details-panel for UI updates
      const detailsPanel = this.shadowRoot?.querySelector('package-details-panel');
      if (detailsPanel) {
        // The panel will forward results to project-selector component
        (detailsPanel as any).handleUninstallResponse?.(msg.args);
      }

      // Toast notifications are handled entirely by extension host
      // Webview only updates UI state (progress indicators, result badges)
    } else if (isGetProjectsResponseMessage(msg)) {
      console.log('Projects response received:', {
        count: msg.args.projects?.length ?? 0,
        error: msg.args.error,
      });

      if (!msg.args.error) {
        this.cachedProjects = msg.args.projects || [];
        this.projectsFetched = true;
      }
      this.projectsLoading = false;
    } else if (isProjectsChangedNotification(msg)) {
      console.log('Projects changed notification received, clearing cache');
      this.cachedProjects = [];
      this.projectsFetched = false;
      this.cacheWarmed = false;
      this.cacheWarming = false;

      //  Clear details panel's installed status cache
      const detailsPanel = this.shadowRoot?.querySelector('package-details-panel');
      if (detailsPanel) {
        (detailsPanel as any).clearInstalledStatusCache();
      }

      this.fetchProjectsEarly();
      this.warmProjectCache();
    } else if (isGetPackageSourcesResponseMessage(msg)) {
      console.log('Package sources response received:', msg.args.sources);
      if (!msg.args.error) {
        this.packageSources = msg.args.sources || [];
      }
    } else if (msg.method === 'search/results') {
      this.searchResults = msg.data.packages;
      this.loading = false;
    }
  };

  /**
   * Fetch projects immediately when webview loads.
   * Results are cached in state and passed to child components.
   * Does NOT include packageId — just gets the project list structure (fast path).
   */
  private fetchProjectsEarly(): void {
    // Guard: Already fetched or in progress
    if (this.projectsFetched || this.projectsLoading) {
      console.log('Projects already fetched or loading, skipping early fetch');
      return;
    }

    console.log('Early fetching projects...');
    this.projectsLoading = true;

    const requestId = Math.random().toString(36).substring(2, 15);
    vscode.postMessage({
      type: 'getProjects',
      payload: {
        requestId,
        packageId: undefined, // No packageId = just get project list (fast path)
      },
    });
  }

  /**
   * Fetch available package sources from extension host.
   */
  private fetchPackageSources(): void {
    const requestId = Math.random().toString(36).substring(2, 15);
    vscode.postMessage({
      type: 'getPackageSources',
      payload: { requestId },
    });
  }

  /**
   * : Pre-warm DotnetProjectParser cache by parsing all projects.
   * First call takes ~2s (with --no-restore), subsequent lookups are instant.
   */
  private warmProjectCache(): void {
    if (this.cacheWarmed || this.cacheWarming) {
      return;
    }

    console.log('Warming project cache...');
    this.cacheWarming = true;

    const requestId = Math.random().toString(36).substring(2, 15);

    // Fetch with a dummy packageId to trigger parseProjects() call
    // This warms DotnetProjectParser's internal cache for all projects
    vscode.postMessage({
      type: 'getProjects',
      payload: { requestId, packageId: '_cache_warmup' },
    });

    // Mark as warmed after a delay (backend cache is now populated)
    setTimeout(() => {
      this.cacheWarmed = true;
      this.cacheWarming = false;
      console.log('Project cache warmed');
    }, 3000);
  }

  private handleSearchInput = (e: Event): void => {
    const target = e.target as HTMLInputElement;
    this.searchQuery = target.value;

    // Clear existing debounce timer
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }

    // Debounce search requests (300ms)
    this.searchDebounceTimer = setTimeout(() => {
      this.performSearch();
    }, 300);
  };

  private handlePrereleaseToggle = (e: CustomEvent): void => {
    this.includePrerelease = e.detail.checked;
    this.performSearch();
  };

  private handleSourceChanged = (e: CustomEvent<{ sourceId: string }>): void => {
    const previousSource = this.selectedSourceId;
    this.selectedSourceId = e.detail.sourceId;

    console.log('Source changed:', { from: previousSource, to: this.selectedSourceId });

    // Clear results and re-run search if query exists
    if (this.searchQuery.trim()) {
      this.searchResults = [];
      this.totalHits = 0;
      this.hasMore = false;
      this.performSearch();
    }
  };

  /**
   * : Manual refresh of project cache and installed packages.
   * Clears all frontend caches and triggers backend cache invalidation.
   */
  private handleRefreshProjects = (): void => {
    console.log('Manual refresh triggered by user');

    // Clear frontend caches
    this.cachedProjects = [];
    this.projectsFetched = false;
    this.cacheWarmed = false;
    this.cacheWarming = false;

    // Clear details panel cache
    const detailsPanel = this.shadowRoot?.querySelector('package-details-panel');
    if (detailsPanel) {
      (detailsPanel as any).clearInstalledStatusCache();
    }

    // Trigger IPC to clear backend DotnetProjectParser cache
    vscode.postMessage({
      type: 'refreshProjectCache',
      payload: { requestId: Math.random().toString(36).substring(2) },
    });

    // Re-fetch projects and warm cache
    this.fetchProjectsEarly();
    this.warmProjectCache();
  };

  private performSearch(): void {
    if (!this.searchQuery.trim()) {
      this.searchResults = [];
      this.totalHits = 0;
      this.hasMore = false;
      this.loading = false;
      return;
    }

    // Reset scroll position on new search
    const listContainer = this.shadowRoot?.querySelector('.results-container');
    if (listContainer) {
      listContainer.scrollTop = 0;
    }

    this.loading = true;

    const request: SearchRequestMessage = {
      type: 'searchRequest',
      payload: {
        query: this.searchQuery,
        includePrerelease: this.includePrerelease,
        skip: 0,
        take: 25,
        requestId: Date.now().toString(),
        sourceId: this.selectedSourceId,
      },
    };

    vscode.postMessage(request);
  }

  private handleLoadMore = (): void => {
    if (this.loading || !this.hasMore) {
      return;
    }

    this.loading = true;

    const request: LoadMoreRequestMessage = {
      type: 'loadMoreRequest',
      payload: {
        requestId: Date.now().toString(),
      },
    };

    vscode.postMessage(request);
  };

  private handleTryAllFeeds = (): void => {
    // Switch to 'all' feeds and re-run the current search
    this.selectedSourceId = 'all';
    this.performSearch();
  };

  private handlePackageSelected = (e: CustomEvent): void => {
    const { packageId } = e.detail;
    console.log('Package selected:', packageId);
    this.selectedPackageId = packageId;
    this.detailsLoading = true;

    // Cancel previous request if still in-flight
    if (this.currentDetailsController) {
      this.currentDetailsController.abort();
    }
    this.currentDetailsController = new AbortController();

    // Get the version and download count from search results if available
    const searchResult = this.searchResults.find(pkg => pkg.id === packageId);
    const version = searchResult?.version;
    const totalDownloads = searchResult?.totalDownloads;
    const iconUrl = searchResult?.iconUrl;
    // Prefer the source that produced the search result. If missing and
    // the current selection is 'all', do not pass 'all' — pass undefined
    // so the host can pick a sensible default enabled source.
    const resultSourceId = (searchResult as any)?.sourceId ?? null;
    const sourceId = resultSourceId ?? (this.selectedSourceId === 'all' ? undefined : this.selectedSourceId);
    const sourceName = (searchResult as any)?.sourceName ?? null;
    console.log('Found version in search results:', version);

    // Store sourceId for details panel (normalize undefined -> null)
    this.selectedPackageSourceId = sourceId ?? null;
    this.selectedPackageSourceName = sourceName || null;

    const request: PackageDetailsRequestMessage = {
      type: 'packageDetailsRequest',
      payload: {
        packageId,
        version, // Pass version from search results or undefined for latest
        totalDownloads, // Pass download count from search results
        iconUrl, // Pass icon URL from search results
        requestId: Date.now().toString(),
        sourceId, // Optional: leave undefined to let host choose default when searching 'all'
      },
    };

    console.log('Sending packageDetailsRequest:', request);
    vscode.postMessage(request);
  };

  private handlePanelClose = (): void => {
    this.detailsPanelOpen = false;
    this.selectedPackageId = null;
    // Cancel any in-flight details request
    if (this.currentDetailsController) {
      this.currentDetailsController.abort();
      this.currentDetailsController = null;
    }
  };

  private handleVersionSelected = (e: CustomEvent): void => {
    const { version } = e.detail;
    if (!this.selectedPackageId) return;

    this.detailsLoading = true;

    // Preserve the download count and icon from current package data
    const totalDownloads = this.packageDetailsData?.totalDownloads;
    const iconUrl = this.packageDetailsData?.iconUrl;

    const request: PackageDetailsRequestMessage = {
      type: 'packageDetailsRequest',
      payload: {
        packageId: this.selectedPackageId,
        version,
        totalDownloads, // Preserve download count across version changes
        iconUrl, // Preserve icon URL across version changes
        requestId: Date.now().toString(),
        sourceId: this.selectedPackageSourceId || this.selectedSourceId, // Use stored source or current selection
      },
    };

    vscode.postMessage(request);
  };

  private handleInstallPackage = (e: CustomEvent): void => {
    const { packageId, version, projectPaths } = e.detail;

    if (!packageId || !version || !projectPaths || projectPaths.length === 0) {
      console.error('Invalid install package request:', e.detail);
      return;
    }

    const requestId = Date.now().toString();

    const request: InstallPackageRequestMessage = {
      type: 'installPackageRequest',
      payload: {
        packageId,
        version,
        projectPaths,
        requestId,
      },
    };

    console.log('Sending install package request:', request);
    vscode.postMessage(request);
  };

  private handleUninstallPackage = (e: CustomEvent): void => {
    const { packageId, projectPaths } = e.detail;

    if (!packageId || !projectPaths || projectPaths.length === 0) {
      console.error('Invalid uninstall package request:', e.detail);
      return;
    }

    const requestId = Date.now().toString();

    const request: UninstallPackageRequestMessage = {
      type: 'uninstallPackageRequest',
      payload: {
        packageId,
        projectPaths,
        requestId,
      },
    };

    console.log('Sending uninstall package request:', request);
    vscode.postMessage(request);
  };

  private sendMessage(msg: unknown): void {
    vscode.postMessage(msg);
  }
}
