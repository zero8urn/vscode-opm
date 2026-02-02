/**
 * Project list item component - individual project row with action buttons
 */

import { LitElement, html, css, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { ProjectInfo } from '../types';
import { getVersionIndicator } from '../utils/version-compare';
import { installIcon, trashIcon, loadingIcon } from './icons';

export const PROJECT_LIST_ITEM_TAG = 'project-list-item' as const;

@customElement(PROJECT_LIST_ITEM_TAG)
export class ProjectListItem extends LitElement {
  @property({ type: Object }) project!: ProjectInfo;
  @property({ type: String }) selectedVersion: string | undefined = undefined;
  @property({ type: String }) loadingAction: 'install' | 'uninstall' | null = null;
  @property({ type: Boolean }) globalDisabled: boolean = false;

  static override styles = css`
    :host {
      display: block;
    }

    .project-row {
      display: flex;
      align-items: flex-start;
      padding: 8px 0;
      gap: 12px;
      border-bottom: 1px solid var(--vscode-widget-border, transparent);
    }

    .project-row:last-child {
      border-bottom: none;
    }

    .project-info {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .project-details {
      flex: 1;
      min-width: 0;
      overflow: hidden; /* Enable overflow handling */
    }

    .action-container {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      justify-content: flex-end;
      min-width: 200px; /* Reserve space for version + buttons */
    }

    .project-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }

    .project-name {
      font-weight: 500;
      color: var(--vscode-foreground);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .frameworks {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .installed-version {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-right: auto; /* Push buttons to the right */
      white-space: nowrap;
      flex-shrink: 0;
    }

    .action-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      border: 1px solid var(--vscode-button-border, transparent);
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      cursor: pointer;
      border-radius: 2px;
      font-size: 12px;
      white-space: nowrap;
    }

    .action-btn:hover {
      background-color: var(--vscode-button-hoverBackground);
    }

    .action-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .uninstall-btn {
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .uninstall-btn:hover {
      background-color: var(--vscode-button-secondaryHoverBackground);
    }

    .icon {
      display: inline-flex;
      align-items: center;
      width: 16px;
      height: 16px;
      color: inherit;
    }

    .loading-icon,
    .loading-svg {
      width: 16px;
      height: 16px;
      display: inline-block;
      animation: ps-spin 0.8s linear infinite;
      transform-origin: 50% 50%;
      transform-box: fill-box;
    }

    @keyframes ps-spin {
      to {
        transform: rotate(360deg);
      }
    }

    .upgrade-icon {
      color: var(--vscode-charts-green);
      font-weight: bold;
    }

    .downgrade-icon {
      color: var(--vscode-charts-orange);
      font-weight: bold;
    }
  `;

  private get isInstalled(): boolean {
    return this.project.installedVersion !== undefined;
  }

  private get isDifferentVersion(): boolean {
    if (!this.isInstalled || !this.selectedVersion) {
      return false;
    }
    return this.project.installedVersion !== this.selectedVersion;
  }

  private get canInstall(): boolean {
    if (!this.selectedVersion) return false;
    // can install if not installed or installed version differs
    return !this.isInstalled || this.isDifferentVersion;
  }

  private get canUninstall(): boolean {
    return this.isInstalled;
  }

  private get installTooltip(): string {
    if (!this.selectedVersion) return 'Select a version to install';
    if (!this.canInstall) return `Already installed v${this.selectedVersion}`;
    if (!this.isInstalled) return `Install v${this.selectedVersion}`;
    return `Install v${this.selectedVersion}`;
  }

  private get uninstallTooltip(): string {
    if (!this.isInstalled) return 'Package not installed in this project';
    return 'Uninstall';
  }

  private get versionIndicator(): '↑' | '↓' | '' {
    return getVersionIndicator(this.project.installedVersion, this.selectedVersion);
  }

  private get projectFileName(): string {
    // Prefer explicit `displayName` when available (set by parent), otherwise `name`,
    // otherwise derive from the file path handling both '/' and '\\' separators.
    if ((this.project as any).displayName) return (this.project as any).displayName;
    if (this.project.name) return this.project.name;
    const parts = this.project.path.split(/[/\\]/);
    return parts[parts.length - 1] || this.project.path;
  }

  private get actionButtonContent(): TemplateResult {
    const indicator = this.versionIndicator;

    if (!this.isInstalled) {
      return html`<span class="icon">+</span> Install`;
    }

    // Upgrade
    if (indicator === '↑') {
      return html`<span class="icon upgrade-icon">↑</span> Upgrade`;
    }

    // Downgrade
    if (indicator === '↓') {
      return html`<span class="icon downgrade-icon">↓</span> Downgrade`;
    }

    // Reinstall same version
    return html`<span class="icon">+</span> Install`;
  }

  private get actionButtonTooltip(): string {
    const indicator = this.versionIndicator;

    if (indicator === '↑') {
      return `Upgrade from v${this.project.installedVersion} to v${this.selectedVersion}`;
    }
    if (indicator === '↓') {
      return `Downgrade from v${this.project.installedVersion} to v${this.selectedVersion}`;
    }
    if (this.isInstalled) {
      return `Reinstall v${this.selectedVersion}`;
    }
    return `Install v${this.selectedVersion}`;
  }

  private handleInstallClick(): void {
    this.dispatchEvent(
      new CustomEvent('install-project', {
        detail: { projectPath: this.project.path },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleUninstallClick(): void {
    this.dispatchEvent(
      new CustomEvent('uninstall-project', {
        detail: { projectPath: this.project.path },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    const isInstalled = this.isInstalled;
    const isDifferentVersion = this.isDifferentVersion;

    return html`
      <div class="project-row">
        <div class="project-info">
          <div class="project-details">
            <div class="project-header">
              <span class="project-name" title="${this.projectFileName}">${this.projectFileName}</span>
              <span class="frameworks" title="${this.project.frameworks.join(', ')}">${this.project.frameworks.join(', ')}</span>
            </div>
          </div>

          <div class="action-container">
            ${isInstalled ? html`<span class="installed-version">v${this.project.installedVersion}</span>` : ''}
            <button
              class="action-btn install-btn"
              @click=${this.handleInstallClick}
              title=${this.installTooltip}
              aria-label=${this.installTooltip}
              ?disabled=${!this.canInstall || this.loadingAction !== null || this.globalDisabled}
            >
              <span class="icon">${this.loadingAction === 'install' ? loadingIcon : installIcon}</span>
            </button>

            <button
              class="action-btn uninstall-btn"
              @click=${this.handleUninstallClick}
              title=${this.uninstallTooltip}
              aria-label=${this.uninstallTooltip}
              ?disabled=${!this.canUninstall || this.loadingAction !== null || this.globalDisabled}
            >
              <span class="icon">${this.loadingAction === 'uninstall' ? loadingIcon : trashIcon}</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    [PROJECT_LIST_ITEM_TAG]: ProjectListItem;
  }
}
