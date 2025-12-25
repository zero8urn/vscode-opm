/**
 * Package Browser App - Root Lit component for NuGet package search and browse.
 *
 * This component provides a reactive search interface with debounced input,
 * communicating with the extension host via typed IPC messages.
 *
 * Architecture:
 * - Uses Lit 3.x reactive properties for state management
 * - Implements 300ms debounced search to optimize API calls
 * - Integrates with VS Code theming via CSS custom properties
 * - Handles IPC protocol for search requests/responses
 *
 * @see {@link ./types.ts} for IPC message contracts
 * @see {@link ../../packageBrowserWebview.ts} for host-side controller
 */

import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { SearchRequestMessage, SearchResponseMessage, PackageSearchResult, WebviewReadyMessage } from './types';
import { isSearchResponseMessage } from './types';
import '../packageBrowser/components/packageList';

// VS Code API (injected by webview host)
declare const acquireVsCodeApi: () => {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

/**
 * Root component for Package Browser webview.
 * Manages search state and coordinates IPC with extension host.
 */
@customElement('package-browser-app')
export class PackageBrowserApp extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      padding: 16px;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      box-sizing: border-box;
    }

    .search-container {
      flex-shrink: 0;
      margin-bottom: 24px;
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
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .results-summary {
      flex-shrink: 0;
      padding: 12px;
      margin-bottom: 12px;
      font-size: 13px;
      color: var(--vscode-descriptionForeground);
      background-color: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 2px;
    }

    .package-list-wrapper {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 2px;
    }

    .loading {
      text-align: center;
      padding: 24px;
      color: var(--vscode-descriptionForeground);
    }

    .empty-state {
      text-align: center;
      padding: 48px 24px;
      color: var(--vscode-descriptionForeground);
    }
  `;

  @state()
  private searchQuery = '';

  @state()
  private isLoading = false;

  @state()
  private results: PackageSearchResult[] = [];

  private vscode = acquireVsCodeApi();
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Component initialization - set up message listeners and notify host.
   */
  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener('message', this.handleHostMessage);

    // Notify host that webview is ready
    const readyMessage: WebviewReadyMessage = { type: 'ready' };
    this.vscode.postMessage(readyMessage);
  }

  /**
   * Component cleanup - remove message listeners.
   */
  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('message', this.handleHostMessage);
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
  }

  /**
   * Handle messages from extension host (IPC protocol).
   */
  private handleHostMessage = (event: MessageEvent): void => {
    const message = event.data;

    if (isSearchResponseMessage(message)) {
      this.handleSearchResponse(message);
    }
  };

  /**
   * Process search response from host.
   */
  private handleSearchResponse(message: SearchResponseMessage): void {
    this.isLoading = false;
    this.results = message.args.results || [];
  }

  /**
   * Handle search input changes with debouncing.
   */
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

  /**
   * Send search request to extension host.
   */
  private performSearch(): void {
    if (!this.searchQuery.trim()) {
      this.results = [];
      this.isLoading = false;
      return;
    }

    this.isLoading = true;

    const request: SearchRequestMessage = {
      type: 'searchRequest',
      payload: {
        query: this.searchQuery,
        includePrerelease: false,
        skip: 0,
        take: 25,
        requestId: Date.now().toString(),
      },
    };

    this.vscode.postMessage(request);
  }

  /**
   * Render the results area based on loading and search state.
   */
  private renderResults() {
    if (this.isLoading) {
      return html`<div class="loading">Searching...</div>`;
    }

    if (this.results.length === 0 && this.searchQuery) {
      return html`<div class="empty-state">No packages found. Try different keywords.</div>`;
    }

    if (this.results.length === 0) {
      return html`<div class="empty-state">Enter a search query to find packages.</div>`;
    }

    return html`
      <div class="results-summary">
        Found ${this.results.length} package${this.results.length === 1 ? '' : 's'} matching "${this.searchQuery}"
      </div>
      <div class="package-list-wrapper">
        <package-list .packages=${this.results} .loading=${this.isLoading}></package-list>
      </div>
    `;
  }

  /**
   * Render the component UI.
   */
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
        <div class="helper-text">Search by package name, keyword, or author.</div>
      </div>

      <div class="results-container">${this.renderResults()}</div>
    `;
  }
}
