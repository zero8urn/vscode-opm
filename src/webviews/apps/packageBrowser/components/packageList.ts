import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import '@lit-labs/virtualizer';
import { PACKAGE_CARD_TAG } from './packageCard';
import { LOADING_SPINNER_TAG } from './shared/loadingSpinner';
import type { PackageSearchResult } from '../types';

/** Custom element tag name for package list component */
export const PACKAGE_LIST_TAG = 'package-list' as const;

/**
 * Virtualized list component for displaying NuGet search results.
 * Uses @lit-labs/virtualizer for efficient rendering of large result sets.
 */
@customElement(PACKAGE_LIST_TAG)
export class PackageList extends LitElement {
  /**
   * Array of package search results to display.
   * Updated by parent component when search completes.
   */
  @property({ type: Array })
  packages: PackageSearchResult[] = [];

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
      overflow-y: auto;
      overflow-x: hidden;
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
  `;

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

    // Loading state
    if (this.loading && this.packages.length === 0) {
      return html`
        <div class="loading-overlay">
          <loading-spinner></loading-spinner>
        </div>
      `;
    }

    // Virtualized list with local scroll container
    return html`
      <div class="list-container" id="scroll-container">
        <lit-virtualizer
          .items=${this.packages}
          .renderItem=${(pkg: PackageSearchResult) => this.renderPackageCard(pkg)}
        ></lit-virtualizer>
      </div>
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
