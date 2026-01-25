import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { PackageDetailsData } from '../../../services/packageDetailsService';
import type { ProjectInfo } from '../types';
import './packageBadges';
import './accordionSection';
import './project-selector';
import './version-selector';

import { vscode } from '../vscode-api';

/** Custom element tag name for package details panel component */
export const PACKAGE_DETAILS_PANEL_TAG = 'package-details-panel' as const;

@customElement(PACKAGE_DETAILS_PANEL_TAG)
export class PackageDetailsPanel extends LitElement {
  @property({ type: Object })
  packageData: PackageDetailsData | null = null;

  @property({ type: Boolean, reflect: true })
  open = false;

  @property({ type: Boolean })
  includePrerelease = false;

  @state()
  private selectedVersion: string | null = null;

  @state()
  private infoExpanded = true;

  @state()
  private dependenciesExpanded = false;

  @state()
  private projects: ProjectInfo[] = [];

  @state()
  private projectsLoading = false;

  static override styles = css`
    :host {
      display: block;
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: 60%;
      min-width: 400px;
      max-width: 600px;
      z-index: 1000;
      transform: translateX(100%);
      transition: transform 200ms ease-out;
      box-shadow: -4px 0 12px rgba(0, 0, 0, 0.3);
    }

    :host([open]) {
      transform: translateX(0);
    }

    .backdrop {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.3);
      z-index: -1;
    }

    :host([open]) .backdrop {
      display: block;
    }

    .panel {
      position: relative;
      height: 100%;
      display: flex;
      flex-direction: column;
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground);
      z-index: 1;
    }

    .header {
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
    }

    .source-select {
      flex: 1;
      min-width: 120px;
      max-width: 155px;
      padding: 4px 8px;
      font-size: 13px;
      font-family: var(--vscode-font-family);
      color: var(--vscode-input-foreground);
      background-color: var(--vscode-dropdown-background);
      border: 1px solid var(--vscode-dropdown-border);
      border-radius: 2px;
      cursor: pointer;
    }

    .source-select:hover {
      background-color: var(--vscode-dropdown-listBackground);
    }

    .source-select:focus {
      outline: 2px solid var(--vscode-focusBorder);
      outline-offset: 2px;
    }

    .add-button {
      flex-shrink: 0;
      padding: 4px 12px;
      font-size: 13px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 2px;
      cursor: pointer;
    }

    .add-button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .add-button:focus {
      outline: 2px solid var(--vscode-focusBorder);
      outline-offset: 2px;
    }

    .content {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .warning-banner {
      padding: 0.75rem 1rem;
      margin: 0;
      border-bottom: 1px solid var(--vscode-panel-border);
      border-left: 4px solid;
    }

    .warning-banner.deprecation {
      background: var(--vscode-inputValidation-warningBackground);
      border-left-color: var(--vscode-inputValidation-warningBorder);
      color: var(--vscode-inputValidation-warningForeground);
    }

    .warning-banner.vulnerability {
      background: var(--vscode-inputValidation-errorBackground);
      border-left-color: var(--vscode-inputValidation-errorBorder);
      color: var(--vscode-inputValidation-errorForeground);
    }

    .warning-title {
      font-weight: 600;
      font-size: 13px;
      margin-bottom: 0.25rem;
    }

    .warning-content {
      font-size: 12px;
    }

    .details-list {
      list-style: none;
      padding: 0;
      margin: 0;
      font-size: 13px;
      line-height: 1.8;
    }

    .details-list li {
      margin-bottom: 0.5rem;
    }

    .detail-label {
      color: var(--vscode-descriptionForeground);
      margin-right: 0.5rem;
    }

    .detail-value {
      color: var(--vscode-foreground);
    }

    .detail-link {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
      cursor: pointer;
    }

    .detail-link:hover {
      text-decoration: underline;
    }
  `;

  override render() {
    if (!this.packageData) {
      return html``;
    }

    const pkg = this.packageData;
    const currentVersion = this.selectedVersion || pkg.version;

    return html`
      <div class="backdrop" @click=${this.handleBackdropClick}></div>
      <div class="panel" role="dialog" aria-labelledby="panel-title">
        ${this.renderHeader(pkg, currentVersion)} ${this.renderWarnings(pkg)} ${this.renderContent(pkg, currentVersion)}
      </div>
    `;
  }

  private renderHeader(pkg: PackageDetailsData, currentVersion: string) {
    return html`
      <div class="header">
        <div class="header-row">
          ${pkg.iconUrl
            ? html`<img class="package-icon" src="${pkg.iconUrl}" alt="${pkg.id} icon" />`
            : html`<span class="package-icon">📦</span>`}
          <h2 id="panel-title" class="package-name" title="${pkg.id}">${pkg.id}</h2>
          ${pkg.verified ? html`<span class="verified-badge" title="Verified Publisher">✓</span>` : ''}
          <button class="close-button" @click=${this.handleClose} aria-label="Close panel" title="Close (Esc)">
            ✕
          </button>
        </div>

        <div class="controls-row">
          <version-selector
            .packageId=${pkg.id}
            .selectedVersion=${currentVersion}
            .includePrerelease=${this.includePrerelease}
            .versions=${this.convertVersionsToMetadata(pkg.versions)}
            @version-changed=${this.handleVersionChange}
          ></version-selector>

          <select class="source-select" aria-label="Package source">
            <option selected>nuget.org</option>
          </select>

          <button class="add-button" @click=${this.handleAddPackage}>+</button>
        </div>
      </div>
    `;
  }

  private renderWarnings(pkg: PackageDetailsData) {
    return html`
      ${pkg.deprecated
        ? html`
            <div class="warning-banner deprecation">
              <div class="warning-title">⚠ This package is deprecated</div>
              <div class="warning-content">
                ${pkg.deprecationReasons?.join('. ')}
                ${pkg.alternativePackage ? html` Use ${pkg.alternativePackage} instead.` : ''}
              </div>
            </div>
          `
        : ''}
      ${pkg.vulnerabilities.length > 0
        ? html`
            <div class="warning-banner vulnerability">
              <div class="warning-title">🛡 Security vulnerabilities detected</div>
              <div class="warning-content">${pkg.vulnerabilities.length} known vulnerabilities</div>
            </div>
          `
        : ''}
    `;
  }

  private renderContent(pkg: PackageDetailsData, currentVersion: string) {
    return html`
      <div class="content">
        <accordion-section
          .title=${'Details'}
          .icon=${''}
          .expanded=${this.infoExpanded}
          @toggle=${(e: CustomEvent) => (this.infoExpanded = e.detail.expanded)}
        >
          ${this.renderInfoDetails(pkg)}
        </accordion-section>

        <accordion-section
          .title=${'Frameworks and Dependencies'}
          .icon=${''}
          .expanded=${this.dependenciesExpanded}
          @toggle=${(e: CustomEvent) => (this.dependenciesExpanded = e.detail.expanded)}
        >
          ${this.renderDependencies(pkg)}
        </accordion-section>

        <project-selector
          .projects=${this.projects}
          .selectedVersion=${currentVersion}
          .packageId=${pkg.id}
          @install-package=${this.handleInstallPackageFromSelector}
          @uninstall-package=${this.handleUninstallPackageFromSelector}
        ></project-selector>
      </div>
    `;
  }

  private renderInfoDetails(pkg: PackageDetailsData) {
    const publishDate = pkg.published ? new Date(pkg.published).toLocaleDateString() : 'Unknown';
    const downloads = pkg.totalDownloads?.toLocaleString() || '0';
    const nugetUrl = `https://www.nuget.org/packages/${pkg.id}`;
    const licenseName = pkg.licenseExpression || 'License';

    return html`
      ${pkg.description
        ? html`<p style="margin: 0 0 1rem 0; line-height: 1.5; white-space: pre-wrap;">${pkg.description}</p>`
        : ''}

      <ul class="details-list">
        <li>
          <span class="detail-label">Links:</span>
          <a href="${nugetUrl}" class="detail-link" target="_blank" rel="noopener" title="${nugetUrl}">NuGet</a>
          ${pkg.projectUrl
            ? html` ,
                <a href="${pkg.projectUrl}" class="detail-link" target="_blank" rel="noopener" title="${pkg.projectUrl}"
                  >Project Site</a
                >`
            : ''}
          ${pkg.licenseUrl
            ? html` ,
                <a href="${pkg.licenseUrl}" class="detail-link" target="_blank" rel="noopener" title="${pkg.licenseUrl}"
                  >${licenseName}</a
                >`
            : ''}
        </li>
        ${pkg.tags && pkg.tags.length > 0
          ? html`
              <li>
                <span class="detail-label">Tags:</span>
                ${pkg.tags.map((tag, index) => {
                  const searchUrl = `https://www.nuget.org/packages?q=Tags%3A%22${encodeURIComponent(tag)}%22`;
                  return html` ${index > 0 ? ', ' : ''}<a
                      href="${searchUrl}"
                      class="detail-link"
                      target="_blank"
                      rel="noopener"
                      title="${searchUrl}"
                      >${tag}</a
                    >`;
                })}
              </li>
            `
          : ''}
        ${pkg.authors
          ? html` <li><span class="detail-label">Author:</span> <span class="detail-value">${pkg.authors}</span></li>`
          : ''}
        <li><span class="detail-label">Published:</span> <span class="detail-value">${publishDate}</span></li>
        <li><span class="detail-label">Downloads:</span> <span class="detail-value">${downloads}</span></li>
      </ul>
    `;
  }

  private renderDependencies(pkg: PackageDetailsData) {
    if (!pkg.dependencies || pkg.dependencies.length === 0) {
      return html`<p style="color: var(--vscode-descriptionForeground); font-size: 13px;">
        No dependencies for this package.
      </p>`;
    }

    return html`
      <div>
        ${pkg.dependencies.map(
          group => html`
            <div style="margin-bottom: 1rem;">
              <div style="font-weight: 600; font-size: 13px; margin-bottom: 0.5rem; color: var(--vscode-foreground);">
                ${group.framework}
              </div>
              ${group.dependencies.length === 0
                ? html`<div style="font-size: 12px; color: var(--vscode-descriptionForeground); margin-left: 1rem;">
                    No dependencies
                  </div>`
                : html`
                    <ul style="list-style: none; padding-left: 1rem; margin: 0;">
                      ${group.dependencies.map(
                        dep => html`
                          <li style="font-size: 13px; margin-bottom: 0.25rem;">
                            <span style="font-family: var(--vscode-editor-font-family);">${dep.id}</span>
                            <span style="color: var(--vscode-descriptionForeground); margin-left: 0.5rem;">
                              ${dep.versionRange || '*'}
                            </span>
                          </li>
                        `,
                      )}
                    </ul>
                  `}
            </div>
          `,
        )}
      </div>
    `;
  }

  private handleClose(): void {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  private handleBackdropClick(e: Event): void {
    if (e.target === e.currentTarget) {
      this.handleClose();
    }
  }

  private handleVersionChange(e: CustomEvent): void {
    const version = e.detail.version;
    this.selectedVersion = version;
    this.dispatchEvent(
      new CustomEvent('version-selected', {
        detail: { version },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleAddPackage(): void {
    this.dispatchEvent(
      new CustomEvent('install-package', {
        detail: {
          packageId: this.packageData?.id,
          version: this.selectedVersion || this.packageData?.version,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private async fetchProjects(): Promise<void> {
    // Guard: Don't fetch without package context
    if (!this.packageData?.id) {
      this.projects = [];
      return;
    }

    this.projectsLoading = true;
    try {
      const requestId = Math.random().toString(36).substring(2, 15);

      // Send getProjects request with packageId
      vscode.postMessage({
        type: 'getProjects',
        payload: {
          requestId,
          packageId: this.packageData.id,
        },
      });

      // Wait for response
      const response = await new Promise<ProjectInfo[]>((resolve, reject) => {
        const timeout = setTimeout(() => {
          window.removeEventListener('message', handler);
          reject(new Error('Project fetch timeout'));
        }, 10000);

        const handler = (event: MessageEvent) => {
          const message = event.data;
          if (
            message?.type === 'notification' &&
            message?.name === 'getProjectsResponse' &&
            message?.args?.requestId === requestId
          ) {
            clearTimeout(timeout);
            window.removeEventListener('message', handler);

            if (message.args.error) {
              reject(new Error(message.args.error.message));
            } else {
              resolve(message.args.projects || []);
            }
          }
        };

        window.addEventListener('message', handler);
      });

      this.projects = response;
      console.log('Projects fetched with installed status:', {
        total: response.length,
        installed: response.filter(p => p.installedVersion).length,
      });
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      this.projects = [];
    } finally {
      this.projectsLoading = false;
    }
  }

  private handleInstallPackageFromSelector(e: CustomEvent): void {
    const { packageId, version, projectPaths } = e.detail;

    // Re-dispatch to parent (packageBrowser root) for IPC handling
    this.dispatchEvent(
      new CustomEvent('install-package', {
        detail: { packageId, version, projectPaths },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleUninstallPackageFromSelector(e: CustomEvent): void {
    const { packageId, projectPaths } = e.detail;

    // Re-dispatch to parent (packageBrowser root) for IPC handling
    this.dispatchEvent(
      new CustomEvent('uninstall-package', {
        detail: { packageId, projectPaths },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * Handle install package response from extension host.
   * Forwards the response to project-selector component for UI updates.
   * Called by packageBrowser when it receives an installPackageResponse IPC message.
   */
  public handleInstallResponse(response: {
    packageId: string;
    version: string;
    success: boolean;
    results: Array<{ projectPath: string; success: boolean; error?: string }>;
  }): void {
    const projectSelector = this.shadowRoot?.querySelector('project-selector');
    if (projectSelector) {
      // Use the existing setResults method to display per-project status
      (projectSelector as any).setResults(
        response.results.map(r => ({
          projectPath: r.projectPath,
          success: r.success,
          error: r.error ? { code: 'InstallError', message: r.error } : undefined,
        })),
      );
    }

    // Optimistic update: immediately mark successfully installed projects as installed
    // This provides instant UI feedback while the server-side fetch reconciles
    const succeeded = new Set(response.results.filter(r => r.success).map(r => r.projectPath));
    if (this.projects && this.projects.length > 0 && succeeded.size > 0) {
      this.projects = this.projects.map(p =>
        succeeded.has(p.path) ? { ...p, installedVersion: response.version } : p,
      );
      this.requestUpdate();
    }

    // Trigger project list refresh to update installed versions and checkbox states
    // This ensures UI shows correct installed state after operation completes
    void this.fetchProjects();
  }

  /**
   * Handle uninstall package response from extension host.
   * Forwards the response to project-selector component for UI updates.
   * Called by packageBrowser when it receives an uninstallPackageResponse IPC message.
   */
  public handleUninstallResponse(response: {
    packageId: string;
    success: boolean;
    results: Array<{ projectPath: string; success: boolean; error?: string }>;
  }): void {
    const projectSelector = this.shadowRoot?.querySelector('project-selector');
    if (projectSelector) {
      // Use the existing setResults method to display per-project status
      (projectSelector as any).setResults(
        response.results.map(r => ({
          projectPath: r.projectPath,
          success: r.success,
          error: r.error ? { code: 'UninstallError', message: r.error } : undefined,
        })),
      );
    }

    // Optimistic update: immediately mark successfully uninstalled projects as not installed
    // This provides instant UI feedback while the server-side fetch reconciles
    const succeeded = new Set(response.results.filter(r => r.success).map(r => r.projectPath));
    if (this.projects && this.projects.length > 0 && succeeded.size > 0) {
      this.projects = this.projects.map(p => (succeeded.has(p.path) ? { ...p, installedVersion: undefined } : p));
      this.requestUpdate();
    }

    // Trigger project list refresh to update installed versions
    void this.fetchProjects();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('keydown', this.handleEscapeKey);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.handleEscapeKey);
  }

  private handleEscapeKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.open) {
      this.handleClose();
    }
  };

  /**
   * Convert VersionSummary[] to VersionMetadata[] for version-selector.
   */
  private convertVersionsToMetadata(
    versions: Array<{ version: string; publishedDate?: string; isPrerelease: boolean; listed: boolean }>,
  ): Array<{ version: string; listed: boolean; isPrerelease: boolean; publishedDate: string }> {
    return versions.map(v => ({
      version: v.version,
      listed: v.listed,
      isPrerelease: v.isPrerelease,
      publishedDate: v.publishedDate || '',
    }));
  }

  override updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties);

    // Reset selected version and clear install results when package changes
    if (changedProperties.has('packageData') && this.packageData) {
      this.selectedVersion = this.packageData.version;

      // Clear any previous install results when switching packages
      const projectSelector = this.shadowRoot?.querySelector('project-selector');
      if (projectSelector) {
        (projectSelector as any).setResults([]);
      }

      // Re-fetch projects with new packageId to update installed status
      if (this.open) {
        void this.fetchProjects();
      }
    }

    // Fetch projects when panel opens
    if (changedProperties.has('open') && this.open && this.packageData) {
      void this.fetchProjects();
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    [PACKAGE_DETAILS_PANEL_TAG]: PackageDetailsPanel;
  }
}
