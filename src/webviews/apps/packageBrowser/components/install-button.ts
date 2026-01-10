/**
 * Install button component with dynamic label based on selection count
 */

import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

export const INSTALL_BUTTON_TAG = 'install-button' as const;

@customElement(INSTALL_BUTTON_TAG)
export class InstallButton extends LitElement {
  @property({ type: Number }) selectedCount: number = 0;
  @property({ type: Boolean }) disabled: boolean = false;
  @property({ type: Boolean }) installing: boolean = false;

  static override styles = css`
    :host {
      display: block;
    }

    button {
      width: 100%;
      padding: 8px 16px;
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 2px;
      cursor: pointer;
      font-size: 13px;
      font-family: var(--vscode-font-family);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    button:hover:not(:disabled) {
      background-color: var(--vscode-button-hoverBackground);
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .spinner {
      width: 14px;
      height: 14px;
      border: 2px solid var(--vscode-button-foreground);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  `;

  private get buttonLabel(): string {
    if (this.installing) {
      return 'Installing...';
    }
    if (this.selectedCount === 0) {
      return 'Install';
    }
    if (this.selectedCount === 1) {
      return 'Install to 1 project';
    }
    return `Install to ${this.selectedCount} projects`;
  }

  private get isDisabled(): boolean {
    return this.disabled || this.installing || this.selectedCount === 0;
  }

  private handleClick(): void {
    if (!this.isDisabled) {
      this.dispatchEvent(
        new CustomEvent('install-clicked', {
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  override render() {
    return html`
      <button @click=${this.handleClick} ?disabled=${this.isDisabled} aria-label=${this.buttonLabel}>
        ${this.installing ? html`<span class="spinner"></span>` : ''} ${this.buttonLabel}
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    [INSTALL_BUTTON_TAG]: InstallButton;
  }
}
