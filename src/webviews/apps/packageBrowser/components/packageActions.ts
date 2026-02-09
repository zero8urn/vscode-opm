/**
 * PackageActions Component
 *
 * Install and uninstall buttons for package operations.
 */

import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

/** Custom element tag name for package actions component */
export const PACKAGE_ACTIONS_TAG = 'package-actions' as const;

/**
 * Package install/uninstall action buttons.
 *
 * **Events:**
 * - `install-request`: Fired when install button is clicked
 *   - detail: { packageId: string, version: string, projectPaths: string[] }
 * - `uninstall-request`: Fired when uninstall button is clicked
 *   - detail: { packageId: string, projectPaths: string[] }
 *
 * **Usage:**
 * ```html
 * <package-actions
 *   .packageId=${"Newtonsoft.Json"}
 *   .version=${"13.0.1"}
 *   .selectedProjects=${["project1.csproj"]}
 *   .installing=${false}
 *   .uninstalling=${false}
 *   @install-request=${handleInstall}
 *   @uninstall-request=${handleUninstall}
 * ></package-actions>
 * ```
 */
@customElement(PACKAGE_ACTIONS_TAG)
export class PackageActions extends LitElement {
  @property({ type: String })
  packageId = '';

  @property({ type: String })
  version = '';

  @property({ type: Array })
  selectedProjects: string[] = [];

  @property({ type: Boolean })
  installing = false;

  @property({ type: Boolean })
  uninstalling = false;

  static override styles = css`
    :host {
      display: block;
      padding: 1rem;
      border-top: 1px solid var(--vscode-panel-border);
      background: var(--vscode-editor-background);
    }

    .actions {
      display: flex;
      gap: 0.5rem;
    }

    button {
      flex: 1;
      padding: 8px 16px;
      font-size: 13px;
      font-family: var(--vscode-font-family);
      font-weight: 500;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      transition: opacity 0.1s ease;
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .install-button {
      color: var(--vscode-button-foreground);
      background-color: var(--vscode-button-background);
    }

    .install-button:hover:not(:disabled) {
      background-color: var(--vscode-button-hoverBackground);
    }

    .install-button:active:not(:disabled) {
      opacity: 0.8;
    }

    .uninstall-button {
      color: var(--vscode-button-secondaryForeground);
      background-color: var(--vscode-button-secondaryBackground);
    }

    .uninstall-button:hover:not(:disabled) {
      background-color: var(--vscode-button-secondaryHoverBackground);
    }

    .uninstall-button:active:not(:disabled) {
      opacity: 0.8;
    }
  `;

  private handleInstall(): void {
    if (this.selectedProjects.length === 0 || this.installing) {
      return;
    }

    this.dispatchEvent(
      new CustomEvent('install-request', {
        detail: {
          packageId: this.packageId,
          version: this.version,
          projectPaths: this.selectedProjects,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleUninstall(): void {
    if (this.selectedProjects.length === 0 || this.uninstalling) {
      return;
    }

    this.dispatchEvent(
      new CustomEvent('uninstall-request', {
        detail: {
          packageId: this.packageId,
          projectPaths: this.selectedProjects,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    const hasSelection = this.selectedProjects.length > 0;
    const installLabel = this.installing ? 'Installing...' : `Install ${this.version}`;
    const uninstallLabel = this.uninstalling ? 'Uninstalling...' : 'Uninstall';

    return html`
      <div class="actions">
        <button
          class="install-button"
          @click=${this.handleInstall}
          ?disabled=${!hasSelection || this.installing}
          title=${hasSelection ? '' : 'Select projects to install'}
        >
          ${installLabel}
        </button>
        <button
          class="uninstall-button"
          @click=${this.handleUninstall}
          ?disabled=${!hasSelection || this.uninstalling}
          title=${hasSelection ? '' : 'Select projects to uninstall'}
        >
          ${uninstallLabel}
        </button>
      </div>
    `;
  }
}
