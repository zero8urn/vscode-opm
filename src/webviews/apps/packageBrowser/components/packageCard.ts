import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { PackageSearchResult } from '../types';

/** Custom element tag name for package card component */
export const PACKAGE_CARD_TAG = 'package-card' as const;

/**
 * Individual package card displaying name, description, author, and downloads.
 * Clickable to show package details.
 */
@customElement(PACKAGE_CARD_TAG)
export class PackageCard extends LitElement {
  @property({ type: Object })
  package!: PackageSearchResult;

  @property({ type: Boolean })
  selected = false;

  static override styles = css`
    :host {
      display: block;
      width: 100%;
      cursor: pointer;
    }

    .card {
      display: flex;
      gap: 1rem;
      padding: 1rem;
      width: 100%;
      box-sizing: border-box;
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-editor-background);
      transition: background 0.1s ease;
    }

    .card:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .card.selected {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
    }

    .icon {
      flex-shrink: 0;
      width: 48px;
      height: 48px;
      border-radius: 4px;
      background: var(--vscode-input-background);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .icon img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .icon-placeholder {
      font-size: 24px;
      color: var(--vscode-descriptionForeground);
    }

    .content {
      flex: 1;
      min-width: 0; /* Allow text truncation */
    }

    .header {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
      margin-bottom: 0.25rem;
    }

    .name {
      font-weight: 600;
      font-size: 14px;
      color: var(--vscode-textLink-foreground);
    }

    .version {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .description {
      font-size: 13px;
      color: var(--vscode-foreground);
      margin-bottom: 0.5rem;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .metadata {
      display: flex;
      gap: 1rem;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .metadata-item {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    .download-count {
      font-weight: 500;
    }
  `;

  override render() {
    const pkg = this.package;
    const downloadCount = this.formatDownloadCount(pkg.totalDownloads);

    return html`
      <div class="card ${this.selected ? 'selected' : ''}">
        <div class="icon">
          ${pkg.iconUrl
            ? html`<img src="${pkg.iconUrl}" alt="${pkg.id} icon" loading="lazy" />`
            : html`<span class="icon-placeholder">📦</span>`}
        </div>

        <div class="content">
          <div class="header">
            <span class="name">${pkg.id}</span>
            <span class="version">v${pkg.version}</span>
          </div>

          ${pkg.description ? html`<div class="description">${pkg.description}</div>` : ''}

          <div class="metadata">
            ${pkg.authors?.length ? html` <span class="metadata-item"> 👤 ${pkg.authors.join(', ')} </span> ` : ''}
            <span class="metadata-item"> ⬇️ <span class="download-count">${downloadCount}</span> </span>
          </div>
        </div>
      </div>
    `;
  }

  private formatDownloadCount(count: number): string {
    if (count >= 1_000_000) {
      return `${(count / 1_000_000).toFixed(1)}M`;
    }
    if (count >= 1_000) {
      return `${(count / 1_000).toFixed(1)}K`;
    }
    return count.toString();
  }
}
