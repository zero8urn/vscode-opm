/**
 * Project selector accordion component for package installation
 */

import { LitElement, html, css, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { ProjectInfo, InstallProgress, InstallResult } from '../types';
import { getVersionIndicator } from '../utils/version-compare';
import './project-list-item';
import { installIcon, trashIcon, loadingIcon } from './icons';

export const PROJECT_SELECTOR_TAG = 'project-selector' as const;

@customElement(PROJECT_SELECTOR_TAG)
export class ProjectSelector extends LitElement {
  @property({ type: Array }) projects: ProjectInfo[] = [];
  @property({ type: String }) selectedVersion: string | undefined = undefined;
  @property({ type: String }) packageId: string | undefined = undefined;

  @state() private expanded: boolean = false;
  @state() private installProgress: InstallProgress | null = null;
  @state() private installResults: InstallResult[] = [];
  @state() private globalActionLoading: 'install' | 'uninstall' | null = null;
  @state() private currentProjectAction: { projectPath: string; action: 'install' | 'uninstall' } | null = null;

  static override styles = css`
    :host {
      display: block;
    }

    .accordion {
      border: 1px solid var(--vscode-widget-border, transparent);
      border-radius: 4px;
    }

    .accordion-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.1rem 0.5rem;
      background-color: var(--vscode-editor-background);
      cursor: pointer;
      user-select: none;
    }

    .accordion-header:hover {
      background-color: var(--vscode-list-hoverBackground);
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .expand-icon {
      transition: transform 0.2s;
      color: var(--vscode-foreground);
    }

    .expand-icon.expanded {
      transform: rotate(90deg);
    }

    .header-title {
      font-weight: 500;
      color: var(--vscode-foreground);
    }

    .installed-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      background-color: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 2px;
      font-size: 11px;
    }

    .accordion-content {
      display: none;
      padding: 12px;
      background-color: var(--vscode-editor-background);
      border-top: 1px solid var(--vscode-widget-border, transparent);
    }

    .accordion-content.expanded {
      display: block;
    }

    .global-actions {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--vscode-widget-border, transparent);
    }

    .global-action-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border: 1px solid var(--vscode-button-border, transparent);
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      cursor: pointer;
      border-radius: 2px;
      font-size: 13px;
      white-space: nowrap;
    }

    .global-action-btn:hover {
      background-color: var(--vscode-button-hoverBackground);
    }

    .global-action-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .uninstall-all-btn {
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .uninstall-all-btn:hover {
      background-color: var(--vscode-button-secondaryHoverBackground);
    }

    .icon {
      display: inline-flex;
      align-items: center;
      width: 16px;
      height: 16px;
      color: inherit;
    }

    .project-list {
      margin-bottom: 12px;
    }

    .empty-state {
      text-align: center;
      padding: 24px;
      color: var(--vscode-descriptionForeground);
      font-size: 13px;
    }

    .progress-container {
      padding: 12px;
      margin-bottom: 16px;
      background-color: var(--vscode-inputValidation-infoBackground);
      border: 1px solid var(--vscode-inputValidation-infoBorder);
      border-radius: 4px;
    }

    .progress-text {
      font-size: 13px;
      color: var(--vscode-foreground);
      margin-bottom: 8px;
    }

    .progress-bar {
      width: 100%;
      height: 4px;
      background-color: var(--vscode-progressBar-background);
      border-radius: 2px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background-color: var(--vscode-progressBar-background);
      transition: width 0.3s ease;
    }

    .results-container {
      margin-top: 16px;
      padding: 12px;
      background-color: var(--vscode-inputValidation-warningBackground);
      border: 1px solid var(--vscode-inputValidation-warningBorder);
      border-radius: 4px;
    }

    .result-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      padding: 4px 0;
    }

    .result-icon.success {
      color: var(--vscode-charts-green);
    }

    .result-icon.error {
      color: var(--vscode-errorForeground);
    }

    /* Loading icon animation for SVGs (use transform-box for SVG rotation center) */
    .icon svg.loading-icon,
    .icon svg.loading-svg {
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
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    this.expanded = this.shouldAutoExpand;
  }

  private get shouldAutoExpand(): boolean {
    return this.projects.some(p => p.installedVersion !== undefined);
  }

  // installed count getter removed — header badge no longer shown

  private get availableCount(): number {
    return this.projects.filter(p => p.installedVersion === undefined).length;
  }

  private toggleAccordion(): void {
    this.expanded = !this.expanded;
  }

  private handleInstallAll(): void {
    // Install targets are projects that either don't have the package installed
    // or have a different installed version than the selected version.
    if (!this.packageId || !this.selectedVersion) return;

    const installTargets = this.projects.filter(p => p.installedVersion !== this.selectedVersion).map(p => p.path);

    if (installTargets.length === 0) return;

    this.installProgress = {
      currentProject: '',
      completed: 0,
      total: installTargets.length,
      status: 'installing',
    };
    this.globalActionLoading = 'install';

    this.dispatchEvent(
      new CustomEvent('install-package', {
        detail: {
          packageId: this.packageId,
          version: this.selectedVersion,
          projectPaths: installTargets,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleUninstallAll(): void {
    const installedProjects = this.projects.filter(p => p.installedVersion).map(p => p.path);

    if (installedProjects.length === 0 || !this.packageId) return;

    this.installProgress = {
      currentProject: '',
      completed: 0,
      total: installedProjects.length,
      status: 'installing',
    };
    this.globalActionLoading = 'uninstall';

    this.dispatchEvent(
      new CustomEvent('uninstall-package', {
        detail: {
          packageId: this.packageId,
          projectPaths: installedProjects,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleInstallProject(e: CustomEvent): void {
    const { projectPath } = e.detail;
    if (!this.packageId || !this.selectedVersion) return;

    this.installProgress = {
      currentProject: projectPath,
      completed: 0,
      total: 1,
      status: 'installing',
    };
    this.currentProjectAction = { projectPath, action: 'install' };

    this.dispatchEvent(
      new CustomEvent('install-package', {
        detail: {
          packageId: this.packageId,
          version: this.selectedVersion,
          projectPaths: [projectPath],
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleUninstallProject(e: CustomEvent): void {
    const { projectPath } = e.detail;
    if (!this.packageId) return;

    this.installProgress = {
      currentProject: projectPath,
      completed: 0,
      total: 1,
      status: 'installing',
    };
    this.currentProjectAction = { projectPath, action: 'uninstall' };

    this.dispatchEvent(
      new CustomEvent('uninstall-package', {
        detail: {
          packageId: this.packageId,
          projectPaths: [projectPath],
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * Update installation progress (called from parent via IPC notifications)
   */
  updateProgress(progress: InstallProgress): void {
    this.installProgress = progress;
  }

  /**
   * Set installation results (called from parent when installation completes)
   */
  setResults(results: InstallResult[]): void {
    // Apply optimistic updates to local projects model based on the operation results.
    // This provides immediate feedback (stop spinner, update version/installed state)
    // and will be reconciled by authoritative payloads from the host later.
    this.installResults = results;

    // Determine likely action: prefer explicit per-project action, then global action, otherwise assume install
    const action: 'install' | 'uninstall' =
      (this.currentProjectAction && this.currentProjectAction.action) ||
      (this.globalActionLoading as 'install' | 'uninstall') ||
      'install';

    // Patch in-memory project entries for successful operations so UI updates immediately.
    for (const res of results) {
      if (!res.success) continue;
      const idx = this.projects.findIndex(p => p.path === res.projectPath);
      if (idx === -1) continue;

      // For installs, set installedVersion to the currently selected version.
      // For uninstalls, clear the installedVersion.
      const existing = this.projects[idx]!;
      const patched: ProjectInfo = {
        ...existing,
        installedVersion: action === 'install' ? this.selectedVersion : undefined,
      };

      // Replace project in array to ensure Lit notices the change
      this.projects = this.projects.map((p, i) => (i === idx ? patched : p));
    }

    // Clear progress/loading markers and re-render
    this.installProgress = null;
    this.globalActionLoading = null;
    this.currentProjectAction = null;

    this.requestUpdate();

    // NOTE: This is an optimistic/local update. The extension host will later send
    // an authoritative `getProjects`/projects response which will overwrite `this.projects`
    // if there are any differences — that final reconciliation ensures correctness.
  }

  private renderGlobalActions(): TemplateResult {
    const availableCount = this.availableCount;
    const installedProjects = this.projects.filter(p => p.installedVersion !== undefined);
    const installedCount = installedProjects.length;
    const isInstalling = this.installProgress !== null;

    // Determine downgrade/all-installed state
    const allInstalledDowngrade =
      this.selectedVersion !== undefined && installedCount > 0
        ? installedProjects.every(p => getVersionIndicator(p.installedVersion, this.selectedVersion) === '↓')
        : false;

    // Show uninstall-all button always, but disable when no installed projects
    const showUninstallAll = true;

    const installTargets = this.selectedVersion
      ? this.projects.filter(p => p.installedVersion !== this.selectedVersion)
      : this.projects.filter(p => p.installedVersion === undefined);

    const installCount = installTargets.length;

    const installTooltip = !this.selectedVersion
      ? 'Select a version to install'
      : installCount === 0
      ? 'All projects already have this version'
      : `Install/Update All (${installCount})`;

    const uninstallTooltip = installedCount === 0 ? 'No installed projects' : `Uninstall All (${installedCount})`;

    return html`
      <div class="global-actions">
        <button
          class="global-action-btn install-all-btn"
          @click=${this.handleInstallAll}
          ?disabled=${isInstalling || installCount === 0}
          title=${installTooltip}
          aria-label=${installTooltip}
        >
          <span class="icon">${this.globalActionLoading === 'install' ? loadingIcon : installIcon}</span>
        </button>

        ${showUninstallAll
          ? html`
              <button
                class="global-action-btn uninstall-all-btn"
                @click=${this.handleUninstallAll}
                ?disabled=${isInstalling || installedCount === 0}
                title=${allInstalledDowngrade ? `${uninstallTooltip} — all will be downgraded` : uninstallTooltip}
                aria-label=${allInstalledDowngrade ? `${uninstallTooltip} — all will be downgraded` : uninstallTooltip}
              >
                <span class="icon">${this.globalActionLoading === 'uninstall' ? loadingIcon : trashIcon}</span>
              </button>
            `
          : ''}
      </div>
    `;
  }

  private renderProgress() {
    // Progress container removed - loading is represented on the action button
    return '';
  }

  private renderResults() {
    // Only show errors for now; hide success-only notifications
    const errors = this.installResults.filter(r => !r.success);
    if (errors.length === 0) return '';

    return html`
      <div class="results-container">
        ${errors.map(
          result => html`
            <div class="result-item">
              <span class="result-icon error"> ✗ </span>
              <span>${result.projectPath}: ${result.error?.message || 'Unknown error'}</span>
            </div>
          `,
        )}
      </div>
    `;
  }

  override render() {
    const isInstalling = this.installProgress !== null;

    return html`
      <div class="accordion">
        <div class="accordion-header" @click=${this.toggleAccordion}>
          <div class="header-left">
            <span class="expand-icon ${this.expanded ? 'expanded' : ''}">▶</span>
            <span class="header-title">Install to Projects</span>
          </div>
        </div>

        <div class="accordion-content ${this.expanded ? 'expanded' : ''}">
          ${this.projects.length === 0
            ? html`<div class="empty-state">No projects found in workspace</div>`
            : html`
                ${this.renderGlobalActions()}

                <div class="project-list">
                  ${this.projects.map(
                    project => html`
                      <project-list-item
                        .project=${project}
                        .selectedVersion=${this.selectedVersion}
                        .loadingAction=${this.currentProjectAction &&
                        this.currentProjectAction.projectPath === project.path
                          ? this.currentProjectAction.action
                          : null}
                        .globalDisabled=${isInstalling || this.globalActionLoading !== null}
                        @install-project=${this.handleInstallProject}
                        @uninstall-project=${this.handleUninstallProject}
                      ></project-list-item>
                    `,
                  )}
                </div>

                ${this.renderResults()}
              `}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    [PROJECT_SELECTOR_TAG]: ProjectSelector;
  }
}
