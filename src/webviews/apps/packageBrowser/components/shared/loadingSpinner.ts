import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';

/**
 * Loading spinner component for async operations.
 * Uses VS Code theme variables for consistent styling.
 */
@customElement('loading-spinner')
export class LoadingSpinner extends LitElement {
  static override styles = css`
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .spinner {
      width: 24px;
      height: 24px;
      border: 3px solid var(--vscode-progressBar-background, rgba(128, 128, 128, 0.2));
      border-top-color: var(--vscode-progressBar-foreground, #0078d4);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  `;

  override render() {
    return html`<div class="spinner" role="progressbar" aria-label="Loading"></div>`;
  }
}
