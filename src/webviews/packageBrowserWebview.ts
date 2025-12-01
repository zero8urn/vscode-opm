import * as vscode from 'vscode';
import type { ILogger } from '../services/loggerService';
import { createNonce, buildHtmlTemplate, isWebviewMessage } from './webviewHelpers';
import type { SearchRequestMessage, WebviewReadyMessage, SearchResponseMessage } from './apps/package-browser/types';
import { isSearchRequestMessage, isWebviewReadyMessage } from './apps/package-browser/types';

/**
 * Creates and configures the Package Browser webview panel.
 *
 * This factory function creates a webview panel for browsing and searching NuGet packages.
 * The webview implements a typed IPC protocol for communication between the host and client.
 *
 * @param context - Extension context for resource URIs and lifecycle management
 * @param logger - Logger instance for debug and error logging
 * @returns The configured webview panel
 */
export function createPackageBrowserWebview(context: vscode.ExtensionContext, logger: ILogger): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel('opmPackageBrowser', 'NuGet Package Browser', vscode.ViewColumn.One, {
    enableScripts: true,
    retainContextWhenHidden: true, // Preserve search state when panel is hidden
  });

  // Clean up on disposal
  panel.onDidDispose(() => {
    logger.debug('Package Browser webview disposed');
  });

  // Generate nonce for CSP
  const nonce = createNonce();

  // Build and set HTML content
  panel.webview.html = buildPackageBrowserHtml(nonce, panel.webview);

  // Handle messages from webview
  panel.webview.onDidReceiveMessage(message => {
    if (!isWebviewMessage(message)) {
      logger.warn('Invalid webview message received', message);
      return;
    }
    handleWebviewMessage(message, panel, logger);
  });

  logger.debug('Package Browser webview initialized');

  return panel;
}

/**
 * Handle typed messages from the webview client.
 */
function handleWebviewMessage(message: unknown, panel: vscode.WebviewPanel, logger: ILogger): void {
  const msg = message as { type: string; [key: string]: unknown };

  if (isWebviewReadyMessage(msg)) {
    handleWebviewReady(msg, panel, logger);
  } else if (isSearchRequestMessage(msg)) {
    handleSearchRequest(msg, panel, logger);
  } else {
    logger.warn('Unknown webview message type', msg);
  }
}

function handleWebviewReady(message: WebviewReadyMessage, panel: vscode.WebviewPanel, logger: ILogger): void {
  // Send initial configuration or state to webview if needed
  logger.debug('Webview ready message handled');
}

function handleSearchRequest(message: SearchRequestMessage, panel: vscode.WebviewPanel, logger: ILogger): void {
  // Placeholder for NuGet API integration (future story)
  logger.debug('Search request received', message.payload);

  // Mock response for development
  const response: SearchResponseMessage = {
    type: 'notification',
    name: 'searchResponse',
    args: {
      query: message.payload.query,
      results: [],
      totalCount: 0,
      requestId: message.payload.requestId,
    },
  };

  panel.webview.postMessage(response);
}

/**
 * Build the HTML document for the Package Browser webview.
 * Uses Lit 3.x from CDN for zero build configuration.
 */
function buildPackageBrowserHtml(nonce: string, webview: vscode.Webview): string {
  // Build the Lit component script separately to avoid sanitization
  const litComponentScript = `
    import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';

        class PackageBrowserApp extends LitElement {
          static properties = {
            searchQuery: { type: String },
            isLoading: { type: Boolean },
            results: { type: Array },
          };

          static styles = css\`
            :host {
              display: block;
              padding: 16px;
              font-family: var(--vscode-font-family);
              color: var(--vscode-foreground);
              background-color: var(--vscode-editor-background);
            }

            .search-container {
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
              margin-top: 16px;
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
          \`;

          constructor() {
            super();
            this.searchQuery = '';
            this.isLoading = false;
            this.results = [];
            this.vscode = acquireVsCodeApi();
            this.searchDebounceTimer = null;

            // Listen for messages from the extension host
            window.addEventListener('message', this.handleHostMessage.bind(this));

            // Send ready message to host
            this.vscode.postMessage({ type: 'ready' });
          }

          handleHostMessage(event) {
            const message = event.data;

            // Handle search responses
            if (message?.type === 'notification' && message?.name === 'searchResponse') {
              this.isLoading = false;
              this.results = message.args?.results || [];
              this.requestUpdate();
            }
          }

          handleSearchInput(e) {
            this.searchQuery = e.target.value;

            // Debounce search requests (300ms)
            if (this.searchDebounceTimer) {
              clearTimeout(this.searchDebounceTimer);
            }

            this.searchDebounceTimer = setTimeout(() => {
              this.performSearch();
            }, 300);
          }

          performSearch() {
            if (!this.searchQuery.trim()) {
              this.results = [];
              this.requestUpdate();
              return;
            }

            this.isLoading = true;
            this.requestUpdate();

            // Send search request to host
            this.vscode.postMessage({
              type: 'searchRequest',
              payload: {
                query: this.searchQuery,
                includePrerelease: false,
                skip: 0,
                take: 25,
                requestId: Date.now().toString(),
              },
            });
          }

          render() {
            return html\`
              <div class="search-container">
                <input
                  type="text"
                  class="search-input"
                  placeholder="Search NuGet packages..."
                  .value=\${this.searchQuery}
                  @input=\${this.handleSearchInput}
                  aria-label="Search packages"
                />
                <div class="helper-text">
                  Search by package name, keyword, or author.
                </div>
              </div>

              <div class="results-container">
                \${this.isLoading
                  ? html\`<div class="loading">Searching...</div>\`
                  : this.results.length === 0 && this.searchQuery
                    ? html\`<div class="empty-state">No packages found. Try different keywords.</div>\`
                    : this.results.length === 0
                      ? html\`<div class="empty-state">Enter a search query to find packages.</div>\`
                      : html\`<div>Results will be displayed here (\${this.results.length} found)</div>\`
                }
              </div>
            \`;
          }
        }

    customElements.define('package-browser-app', PackageBrowserApp);
  `;

  // Build HTML with script injected after body to avoid sanitization
  const html = buildHtmlTemplate({
    title: 'NuGet Package Browser',
    nonce,
    webview,
    bodyHtml: `<div id="app"><package-browser-app></package-browser-app></div>`,
  });

  // Inject the Lit component script before closing body tag
  return html.replace('</body>', `<script type="module" nonce="${nonce}">${litComponentScript}</script></body>`);
}
