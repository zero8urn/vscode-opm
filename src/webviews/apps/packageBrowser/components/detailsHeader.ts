/**
 * DetailsHeader Component
 *
 * Header section for package details panel with icon, name, and close button.
 */

import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

/** Custom element tag name for details header component */
export const DETAILS_HEADER_TAG = 'details-header' as const;

/**
 * Details panel header component.
 *
 * **Events:**
 * - `close`: Fired when close button is clicked
 * - `open-link`: Fired when project URL is clicked
 *   - detail: { url: string }
 *
 * **Usage:**
 * ```html
 * <details-header
 *   .title=${"Package.Name"}
 *   .authors=${"Author Name"}
 *   .iconUrl=${"https://..."}
 *   .projectUrl=${"https://..."}
 *   .verified=${true}
 *   @close=${handleClose}
 * ></details-header>
 * ```
 */
@customElement(DETAILS_HEADER_TAG)
export class DetailsHeader extends LitElement {
  @property({ type: String })
  override title = '';

  @property({ type: String })
  authors = '';

  @property({ type: String })
  iconUrl = '';

  @property({ type: String })
  projectUrl = '';

  @property({ type: Boolean })
  verified = false;

  @property({ type: String })
  sourceName: string | null = null;

  static override styles = css`
    :host {
      display: block;
      flex-shrink: 0;
      padding: 1rem;
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-editor-background);
    }

    .header-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.5rem;
    }

    .package-icon {
      font-size: 20px;
      flex-shrink: 0;
      width: 20px;
      height: 20px;
    }

    .package-icon[src] {
      object-fit: contain;
    }

    .package-name {
      flex: 1;
      font-size: 16px;
      font-weight: 600;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .verified-badge {
      color: var(--vscode-charts-green);
      font-size: 14px;
      title: 'Verified Publisher';
    }

    .close-button {
      flex-shrink: 0;
      background: none;
      border: none;
      color: var(--vscode-foreground);
      font-size: 18px;
      cursor: pointer;
      padding: 0.25rem;
      border-radius: 3px;
      line-height: 1;
    }

    .close-button:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }

    .close-button:focus {
      outline: 2px solid var(--vscode-focusBorder);
      outline-offset: 2px;
    }

    .controls-row {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      flex-wrap: wrap;
    }

    .source-badge {
      flex-shrink: 0;
      padding: 3px 8px;
      font-size: 11px;
      font-family: var(--vscode-font-family);
      color: var(--vscode-badge-foreground);
      background-color: var(--vscode-badge-background);
      border-radius: 3px;
      white-space: nowrap;
    }
  `;

  private handleClose(): void {
    this.dispatchEvent(
      new CustomEvent('close', {
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    return html`
      <div class="header-row">
        ${this.iconUrl
          ? html`<img class="package-icon" src="${this.iconUrl}" alt="${this.title} icon" />`
          : html`<span class="package-icon">📦</span>`}
        <h2 id="panel-title" class="package-name" title="${this.title}">${this.title}</h2>
        ${this.verified ? html`<span class="verified-badge" title="Verified Publisher">✓</span>` : ''}
        <button class="close-button" @click=${this.handleClose} aria-label="Close panel" title="Close (Esc)">✕</button>
      </div>

      <div class="controls-row">
        <slot name="controls"></slot>
        ${this.sourceName ? html`<span class="source-badge" title="Package source">${this.sourceName}</span>` : ''}
      </div>
    `;
  }
}
