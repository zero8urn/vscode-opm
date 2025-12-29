import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import '@lit-labs/virtualizer';
import { PACKAGE_CARD_TAG } from './packageCard';
import { LOADING_SPINNER_TAG } from './shared/loadingSpinner';
import type { PackageSearchResult } from '../types';

/** Custom element tag name for package list component */
export const PACKAGE_LIST_TAG = 'package-list' as const;

/**
 * Virtualized list component for displaying NuGet search results with infinite scroll.
 * Uses @lit-labs/virtualizer for efficient rendering of large result sets.
 * Implements virtualizer's rangeChanged event for scroll-based pagination.
 */
@customElement(PACKAGE_LIST_TAG)
export class PackageList extends LitElement {
  /**
   * Array of package search results to display.
   * Updated by parent component when search completes or more results load.
   */
  @property({ type: Array })
  packages: PackageSearchResult[] = [];

  /**
   * Total number of packages matching the search query (from API totalHits).
   */
  @property({ type: Number })
  totalHits = 0;

  /**
   * Whether more pages are available to load.
   */
  @property({ type: Boolean })
  hasMore = false;

  /**
   * Loading state for async operations (e.g., fetching more results).
   */
  @property({ type: Boolean })
  loading = false;

  /**
   * ID of currently selected package (for highlighting).
   */
  @state()
  private selectedPackageId: string | null = null;

  static override styles = css`
    :host {
      display: block;
      height: 100%;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
    }

    .list-container {
      height: 100%;
      width: 100%;
      display: flex;
      flex-direction: column;
    }

    .virtualizer-scroller {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--vscode-descriptionForeground);
      padding: 2rem;
      text-align: center;
    }

    .empty-state h3 {
      margin: 0 0 0.5rem 0;
      font-weight: 400;
    }

    .loading-overlay {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }

    .results-count {
      padding: 0.5rem 1rem;
      font-size: 0.9rem;
      color: var(--vscode-descriptionForeground);
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
    }

    .pagination-status {
      padding: 1rem;
      text-align: center;
      color: var(--vscode-descriptionForeground);
    }

    .load-more-spinner {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }

    .live-region {
      position: absolute;
      left: -10000px;
      width: 1px;
      height: 1px;
      overflow: hidden;
    }
  `;

  /**
   * Handle virtualizer visibility changes to detect when user scrolls near the end.
   * Triggers load-more when approaching the last items.
   *
   * IMPORTANT: lit-virtualizer uses non-standard event structure:
   * Range data is directly on the event object (e.first, e.last), NOT in e.detail
   */
  private handleVisibilityChanged(e: CustomEvent): void {
    // Access range directly on event object (non-standard event structure)
    const first = (e as any).first as number | undefined;
    const last = (e as any).last as number | undefined;

    // Guard: Validate range values
    if (first === undefined || last === undefined) {
      return;
    }

    const threshold = this.packages.length - 5; // Trigger 5 items before end

    // Load more when scrolling near the end
    if (this.hasMore && !this.loading && last >= threshold) {
      this.requestLoadMore();
    }
  }

  private requestLoadMore(): void {
    // Dispatch custom event for parent to handle IPC
    this.dispatchEvent(
      new CustomEvent('load-more', {
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    // Empty state
    if (this.packages.length === 0 && !this.loading) {
      return html`
        <div class="empty-state">
          <h3>No packages found</h3>
          <p>Try different keywords or adjust your filters.</p>
        </div>
      `;
    }

    // Loading state (initial search)
    if (this.loading && this.packages.length === 0) {
      return html`
        <div class="loading-overlay">
          <loading-spinner></loading-spinner>
        </div>
      `;
    }

    // ARIA live region for screen reader announcements
    const loadingAnnouncement = this.loading ? 'Loading more packages...' : '';

    // Results list with pagination
    return html`
      <div class="list-container">
        <lit-virtualizer
          scroller
          class="virtualizer-scroller"
          .items=${this.packages}
          .renderItem=${(pkg: PackageSearchResult) => this.renderPackageCard(pkg)}
          @visibilityChanged=${this.handleVisibilityChanged}
        ></lit-virtualizer>

        ${this.loading && this.packages.length > 0
          ? html`
              <div class="load-more-spinner">
                <loading-spinner></loading-spinner>
              </div>
            `
          : ''}
        ${!this.hasMore && this.packages.length > 0
          ? html`<div class="pagination-status">All packages loaded</div>`
          : ''}
      </div>

      <div class="live-region" role="status" aria-live="polite" aria-atomic="true">${loadingAnnouncement}</div>
    `;
  }

  private renderPackageCard(pkg: PackageSearchResult) {
    return html`
      <package-card
        .package=${pkg}
        .selected=${this.selectedPackageId === pkg.id}
        @click=${() => this.handlePackageClick(pkg)}
      ></package-card>
    `;
  }

  private handlePackageClick(pkg: PackageSearchResult): void {
    this.selectedPackageId = pkg.id;

    // Dispatch custom event for parent to handle IPC
    this.dispatchEvent(
      new CustomEvent('package-selected', {
        detail: { packageId: pkg.id },
        bubbles: true,
        composed: true,
      }),
    );
  }
}
