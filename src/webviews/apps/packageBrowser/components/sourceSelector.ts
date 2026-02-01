import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

export const SOURCE_SELECTOR_TAG = 'source-selector' as const;

export interface PackageSourceOption {
  id: string;
  name: string;
  enabled: boolean;
  provider: string;
}

/**
 * Source selector dropdown for package browser.
 * Allows users to select a package source (All feeds or specific source).
 */
@customElement(SOURCE_SELECTOR_TAG)
export class SourceSelector extends LitElement {
  @property({ type: Array })
  sources: PackageSourceOption[] = [];

  @property({ type: String })
  selectedSourceId = 'all';

  @property({ type: Boolean })
  disabled = false;

  static override styles = css`
    :host {
      display: inline-block;
    }

    .source-selector-wrapper {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    label {
      font-size: 13px;
      color: var(--vscode-foreground);
      white-space: nowrap;
    }

    select {
      padding: 4px 8px;
      background: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border);
      border-radius: 3px;
      font-size: 13px;
      font-family: var(--vscode-font-family);
      cursor: pointer;
      min-width: 150px;
    }

    select:hover:not(:disabled) {
      background: var(--vscode-dropdown-listBackground);
    }

    select:focus {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: -1px;
    }

    select:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    option {
      background: var(--vscode-dropdown-listBackground);
      color: var(--vscode-dropdown-foreground);
    }
  `;

  private handleChange(e: Event): void {
    const select = e.target as HTMLSelectElement;
    const newSourceId = select.value;

    this.dispatchEvent(
      new CustomEvent('source-changed', {
        detail: { sourceId: newSourceId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    const enabledSources = this.sources.filter(s => s.enabled);

    return html`
      <div class="source-selector-wrapper">
        <label for="source-select">Package source:</label>
        <select
          id="source-select"
          .value=${this.selectedSourceId}
          @change=${this.handleChange}
          ?disabled=${this.disabled}
          aria-label="Select package source"
        >
          <option value="all">All feeds</option>
          ${enabledSources.map(
            source => html`
              <option value=${source.id} ?selected=${source.id === this.selectedSourceId}>${source.name}</option>
            `,
          )}
        </select>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    [SOURCE_SELECTOR_TAG]: SourceSelector;
  }
}
