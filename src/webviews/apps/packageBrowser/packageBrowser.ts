import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import './components/packageList';
import './components/prerelease-toggle';
import './components/packageDetailsPanel';
import type {
  PackageSearchResult,
  SearchRequestMessage,
  LoadMoreRequestMessage,
  PackageDetailsRequestMessage,
  InstallPackageRequestMessage,
} from './types';
import { isSearchResponseMessage, isPackageDetailsResponseMessage, isInstallPackageResponseMessage } from './types';
import type { PackageDetailsData } from '../../services/packageDetailsService';

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
    }

    .search-container {
      flex-shrink: 0;
      padding: 16px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .search-input {
      width: 100%;
      padding: 8px 12px;
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

    .helper-text {
      margin-top: 8px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .results-container {
      flex: 1;
      overflow: hidden;
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener('message', this.handleHostMessage);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('message', this.handleHostMessage);
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
  }

  override render() {
    return html`
      <div class="search-container">
        <input
          type="text"
          class="search-input"
          placeholder="Search NuGet packages..."
          .value=${this.searchQuery}
          @input=${this.handleSearchInput}
          aria-label="Search packages"
        />
        <prerelease-toggle
          .checked=${this.includePrerelease}
          .disabled=${this.loading}
          @change=${this.handlePrereleaseToggle}
        ></prerelease-toggle>
        <div class="helper-text">Search by package name, keyword, or author.</div>
      </div>

      <div class="results-container">
        <package-list
          .packages=${this.searchResults}
          .totalHits=${this.totalHits}
          .hasMore=${this.hasMore}
          .loading=${this.loading}
          @package-selected=${this.handlePackageSelected}
          @load-more=${this.handleLoadMore}
        ></package-list>
      </div>

      <package-details-panel
        .packageData=${this.packageDetailsData}
        .includePrerelease=${this.includePrerelease}
        ?open=${this.detailsPanelOpen}
        @close=${this.handlePanelClose}
        @version-selected=${this.handleVersionSelected}
        @install-package=${this.handleInstallPackage}
        @package-selected=${this.handlePackageSelected}
      ></package-details-panel>
    `;
  }

  private handleHostMessage = (event: MessageEvent): void => {
    const msg = event.data;

    // Handle both old format (method/data) and new format (type/args)
    if (isSearchResponseMessage(msg)) {
      this.searchResults = msg.args.results || [];
      this.totalHits = msg.args.totalHits || 0;
      this.hasMore = msg.args.hasMore || false;
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
    } else if (msg.method === 'search/results') {
      this.searchResults = msg.data.packages;
      this.loading = false;
    }
  };

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
    console.log('Found version in search results:', version);

    const request: PackageDetailsRequestMessage = {
      type: 'packageDetailsRequest',
      payload: {
        packageId,
        version, // Pass version from search results or undefined for latest
        totalDownloads, // Pass download count from search results
        iconUrl, // Pass icon URL from search results
        requestId: Date.now().toString(),
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

  private sendMessage(msg: unknown): void {
    vscode.postMessage(msg);
  }
}
