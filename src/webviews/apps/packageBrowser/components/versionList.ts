import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { VersionSummary } from '../../../services/packageDetailsService';

/** Custom element tag name for version list component */
export const VERSION_LIST_TAG = 'version-list' as const;

/**
 * Scrollable list of all package versions with badges and metadata.
 */
@customElement(VERSION_LIST_TAG)
export class VersionList extends LitElement {
  @property({ type: Array })
  versions: VersionSummary[] = [];

  @property({ type: String })
  selectedVersion?: string;

  static override styles = css`
    :host {
      display: block;
      overflow-y: auto;
      max-height: calc(100vh - 300px);
    }

    .empty {
      padding: 2rem;
      text-align: center;
      color: var(--vscode-descriptionForeground);
    }

    .version-item {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--vscode-panel-border);
      cursor: pointer;
      transition: background 0.1s ease;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .version-item:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .version-item.selected {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
    }

    .version-item:focus {
      outline: 2px solid var(--vscode-focusBorder);
      outline-offset: -2px;
    }

    .version-info {
      flex: 1;
      min-width: 0;
    }

    .version-number {
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 0.25rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .version-metadata {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      display: flex;
      gap: 1rem;
    }

    .badges {
      display: flex;
      gap: 0.25rem;
      flex-shrink: 0;
    }

    .badge {
      padding: 0.125rem 0.375rem;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .prerelease {
      background: var(--vscode-inputValidation-infoBorder);
      color: var(--vscode-input-background);
    }

    .deprecated {
      background: var(--vscode-inputValidation-warningBackground);
      color: var(--vscode-inputValidation-warningForeground);
    }
  `;

  override render() {
    if (this.versions.length === 0) {
      return html` <div class="empty">No versions available</div> `;
    }

    return html`
      ${this.versions.map(
        version => html`
          <div
            class="version-item ${version.version === this.selectedVersion ? 'selected' : ''}"
            role="button"
            tabindex="0"
            @click=${() => this.handleVersionClick(version.version)}
            @keydown=${(e: KeyboardEvent) => this.handleKeyDown(e, version.version)}
          >
            <div class="version-info">
              <div class="version-number">
                ${version.version}
                <div class="badges">
                  ${version.isPrerelease ? html`<span class="badge prerelease">Prerelease</span>` : ''}
                  ${version.isDeprecated ? html`<span class="badge deprecated">Deprecated</span>` : ''}
                </div>
              </div>
              <div class="version-metadata">
                ${version.publishedDate ? html`<span>📅 ${this.formatDate(version.publishedDate)}</span>` : ''}
                ${version.downloads ? html`<span>⬇️ ${this.formatDownloads(version.downloads)}</span>` : ''}
              </div>
            </div>
          </div>
        `,
      )}
    `;
  }

  private handleVersionClick(version: string): void {
    this.dispatchEvent(
      new CustomEvent('version-select', {
        detail: { version },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleKeyDown(e: KeyboardEvent, version: string): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.handleVersionClick(version);
    }
  }

  private formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 1) return 'Today';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  }

  private formatDownloads(count: number): string {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return count.toString();
  }
}
