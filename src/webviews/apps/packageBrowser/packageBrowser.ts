import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import './components/packageList';
import './components/prerelease-toggle';
import type { PackageSearchResult, SearchRequestMessage, SearchResponseMessage } from './types';
import { isSearchResponseMessage } from './types';

// Declare VS Code API types
interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare global {
  function acquireVsCodeApi(): VsCodeApi;
}

/**
 * Root application component for the Package Browser webview.
 * Manages search results and coordinates IPC with the extension host.
 */
@customElement('package-browser-app')
export class PackageBrowserApp extends LitElement {
  @state()
  private searchQuery = '';

  @state()
  private searchResults: PackageSearchResult[] = [];

  @state()
  private loading = false;

  @state()
  private includePrerelease = false;

  private vscode: VsCodeApi;
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    this.vscode = acquireVsCodeApi();
  }

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
          .loading=${this.loading}
          @package-selected=${this.handlePackageSelected}
        ></package-list>
      </div>
    `;
  }

  private handleHostMessage = (event: MessageEvent): void => {
    const msg = event.data;

    // Handle both old format (method/data) and new format (type/args)
    if (isSearchResponseMessage(msg)) {
      this.searchResults = msg.args.results || [];
      this.loading = false;
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
      this.loading = false;
      return;
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

    this.vscode.postMessage(request);
  }

  private handlePackageSelected(e: CustomEvent): void {
    const { packageId } = e.detail;

    // Send request to extension host to show package details
    this.sendMessage({
      method: 'package/select',
      data: { packageId },
    });
  }

  private sendMessage(msg: unknown): void {
    this.vscode.postMessage(msg);
  }
}
