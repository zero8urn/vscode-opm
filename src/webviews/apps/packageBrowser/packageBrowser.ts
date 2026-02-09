import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import './components/packageList';
import './components/searchHeader';
import './components/packageDetailsPanel';
import type {
  SearchRequestMessage,
  LoadMoreRequestMessage,
  PackageDetailsRequestMessage,
  InstallPackageRequestMessage,
  UninstallPackageRequestMessage,
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
import { vscode } from './vscode-api';

// State management imports
import { SearchState } from './state/search-state';
import { DetailsState } from './state/details-state';
import { ProjectsState } from './state/projects-state';
import { SourcesState } from './state/sources-state';

// Styles
import { appStyles, commonStyles, iconStyles, errorStyles } from './styles';

/**
 * Root application component for the Package Browser webview.
 * Manages search results, pagination state, and coordinates IPC with the extension host.
 */
@customElement('package-browser-app')
export class PackageBrowserApp extends LitElement {
  // State managers
  private readonly searchState = new SearchState();
  private readonly detailsState = new DetailsState();
  private readonly projectsState = new ProjectsState();
  private readonly sourcesState = new SourcesState();

  // Single reactive trigger for Lit re-renders
  @state()
  private stateVersion = 0;

  private currentDetailsController: AbortController | null = null;

  /**
   * Update state and trigger Lit re-render
   */
  private updateState(updater: () => void): void {
    updater();
    this.stateVersion++;
  }

  static override styles = [commonStyles, appStyles, iconStyles, errorStyles];

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
      if (!this.projectsState.isFetched() && !this.projectsState.isLoading()) {
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
    const searchError = this.searchState.getError();
    return html`
      <div class="app-header">
        <div class="search-container">
          <search-header
            .query=${this.searchState.getQuery()}
            .includePrerelease=${this.searchState.getIncludePrerelease()}
            .selectedSourceId=${this.searchState.getSelectedSourceId()}
            .sources=${this.sourcesState.getSources()}
            .loading=${this.searchState.isLoading()}
            @search-request=${this.handleSearchRequest}
            @refresh-projects=${this.handleRefreshProjects}
          ></search-header>
        </div>
      </div>

      <div class="app-body">
        ${searchError ? this.renderErrorBanner(searchError) : ''}
        <div class="results-container">
          <package-list
            .packages=${this.searchState.getResults()}
            .totalHits=${this.searchState.getTotalHits()}
            .hasMore=${this.searchState.getHasMore()}
            .loading=${this.searchState.isLoading()}
            .selectedSourceId=${this.searchState.getSelectedSourceId()}
            .searchQuery=${this.searchState.getQuery()}
            @package-selected=${this.handlePackageSelected}
            @load-more=${this.handleLoadMore}
            @try-all-feeds=${this.handleTryAllFeeds}
          ></package-list>
        </div>

        <package-details-panel
          .packageData=${this.detailsState.getPackageDetails()}
          .includePrerelease=${this.searchState.getIncludePrerelease()}
          .sourceId=${this.detailsState.getSelectedSourceId()}
          .sourceName=${this.detailsState.getSelectedSourceName()}
          .cachedProjects=${this.projectsState.getProjects()}
          .parentProjectsLoading=${this.projectsState.isLoading()}
          ?open=${this.detailsState.isPanelOpen()}
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
      this.updateState(() => {
        this.searchState.setResults(msg.args.results || [], msg.args.totalHits || 0, msg.args.hasMore || false);
        this.searchState.setError(msg.args.error || null);
        this.searchState.setLoading(false);
      });
    } else if (isPackageDetailsResponseMessage(msg)) {
      console.log('PackageDetailsResponse received:', msg.args);
      this.updateState(() => {
        this.detailsState.setPackageDetails(msg.args.data || null);
        this.detailsState.setLoading(false);
        if (msg.args.data) {
          console.log('Opening panel with data:', msg.args.data);
          this.detailsState.setPanelOpen(true);
        } else if (msg.args.error) {
          console.error('Package details error:', msg.args.error);
        }
      });
    } else if (isInstallPackageResponseMessage(msg)) {
      console.log('Install package response received:', msg.args);

      // Forward response to package-details-panel for UI updates
      const detailsPanel = this.shadowRoot?.querySelector('package-details-panel');
      if (detailsPanel) {
        // The panel will forward results to project-selector component
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

      this.updateState(() => {
        if (!msg.args.error) {
          this.projectsState.setProjects(msg.args.projects || []);
        }
        this.projectsState.setLoading(false);
      });
    } else if (isProjectsChangedNotification(msg)) {
      console.log('Projects changed notification received, clearing cache');
      this.updateState(() => {
        this.projectsState.clear();
        this.sourcesState.setCacheWarmed(false);
        this.sourcesState.setCacheWarming(false);
      });

      //  Clear details panel's installed status cache
      const detailsPanel = this.shadowRoot?.querySelector('package-details-panel');
      if (detailsPanel) {
        (detailsPanel as any).clearInstalledStatusCache();
      }

      this.fetchProjectsEarly();
      this.warmProjectCache();
    } else if (isGetPackageSourcesResponseMessage(msg)) {
      console.log('Package sources response received:', msg.args.sources);
      this.updateState(() => {
        if (!msg.args.error) {
          this.sourcesState.setSources(msg.args.sources || []);
        }
      });
    } else if (msg.method === 'search/results') {
      this.updateState(() => {
        this.searchState.setResults(msg.data.packages, 0, false);
        this.searchState.setLoading(false);
      });
    }
  };

  /**
   * Fetch projects immediately when webview loads.
   * Results are cached in state and passed to child components.
   * Does NOT include packageId — just gets the project list structure (fast path).
   */
  private fetchProjectsEarly(): void {
    // Guard: Already fetched or in progress
    if (this.projectsState.isFetched() || this.projectsState.isLoading()) {
      console.log('Projects already fetched or loading, skipping early fetch');
      return;
    }

    console.log('Early fetching projects...');
    this.updateState(() => {
      this.projectsState.setLoading(true);
    });

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
    if (this.sourcesState.isCacheWarmed() || this.sourcesState.isCacheWarming()) {
      return;
    }

    console.log('Warming project cache...');
    this.updateState(() => {
      this.sourcesState.setCacheWarming(true);
    });

    const requestId = Math.random().toString(36).substring(2, 15);

    // Fetch with a dummy packageId to trigger parseProjects() call
    // This warms DotnetProjectParser's internal cache for all projects
    vscode.postMessage({
      type: 'getProjects',
      payload: { requestId, packageId: '_cache_warmup' },
    });

    // Mark as warmed after a delay (backend cache is now populated)
    setTimeout(() => {
      this.updateState(() => {
        this.sourcesState.setCacheWarmed(true);
        this.sourcesState.setCacheWarming(false);
      });
      console.log('Project cache warmed');
    }, 3000);
  }

  /**
   * Handle search request from SearchHeader (after debounce)
   */
  private handleSearchRequest = (
    e: CustomEvent<{ query: string; includePrerelease: boolean; sourceId: string; signal: AbortSignal }>,
  ): void => {
    const { query, includePrerelease, sourceId } = e.detail;

    this.updateState(() => {
      this.searchState.setQuery(query);
      this.searchState.setIncludePrerelease(includePrerelease);
      this.searchState.setSelectedSourceId(sourceId);
      this.searchState.setLoading(true);
      this.searchState.setError(null);
    });

    const request: SearchRequestMessage = {
      type: 'searchRequest',
      payload: {
        query,
        skip: 0,
        take: 20,
        includePrerelease,
        sourceId: sourceId === 'all' ? undefined : sourceId,
      },
    };

    vscode.postMessage(request);
  };

  /**
   * : Manual refresh of project cache and installed packages.
   * Clears all frontend caches and triggers backend cache invalidation.
   */
  private handleRefreshProjects = (): void => {
    console.log('Manual refresh triggered by user');

    // Clear frontend caches
    this.updateState(() => {
      this.projectsState.clear();
      this.sourcesState.setCacheWarmed(false);
      this.sourcesState.setCacheWarming(false);
    });

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
    const query = this.searchState.getQuery();
    if (!query.trim()) {
      this.updateState(() => {
        this.searchState.clear();
      });
      return;
    }

    // Reset scroll position on new search
    const listContainer = this.shadowRoot?.querySelector('.results-container');
    if (listContainer) {
      listContainer.scrollTop = 0;
    }

    this.updateState(() => {
      this.searchState.setLoading(true);
    });

    const request: SearchRequestMessage = {
      type: 'searchRequest',
      payload: {
        query,
        includePrerelease: this.searchState.getIncludePrerelease(),
        skip: 0,
        take: 25,
        requestId: Date.now().toString(),
        sourceId: this.searchState.getSelectedSourceId(),
      },
    };

    vscode.postMessage(request);
  }

  private handleLoadMore = (): void => {
    if (this.searchState.isLoading() || !this.searchState.getHasMore()) {
      return;
    }

    this.updateState(() => {
      this.searchState.setLoading(true);
    });

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
    this.updateState(() => {
      this.searchState.setSelectedSourceId('all');
    });
    this.performSearch();
  };

  private handlePackageSelected = (e: CustomEvent): void => {
    const { packageId } = e.detail;
    console.log('Package selected:', packageId);

    // Cancel previous request if still in-flight
    if (this.currentDetailsController) {
      this.currentDetailsController.abort();
    }
    this.currentDetailsController = new AbortController();

    // Get the version and download count from search results if available
    const searchResult = this.searchState.getResults().find(pkg => pkg.id === packageId);
    const version = searchResult?.version;
    const totalDownloads = searchResult?.totalDownloads;
    const iconUrl = searchResult?.iconUrl;
    // Prefer the source that produced the search result. If missing and
    // the current selection is 'all', do not pass 'all' — pass undefined
    // so the host can pick a sensible default enabled source.
    const resultSourceId = (searchResult as any)?.sourceId ?? null;
    const currentSourceId = this.searchState.getSelectedSourceId();
    const sourceId = resultSourceId ?? (currentSourceId === 'all' ? undefined : currentSourceId);
    const sourceName = (searchResult as any)?.sourceName ?? null;
    console.log('Found version in search results:', version);

    // Store sourceId for details panel (normalize undefined -> null)
    this.updateState(() => {
      this.detailsState.setSelectedPackageId(packageId);
      this.detailsState.setLoading(true);
      this.detailsState.setSelectedSource(sourceId ?? null, sourceName || null);
    });

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
    this.updateState(() => {
      this.detailsState.closePanel();
    });
    // Cancel any in-flight details request
    if (this.currentDetailsController) {
      this.currentDetailsController.abort();
      this.currentDetailsController = null;
    }
  };

  private handleVersionSelected = (e: CustomEvent): void => {
    const { version } = e.detail;
    const selectedPackageId = this.detailsState.getSelectedPackageId();
    if (!selectedPackageId) return;

    this.updateState(() => {
      this.detailsState.setLoading(true);
    });

    // Preserve the download count and icon from current package data
    const packageData = this.detailsState.getPackageDetails();
    const totalDownloads = packageData?.totalDownloads;
    const iconUrl = packageData?.iconUrl;

    const request: PackageDetailsRequestMessage = {
      type: 'packageDetailsRequest',
      payload: {
        packageId: selectedPackageId,
        version,
        totalDownloads, // Preserve download count across version changes
        iconUrl, // Preserve icon URL across version changes
        requestId: Date.now().toString(),
        sourceId: this.detailsState.getSelectedSourceId() || this.searchState.getSelectedSourceId(), // Use stored source or current selection
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
