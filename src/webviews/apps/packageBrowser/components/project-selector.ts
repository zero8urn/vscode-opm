/**
 * Project selector accordion component for package installation
 */

import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { ProjectInfo, InstallProgress, InstallResult } from '../types';
import { SelectionState } from '../state/selection-state';
import './install-button';
import './project-list-item';

export const PROJECT_SELECTOR_TAG = 'project-selector' as const;

@customElement(PROJECT_SELECTOR_TAG)
export class ProjectSelector extends LitElement {
  @property({ type: Array }) projects: ProjectInfo[] = [];
  @property({ type: String }) selectedVersion: string | undefined = undefined;
  @property({ type: String }) packageId: string | undefined = undefined;

  @state() private expanded: boolean = false;
  @state() private installProgress: InstallProgress | null = null;
  @state() private installResults: InstallResult[] = [];

  private selectionState: SelectionState = new SelectionState();

  static override styles = css`
    :host {
      display: block;
      margin: 16px 0;
    }

    .accordion {
      border: 1px solid var(--vscode-widget-border, transparent);
      border-radius: 4px;
    }

    .accordion-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
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
      padding: 16px;
      background-color: var(--vscode-editor-background);
      border-top: 1px solid var(--vscode-widget-border, transparent);
    }

    .accordion-content.expanded {
      display: block;
    }

    .select-all {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 0;
      margin-bottom: 12px;
      border-bottom: 1px solid var(--vscode-widget-border, transparent);
    }

    .select-all input[type='checkbox'] {
      cursor: pointer;
      width: 16px;
      height: 16px;
      accent-color: var(--vscode-inputOption-activeBackground, var(--vscode-checkbox-background, #007acc));
    }

    .select-all label {
      cursor: pointer;
      color: var(--vscode-foreground);
      font-size: 13px;
    }

    .project-list {
      margin-bottom: 16px;
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
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    this.selectionState.setProjects(this.projects);
    this.expanded = this.shouldAutoExpand;
    this.autoSelectInstalledProjects();
  }

  override updated(changedProperties: Map<string, unknown>): void {
    if (changedProperties.has('projects')) {
      this.selectionState.setProjects(this.projects);
      this.autoSelectInstalledProjects();
    }
  }

  /**
   * Auto-select projects that have the package installed at the selected version.
   * Per UI design: when all projects are installed, they should be auto-checked for uninstall.
   */
  private autoSelectInstalledProjects(): void {
    // Only auto-select if all projects have the package installed
    const allInstalled = this.projects.length > 0 && this.projects.every(p => p.installedVersion !== undefined);

    if (allInstalled) {
      // Auto-select all installed projects
      this.projects.forEach(p => {
        if (!this.selectionState.isSelected(p.path)) {
          this.selectionState.toggleProject(p.path);
        }
      });
      this.requestUpdate();
    }
  }

  private get shouldAutoExpand(): boolean {
    return this.projects.some(p => p.installedVersion !== undefined);
  }

  private get installedCount(): number {
    return this.projects.filter(p => p.installedVersion !== undefined).length;
  }

  private get availableCount(): number {
    return this.projects.filter(p => p.installedVersion === undefined).length;
  }

  private get selectedProjects(): string[] {
    return this.selectionState.getSelectedPaths();
  }

  private get allSelectedInstalled(): boolean {
    const selected = this.selectedProjects;
    if (selected.length === 0) return false;
    return selected.every(projectPath => {
      const project = this.projects.find(p => p.path === projectPath);
      return project?.installedVersion !== undefined;
    });
  }

  private get buttonAction(): 'install' | 'uninstall' | 'none' {
    const selected = this.selectedProjects;
    if (selected.length === 0) return 'none';
    if (this.allSelectedInstalled) return 'uninstall';
    return 'install';
  }

  private get buttonLabel(): string {
    const count = this.selectedProjects.length;
    const projectWord = count === 1 ? 'project' : 'projects';

    switch (this.buttonAction) {
      case 'install':
        return count > 0 ? `Install to ${count} ${projectWord}` : 'Install';
      case 'uninstall':
        return `Uninstall from ${count} ${projectWord}`;
      case 'none':
        return 'Select projects';
    }
  }

  private get selectAllState(): 'unchecked' | 'indeterminate' | 'checked' {
    return this.selectionState.getSelectAllState();
  }

  private toggleAccordion(): void {
    this.expanded = !this.expanded;
  }

  private handleSelectAllChange(): void {
    this.selectionState.toggleSelectAll();
    this.requestUpdate();
    this.emitSelectionChanged();
  }

  private handleProjectToggle(e: CustomEvent): void {
    const { projectPath } = e.detail;
    this.selectionState.toggleProject(projectPath);
    this.requestUpdate();
    this.emitSelectionChanged();
  }

  private emitSelectionChanged(): void {
    this.dispatchEvent(
      new CustomEvent('project-selection-changed', {
        detail: { selectedProjects: this.selectionState.getSelectedPaths() },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private async handleInstallClick(): Promise<void> {
    if (!this.packageId || !this.selectedVersion) {
      return;
    }

    const selectedPaths = this.selectionState.getSelectedPaths();
    if (selectedPaths.length === 0) {
      return;
    }

    this.installProgress = {
      currentProject: '',
      completed: 0,
      total: selectedPaths.length,
      status: 'installing',
    };

    this.dispatchEvent(
      new CustomEvent('install-package', {
        detail: {
          packageId: this.packageId,
          version: this.selectedVersion,
          projectPaths: selectedPaths,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private async handleUninstallClick(): Promise<void> {
    if (!this.packageId) {
      return;
    }

    const selectedPaths = this.selectionState.getSelectedPaths();
    if (selectedPaths.length === 0) {
      return;
    }

    this.installProgress = {
      currentProject: '',
      completed: 0,
      total: selectedPaths.length,
      status: 'installing', // Reuse the same progress state for uninstall
    };

    this.dispatchEvent(
      new CustomEvent('uninstall-package', {
        detail: {
          packageId: this.packageId,
          projectPaths: selectedPaths,
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
    this.installResults = results;
    this.installProgress = null;

    // Clear selections - parent component will refresh project list with updated installedVersion data
    this.selectionState.clearSelections();

    // Trigger re-render to show results
    this.requestUpdate();

    // NOTE: Project list refresh with updated installedVersion must be triggered by parent
    // (PackageDetailsPanel.handleInstallResponse/handleUninstallResponse calls fetchProjects)
    // This ensures UI shows correct installed state after operation completes
  }

  private renderProgress() {
    if (!this.installProgress) {
      return '';
    }

    const percentage = (this.installProgress.completed / this.installProgress.total) * 100;

    return html`
      <div class="progress-container">
        <div class="progress-text">
          Installing to ${this.installProgress.currentProject}
          (${this.installProgress.completed}/${this.installProgress.total})
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${percentage}%"></div>
        </div>
      </div>
    `;
  }

  private renderResults() {
    if (this.installResults.length === 0) {
      return '';
    }

    return html`
      <div class="results-container">
        ${this.installResults.map(
          result => html`
            <div class="result-item">
              <span class="result-icon ${result.success ? 'success' : 'error'}"> ${result.success ? '✓' : '✗'} </span>
              <span>${result.projectPath}: ${result.success ? 'Success' : result.error?.message}</span>
            </div>
          `,
        )}
      </div>
    `;
  }

  override render() {
    const selectAllState = this.selectAllState;
    const isInstalling = this.installProgress !== null;

    return html`
      <div class="accordion">
        <div class="accordion-header" @click=${this.toggleAccordion}>
          <div class="header-left">
            <span class="expand-icon ${this.expanded ? 'expanded' : ''}">▶</span>
            <span class="header-title">Install to Projects</span>
          </div>
          ${this.installedCount > 0
            ? html`<span class="installed-badge">✓ Installed (${this.installedCount})</span>`
            : ''}
        </div>

        <div class="accordion-content ${this.expanded ? 'expanded' : ''}">
          ${this.projects.length === 0
            ? html`<div class="empty-state">No projects found in workspace</div>`
            : html`
                ${this.renderProgress()}
                <div class="select-all">
                  <input
                    type="checkbox"
                    .checked=${selectAllState === 'checked'}
                    .indeterminate=${selectAllState === 'indeterminate'}
                    @change=${this.handleSelectAllChange}
                    ?disabled=${isInstalling}
                    id="select-all"
                  />
                  <label for="select-all">
                    Select All (${this.projects.length} ${this.projects.length === 1 ? 'project' : 'projects'})
                  </label>
                </div>

                <div class="project-list">
                  ${this.projects.map(
                    project => html`
                      <project-list-item
                        .project=${project}
                        .selected=${this.selectionState.isSelected(project.path)}
                        .selectedVersion=${this.selectedVersion}
                        @project-toggle=${this.handleProjectToggle}
                      ></project-list-item>
                    `,
                  )}
                </div>

                ${this.renderResults()}

                <install-button
                  .selectedCount=${this.selectionState.getSelectedCount()}
                  .installing=${isInstalling}
                  .action=${this.buttonAction}
                  .label=${this.buttonLabel}
                  @install-clicked=${this.handleInstallClick}
                  @uninstall-clicked=${this.handleUninstallClick}
                ></install-button>
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
