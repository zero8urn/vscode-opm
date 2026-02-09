/**
 * SearchInput Component
 *
 * Focused text input for package search with clear button.
 * Emits input-change events for parent components.
 */

import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

/** Custom element tag name for search input component */
export const SEARCH_INPUT_TAG = 'search-input' as const;

/**
 * Search input component with clear button.
 *
 * **Events:**
 * - `input-change`: Fired when input value changes
 *   - detail: { value: string }
 *
 * **Usage:**
 * ```html
 * <search-input
 *   .value=${query}
 *   .placeholder=${"Search packages..."}
 *   @input-change=${handleChange}
 * ></search-input>
 * ```
 */
@customElement(SEARCH_INPUT_TAG)
export class SearchInput extends LitElement {
  @property({ type: String })
  value = '';

  @property({ type: Boolean })
  disabled = false;

  @property({ type: String })
  placeholder = 'Search packages...';

  static override styles = css`
    :host {
      display: block;
      position: relative;
    }

    .input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }

    input {
      width: 100%;
      padding: 6px 32px 6px 10px;
      font-size: 14px;
      font-family: var(--vscode-font-family);
      color: var(--vscode-input-foreground);
      background-color: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 2px;
      outline: none;
      box-sizing: border-box;
    }

    input:focus {
      border-color: var(--vscode-focusBorder);
    }

    input::placeholder {
      color: var(--vscode-input-placeholderForeground);
    }

    input:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .clear-button {
      position: absolute;
      right: 4px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      color: var(--vscode-input-foreground);
      font-size: 18px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 3px;
      line-height: 1;
      opacity: 0.7;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .clear-button:hover {
      opacity: 1;
      background: var(--vscode-toolbar-hoverBackground);
    }

    .clear-button:active {
      opacity: 0.8;
    }
  `;

  private handleInput(e: Event): void {
    const value = (e.target as HTMLInputElement).value;
    this.dispatchEvent(
      new CustomEvent('input-change', {
        detail: { value },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleClear(): void {
    this.dispatchEvent(
      new CustomEvent('input-change', {
        detail: { value: '' },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    return html`
      <div class="input-wrapper">
        <input
          type="text"
          .value=${this.value}
          ?disabled=${this.disabled}
          placeholder=${this.placeholder}
          @input=${this.handleInput}
          aria-label="Search packages"
        />
        ${this.value
          ? html`
              <button
                class="clear-button"
                @click=${this.handleClear}
                ?disabled=${this.disabled}
                aria-label="Clear search"
                title="Clear search"
              >
                ×
              </button>
            `
          : ''}
      </div>
    `;
  }
}
