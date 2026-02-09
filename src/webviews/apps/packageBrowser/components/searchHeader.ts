/**
 * SearchHeader Component
 *
 * Composed search interface with input, filters, and refresh button.
 * Uses SearchController for debouncing and abort handling.
 */

import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { SearchController } from '../controllers/searchController';
import { refreshIcon } from './icons';
import type { PackageSourceOption } from './sourceSelector';

import './searchInput';
import './prerelease-toggle';
import './sourceSelector';

/** Custom element tag name for search header component */
export const SEARCH_HEADER_TAG = 'search-header' as const;

/**
 * Search header with composed controls.
 *
 * **Events:**
 * - `search-request`: Fired when search should be executed (after debounce)
 *   - detail: { query: string, includePrerelease: boolean, sourceId: string }
 * - `refresh-projects`: Fired when refresh button is clicked
 *
 * **Usage:**
 * ```html
 * <search-header
 *   .query=${query}
 *   .includePrerelease=${includePrerelease}
 *   .selectedSourceId=${sourceId}
 *   .sources=${sources}
 *   .loading=${loading}
 *   @search-request=${handleSearch}
 *   @refresh-projects=${handleRefresh}
 * ></search-header>
 * ```
 */
@customElement(SEARCH_HEADER_TAG)
export class SearchHeader extends LitElement {
  @property({ type: String })
  query = '';

  @property({ type: Boolean })
  includePrerelease = false;

  @property({ type: String })
  selectedSourceId = 'all';

  @property({ type: Array })
  sources: PackageSourceOption[] = [];

  @property({ type: Boolean })
  loading = false;

  private searchController = new SearchController(
    this,
    (query: string, signal: AbortSignal) => {
      this.emitSearchRequest(query, signal);
    },
    300, // 300ms debounce
  );

  static override styles = css`
    :host {
      display: block;
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

    .refresh-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
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

    @media (max-width: 600px) {
      .search-header {
        align-items: stretch;
      }

      .refresh-button {
        justify-content: center;
      }
    }
  `;

  private handleInputChange(e: CustomEvent<{ value: string }>): void {
    const newQuery = e.detail.value;
    // Update local state
    this.query = newQuery;
    // Trigger debounced search
    this.searchController.search(newQuery);
  }

  private handlePrereleaseToggle(e: CustomEvent<{ checked: boolean }>): void {
    this.includePrerelease = e.detail.checked;
    // Re-trigger search with new filter
    this.searchController.search(this.query);
  }

  private handleSourceChange(e: CustomEvent<{ sourceId: string }>): void {
    this.selectedSourceId = e.detail.sourceId;
    // Re-trigger search with new source
    this.searchController.search(this.query);
  }

  private handleRefresh(): void {
    this.dispatchEvent(
      new CustomEvent('refresh-projects', {
        bubbles: true,
        composed: true,
      }),
    );
  }

  private emitSearchRequest(query: string, signal: AbortSignal): void {
    this.dispatchEvent(
      new CustomEvent('search-request', {
        detail: {
          query,
          includePrerelease: this.includePrerelease,
          sourceId: this.selectedSourceId,
          signal,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    return html`
      <div class="search-header">
        <div class="search-input-wrapper">
          <search-input
            .value=${this.query}
            .disabled=${this.loading}
            .placeholder=${'Search by package name, keyword, or author.'}
            @input-change=${this.handleInputChange}
          ></search-input>
        </div>
        <prerelease-toggle
          .checked=${this.includePrerelease}
          .disabled=${this.loading}
          @change=${this.handlePrereleaseToggle}
        ></prerelease-toggle>
        <source-selector
          .sources=${this.sources}
          .selectedSourceId=${this.selectedSourceId}
          .disabled=${this.loading}
          @source-changed=${this.handleSourceChange}
        ></source-selector>
        <button
          class="refresh-button"
          @click=${this.handleRefresh}
          ?disabled=${this.loading}
          title="Refresh project list and installed packages"
          aria-label="Refresh projects"
        >
          ${refreshIcon}
        </button>
      </div>
    `;
  }
}
