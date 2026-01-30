import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

/** Custom element tag name for prerelease toggle component */
export const PRERELEASE_TOGGLE_TAG = 'prerelease-toggle' as const;

/**
 * Checkbox toggle for including/excluding prerelease packages in search results.
 *
 * Emits a 'change' event with `detail.checked` when toggled.
 *
 * @fires change - Dispatched when checkbox state changes
 */
@customElement(PRERELEASE_TOGGLE_TAG)
export class PrereleaseToggle extends LitElement {
  /** Checked state of the toggle */
  @property({ type: Boolean })
  checked = false;

  /** Disabled state (e.g., during loading) */
  @property({ type: Boolean })
  disabled = false;

  static override styles = css`
    :host {
      display: block;
      margin: 0;
    }

    .toggle-container {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .checkbox-input {
      cursor: pointer;
      accent-color: var(--vscode-checkbox-background);
      border: 1px solid var(--vscode-checkbox-border);
      width: 16px;
      height: 16px;
    }

    .checkbox-input:focus {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 2px;
    }

    .checkbox-input:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .checkbox-label {
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      cursor: pointer;
      user-select: none;
    }

    .checkbox-label.disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `;

  override render() {
    return html`
      <div class="toggle-container">
        <input
          type="checkbox"
          id="prerelease-checkbox"
          class="checkbox-input"
          .checked=${this.checked}
          .disabled=${this.disabled}
          @change=${this.handleChange}
          aria-label="Include prerelease packages"
        />
        <label for="prerelease-checkbox" class="checkbox-label ${this.disabled ? 'disabled' : ''}">
          Include prerelease
        </label>
      </div>
    `;
  }

  private handleChange(e: Event): void {
    const target = e.target as HTMLInputElement;
    this.checked = target.checked;

    this.dispatchEvent(
      new CustomEvent('change', {
        detail: { checked: this.checked },
        bubbles: true,
        composed: true,
      }),
    );
  }
}
