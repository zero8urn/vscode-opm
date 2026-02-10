import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { PackageDetailsData } from '../../../services/packageDetailsService';
import type { ProjectInfo } from '../types';
import './packageBadges';
import './accordionSection';
import './project-selector';
import './version-selector';
import './detailsHeader';

import { vscode } from '../vscode-api';

// Styles
import { detailsPanelStyles, commonStyles } from '../styles';

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

  @property({ type: String })
  sourceId: string | null = null;

  @property({ type: String })
  sourceName: string | null = null;

  //  Cached projects passed from parent (early fetch)
  @property({ type: Array })
  cachedProjects: ProjectInfo[] = [];

  //  Loading state from parent's early fetch
  @property({ type: Boolean })
  parentProjectsLoading = false;

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

  /**
   * Tracks the ID of the currently active projects request.
   * Used to ignore stale responses from cancelled requests.
   */
  private currentProjectsRequestId: string | null = null;

  /**
   * Debounce timer for package selection changes.
   * Prevents rapid-fire fetches when user clicks through packages quickly.
   */
  private packageChangeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly DEBOUNCE_MS = 150;

  /**
   *  Tracks which package we last checked installed status for.
   * Used to skip redundant fetches when revisiting the same package.
   */
  private lastCheckedPackageId: string | null = null;

  /**
   *  Cache of installed status per packageId.
   * Key: packageId (lowercase)
   * Value: Map<projectPath, installedVersion | undefined>
   */
  private installedStatusCache = new Map<string, Map<string, string | undefined>>();

  static override styles = [commonStyles, detailsPanelStyles];

  override render() {
    if (!this.packageData) {
      return html``;
    }

    const pkg = this.packageData;

    // Ensure selectedVersion is in sync with packageData BEFORE rendering
    // This prevents the version from "popping in" when switching packages
    if (!this.selectedVersion || this.selectedVersion !== pkg.version) {
      this.selectedVersion = pkg.version;
    }

    const currentVersion = this.selectedVersion;

    return html`
      <div class="backdrop" @click=${this.handleBackdropClick}></div>
      <div class="panel" role="dialog" aria-labelledby="panel-title">
        <details-header
          .title=${pkg.id}
          .authors=${pkg.authors || ''}
          .iconUrl=${pkg.iconUrl || ''}
          .projectUrl=${pkg.projectUrl || ''}
          .verified=${pkg.verified}
          .sourceName=${this.sourceName}
          @close=${this.handleClose}
        >
          <div slot="controls">
            <version-selector
              .packageId=${pkg.id}
              .selectedVersion=${currentVersion}
              .includePrerelease=${this.includePrerelease}
              .versions=${this.convertVersionsToMetadata(pkg.versions)}
              @version-changed=${this.handleVersionChange}
            ></version-selector>
          </div>
        </details-header>

        ${this.renderWarnings(pkg)} ${this.renderContent(pkg, currentVersion)}
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

  private async fetchProjects(): Promise<void> {
    // Guard: Don't fetch without package context
    if (!this.packageData?.id) {
      this.projects = [];
      return;
    }

    //  Use cached projects as base when available
    // This eliminates redundant IPC calls — we already have the project list
    // from the early fetch. Now we just need to check installed status.
    if (this.cachedProjects.length > 0) {
      console.log('Using cached projects, fetching installed status for:', this.packageData.id);

      // Set projects from cache immediately (user sees project list instantly)
      // Preserve any existing installedVersion values (optimistic or previous) so
      // the UI doesn't temporarily lose the installed state when switching versions.
      const prevMap = new Map(this.projects.map(pr => [pr.path, pr.installedVersion]));
      this.projects = this.cachedProjects.map(p => ({
        ...p,
        installedVersion: prevMap.has(p.path) ? prevMap.get(p.path) : p.installedVersion,
        displayName: this.getProjectDisplayName(p),
      }));
      this.projectsLoading = true;

      // Now fetch with packageId to get installed status
      await this.fetchInstalledStatus();
      return;
    }

    // Fallback: Full fetch if no cache (backward compatibility)
    console.log('No cached projects, doing full fetch');

    //  Generate unique request ID and track it
    const requestId = Math.random().toString(36).substring(2, 15);
    this.currentProjectsRequestId = requestId;
    this.projectsLoading = true;

    console.log('Fetching projects for:', this.packageData.id, 'requestId:', requestId);

    try {
      // Send getProjects request with packageId
      vscode.postMessage({
        type: 'getProjects',
        payload: {
          requestId,
          packageId: this.packageData.id,
        },
      });

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

            //  Ignore if this request was superseded
            if (this.currentProjectsRequestId !== requestId) {
              console.log('Ignoring stale response for requestId:', requestId);
              reject(new Error('Request superseded'));
              return;
            }

            if (message.args.error) {
              reject(new Error(message.args.error.message));
            } else {
              resolve(message.args.projects || []);
            }
          }
        };

        window.addEventListener('message', handler);
      });

      // Only update state if this request is still current
      if (this.currentProjectsRequestId === requestId) {
        this.projects = response.map(p => ({ ...p, displayName: this.getProjectDisplayName(p) }));
        console.log('Projects fetched with installed status:', {
          total: response.length,
          installed: response.filter(p => p.installedVersion).length,
          requestId,
        });
      }
    } catch (error) {
      // Don't log "Request superseded" as error
      if ((error as Error).message !== 'Request superseded') {
        console.error('Failed to fetch projects:', error);
      }

      // Only clear projects if this request is still current
      if (this.currentProjectsRequestId === requestId) {
        this.projects = [];
      }
    } finally {
      // Only clear loading state if this request is still current
      if (this.currentProjectsRequestId === requestId) {
        this.projectsLoading = false;
      }
    }
  }

  /**
   *  Fetch only installed status for current package.
   * Uses existing getProjects IPC with packageId.
   * Projects are already displayed from cache — this updates installedVersion.
   *
   *  Now includes caching to avoid redundant fetches on revisited packages.
   */
  private async fetchInstalledStatus(): Promise<void> {
    if (!this.packageData?.id) {
      this.projectsLoading = false;
      return;
    }

    const packageIdLower = this.packageData.id.toLowerCase();

    //  Check if we have cached installed status for this package
    if (this.installedStatusCache.has(packageIdLower) && this.cachedProjects.length > 0) {
      console.log('Using cached installed status for:', this.packageData.id);

      const cachedStatus = this.installedStatusCache.get(packageIdLower)!;
      this.projects = this.cachedProjects.map(project => ({
        ...project,
        installedVersion: cachedStatus.get(project.path),
        displayName: this.getProjectDisplayName(project),
      }));

      this.lastCheckedPackageId = this.packageData.id;
      this.projectsLoading = false;
      return;
    }

    // Need to fetch installed status from backend
    console.log('Fetching installed status for:', this.packageData.id);

    //  Generate unique request ID and track it
    const requestId = Math.random().toString(36).substring(2, 15);
    this.currentProjectsRequestId = requestId;

    try {
      vscode.postMessage({
        type: 'getProjects',
        payload: {
          requestId,
          packageId: this.packageData.id,
        },
      });

      const response = await new Promise<ProjectInfo[]>((resolve, reject) => {
        const timeout = setTimeout(() => {
          window.removeEventListener('message', handler);
          reject(new Error('Installed status fetch timeout'));
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

            //  Ignore if this request was superseded
            if (this.currentProjectsRequestId !== requestId) {
              console.log('Ignoring stale installed status response for requestId:', requestId);
              reject(new Error('Request superseded'));
              return;
            }

            if (message.args.error) {
              reject(new Error(message.args.error.message));
            } else {
              resolve(message.args.projects || []);
            }
          }
        };

        window.addEventListener('message', handler);
      });

      // Only update projects with installed status if this request is still current
      if (this.currentProjectsRequestId === requestId) {
        this.projects = response.map(p => ({ ...p, displayName: this.getProjectDisplayName(p) }));

        //  Cache the installed status results
        const statusMap = new Map<string, string | undefined>();
        for (const project of response) {
          statusMap.set(project.path, project.installedVersion);
        }
        this.installedStatusCache.set(packageIdLower, statusMap);
        this.lastCheckedPackageId = this.packageData?.id || null;

        console.log('Installed status updated and cached:', {
          total: response.length,
          installed: response.filter(p => p.installedVersion).length,
          requestId,
        });
      }
    } catch (error) {
      // Don't log "Request superseded" as error
      if ((error as Error).message !== 'Request superseded') {
        console.error('Failed to fetch installed status:', error);
      }
      // Keep showing cached projects even if status check fails
    } finally {
      // Only clear loading state if this request is still current
      if (this.currentProjectsRequestId === requestId) {
        this.projectsLoading = false;
      }
    }
  }

  private handleInstallPackageFromSelector(e: CustomEvent): void {
    const { packageId, version, projectPaths } = e.detail;

    // Stop the original event from bubbling to prevent duplicate handling
    e.stopPropagation();

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

    // Stop the original event from bubbling to prevent duplicate handling
    e.stopPropagation();

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

    // If the host provided authoritative per-project updates, apply them and skip
    // the expensive full `fetchProjects()` call. Otherwise, invalidate cache and
    // re-fetch projects to reconcile state.
    if (response && (response as any).updatedProjects && (response as any).updatedProjects.length > 0) {
      const updates: Array<{ projectPath: string; installedVersion?: string }> = (response as any).updatedProjects;
      const updateMap = new Map(updates.map(u => [u.projectPath, u.installedVersion]));
      this.projects = this.projects.map(p => ({
        ...p,
        installedVersion: updateMap.has(p.path) ? updateMap.get(p.path) : p.installedVersion,
      }));
      this.requestUpdate();
      // Still invalidate cached installed status to ensure future checks are fresh
      const packageIdLower = response.packageId.toLowerCase();
      this.installedStatusCache.delete(packageIdLower);
      this.lastCheckedPackageId = null;
      console.log('Applied authoritative per-project updates and invalidated cache for:', response.packageId);
    } else {
      //  Invalidate cache for installed package
      const packageIdLower = response.packageId.toLowerCase();
      this.installedStatusCache.delete(packageIdLower);
      this.lastCheckedPackageId = null;
      console.log('Invalidated installed status cache for:', response.packageId);

      // Trigger project list refresh to update installed versions and checkbox states
      // This ensures UI shows correct installed state after operation completes
      void this.fetchProjects();
    }
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

    // If host provided authoritative per-project updates, apply them and skip
    // the expensive full `fetchProjects()` call.
    if (response && (response as any).updatedProjects && (response as any).updatedProjects.length > 0) {
      const updates: Array<{ projectPath: string; installedVersion?: string }> = (response as any).updatedProjects;
      const updateMap = new Map(updates.map(u => [u.projectPath, u.installedVersion]));
      this.projects = this.projects.map(p => ({
        ...p,
        installedVersion: updateMap.has(p.path) ? updateMap.get(p.path) : p.installedVersion,
      }));
      this.requestUpdate();
      const packageIdLower = response.packageId.toLowerCase();
      this.installedStatusCache.delete(packageIdLower);
      this.lastCheckedPackageId = null;
      console.log('Applied authoritative per-project updates and invalidated cache for:', response.packageId);
    } else {
      //  Invalidate cache for uninstalled package
      const packageIdLower = response.packageId.toLowerCase();
      this.installedStatusCache.delete(packageIdLower);
      this.lastCheckedPackageId = null;
      console.log('Invalidated installed status cache for:', response.packageId);

      // Trigger project list refresh to update installed versions
      void this.fetchProjects();
    }
  }

  /**
   *  Clear all cached installed status.
   * Called when projects change (external .csproj modification).
   * This ensures we re-fetch installed status after external changes.
   */
  public clearInstalledStatusCache(): void {
    this.installedStatusCache.clear();
    this.lastCheckedPackageId = null;
    console.log('Cleared all installed status cache');
  }

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('keydown', this.handleEscapeKey);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.handleEscapeKey);

    //  Cleanup on disconnect
    // Clear debounce timer
    if (this.packageChangeDebounceTimer) {
      clearTimeout(this.packageChangeDebounceTimer);
      this.packageChangeDebounceTimer = null;
    }

    // Invalidate current request (any pending response will be ignored)
    this.currentProjectsRequestId = null;

    console.log('PackageDetailsPanel disconnected, resources cleaned up');
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

  /**
   * Compute a short display name for a project.
   * Prefer an explicit `name` if provided, otherwise derive from the file path.
   */
  private getProjectDisplayName(project: ProjectInfo): string {
    const candidate = (project as any).name || project.path || '';
    const last = candidate.split(/[/\\]/).pop() || candidate;
    return last.replace(/\.csproj$/i, '');
  }

  override updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties);

    // Track if we need to fetch projects (avoid duplicate fetches)
    let shouldFetchProjects = false;

    // Clear install results when package changes (selectedVersion is synced in render)
    if (changedProperties.has('packageData') && this.packageData) {
      // Clear any previous install results when switching packages
      const projectSelector = this.shadowRoot?.querySelector('project-selector');
      if (projectSelector) {
        (projectSelector as any).setResults([]);
      }

      //  Debounce fetch to handle rapid clicking
      if (this.open) {
        // Clear existing debounce timer
        if (this.packageChangeDebounceTimer) {
          clearTimeout(this.packageChangeDebounceTimer);
          console.log('Debounce timer cleared for previous package');
        }

        // Debounce fetch by 150ms to handle rapid clicking
        this.packageChangeDebounceTimer = setTimeout(() => {
          if (this.open && this.packageData) {
            console.log('Debounce complete, fetching projects for:', this.packageData.id);
            void this.fetchProjects();
          }
          this.packageChangeDebounceTimer = null;
        }, PackageDetailsPanel.DEBOUNCE_MS);

        // Don't trigger immediate fetch - wait for debounce
        shouldFetchProjects = false;
      }
    }

    // Fetch projects when panel opens (only if packageData didn't already trigger it)
    if (!shouldFetchProjects && changedProperties.has('open') && this.open && this.packageData) {
      // Only fetch if not already debounced from package change
      if (!this.packageChangeDebounceTimer) {
        shouldFetchProjects = true;
      }
    }

    // Single fetch to avoid duplicate requests (not debounced - user explicitly opened panel)
    if (shouldFetchProjects) {
      void this.fetchProjects();
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    [PACKAGE_DETAILS_PANEL_TAG]: PackageDetailsPanel;
  }
}
