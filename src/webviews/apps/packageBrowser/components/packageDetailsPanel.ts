import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { PackageDetailsData } from '../../../services/packageDetailsService';
import './packageBadges';
import { PACKAGE_BADGES_TAG } from './packageBadges';
import './readmeViewer';
import { README_VIEWER_TAG } from './readmeViewer';
import './versionList';
import { VERSION_LIST_TAG } from './versionList';
import './dependencyTree';
import { DEPENDENCY_TREE_TAG } from './dependencyTree';

/** Custom element tag name for package details panel component */
export const PACKAGE_DETAILS_PANEL_TAG = 'package-details-panel' as const;

type TabName = 'readme' | 'dependencies' | 'versions';

/**
 * Slide-in panel displaying comprehensive package details.
 * Includes tabs for README, Dependencies, and Versions.
 */
@customElement(PACKAGE_DETAILS_PANEL_TAG)
export class PackageDetailsPanel extends LitElement {
  @property({ type: Object })
  packageData: PackageDetailsData | null = null;

  @property({ type: Boolean })
  open = false;

  @property({ type: Boolean })
  includePrerelease = false;

  @state()
  private selectedTab: TabName = 'readme';

  @state()
  private loading = false;

  @state()
  private readmeHtml: string | null = null;

  @state()
  private lastPackageId: string | null = null;

  static override styles = css`
    :host {
      display: block;
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: 60%;
      min-width: 400px;
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
      background: var(--vscode-panel-background);
    }

    .header-top {
      display: flex;
      align-items: flex-start;
      gap: 1rem;
      margin-bottom: 0.75rem;
    }

    .icon {
      flex-shrink: 0;
      width: 48px;
      height: 48px;
      border-radius: 4px;
      background: var(--vscode-input-background);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .icon img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .icon-placeholder {
      font-size: 24px;
    }

    .title-section {
      flex: 1;
      min-width: 0;
    }

    .package-name {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 0.25rem;
      word-break: break-word;
    }

    .version {
      font-size: 14px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 0.5rem;
    }

    .close-button {
      flex-shrink: 0;
      background: none;
      border: none;
      color: var(--vscode-foreground);
      font-size: 20px;
      cursor: pointer;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
    }

    .close-button:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }

    .close-button:focus {
      outline: 2px solid var(--vscode-focusBorder);
      outline-offset: 2px;
    }

    .warning-banner {
      padding: 0.75rem;
      margin-bottom: 0.75rem;
      border-radius: 4px;
      border-left: 4px solid;
    }

    .warning-banner.deprecation {
      background: var(--vscode-inputValidation-warningBackground);
      border-color: var(--vscode-inputValidation-warningBorder);
      color: var(--vscode-inputValidation-warningForeground);
    }

    .warning-banner.vulnerability {
      background: var(--vscode-inputValidation-errorBackground);
      border-color: var(--vscode-inputValidation-errorBorder);
      color: var(--vscode-inputValidation-errorForeground);
    }

    .warning-title {
      font-weight: 600;
      margin-bottom: 0.25rem;
    }

    .warning-content {
      font-size: 13px;
    }

    .alternative-link {
      color: var(--vscode-textLink-foreground);
      text-decoration: underline;
      cursor: pointer;
    }

    .tabs {
      display: flex;
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-panel-background);
      flex-shrink: 0;
    }

    .tab {
      padding: 0.75rem 1.5rem;
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--vscode-foreground);
      cursor: pointer;
      font-size: 14px;
      transition: all 0.1s ease;
    }

    .tab:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }

    .tab:focus {
      outline: 2px solid var(--vscode-focusBorder);
      outline-offset: -2px;
    }

    .tab[aria-selected='true'] {
      border-bottom-color: var(--vscode-focusBorder);
      font-weight: 600;
    }

    .content {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .tab-panel {
      display: none;
    }

    .tab-panel[active] {
      display: block;
    }

    .metadata {
      padding: 1rem;
      font-size: 13px;
      line-height: 1.6;
    }

    .metadata-item {
      margin-bottom: 0.5rem;
    }

    .metadata-label {
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      margin-right: 0.5rem;
    }
  `;

  override render() {
    if (!this.packageData) {
      return html``;
    }

    const pkg = this.packageData;

    return html`
      <div class="backdrop" @click=${this.handleBackdropClick}></div>
      <div class="panel" role="dialog" aria-labelledby="panel-title" @click=${this.handlePanelClick}>
        ${this.renderHeader(pkg)} ${this.renderWarnings(pkg)} ${this.renderTabs()} ${this.renderContent(pkg)}
      </div>
    `;
  }

  private renderHeader(pkg: PackageDetailsData) {
    return html`
      <div class="header">
        <div class="header-top">
          <div class="icon">
            ${pkg.iconUrl
              ? html`<img src="${pkg.iconUrl}" alt="${pkg.id} icon" />`
              : html`<span class="icon-placeholder">📦</span>`}
          </div>

          <div class="title-section">
            <h2 id="panel-title" class="package-name">${pkg.id}</h2>
            <div class="version">v${pkg.version}</div>
            <package-badges
              .verified=${pkg.verified || false}
              .deprecated=${pkg.deprecated}
              .hasVulnerabilities=${pkg.vulnerabilities.length > 0}
            ></package-badges>
          </div>

          <button class="close-button" @click=${this.handleClose} aria-label="Close panel" title="Close (Esc)">
            ✕
          </button>
        </div>

        ${pkg.description ? html`<div class="metadata-item">${pkg.description}</div>` : ''}
      </div>
    `;
  }

  private renderWarnings(pkg: PackageDetailsData) {
    return html`
      ${pkg.deprecated
        ? html`
            <div class="warning-banner deprecation">
              <div class="warning-title">⚠️ This package is deprecated</div>
              <div class="warning-content">
                ${pkg.deprecationReasons?.map(reason => html`<div>${reason}</div>`)}
                ${pkg.alternativePackage
                  ? html`
                      <div>
                        Use
                        <span
                          class="alternative-link"
                          @click=${() => this.handleAlternativeClick(pkg.alternativePackage!)}
                        >
                          ${pkg.alternativePackage}
                        </span>
                        instead.
                      </div>
                    `
                  : ''}
              </div>
            </div>
          `
        : ''}
      ${pkg.vulnerabilities.length > 0
        ? html`
            <div class="warning-banner vulnerability">
              <div class="warning-title">🛡️ Security vulnerabilities detected</div>
              <div class="warning-content">
                ${pkg.vulnerabilities.map(
                  vuln => html`
                    <div>
                      <strong>${vuln.severity}</strong>
                      ${vuln.advisoryUrl
                        ? html` - <a href="${vuln.advisoryUrl}" target="_blank" rel="noopener">Details</a>`
                        : ''}
                    </div>
                  `,
                )}
              </div>
            </div>
          `
        : ''}
    `;
  }

  private renderTabs() {
    return html`
      <div class="tabs" role="tablist">
        <button
          class="tab"
          role="tab"
          aria-selected=${this.selectedTab === 'readme'}
          @click=${() => this.selectTab('readme')}
        >
          README
        </button>
        <button
          class="tab"
          role="tab"
          aria-selected=${this.selectedTab === 'dependencies'}
          @click=${() => this.selectTab('dependencies')}
        >
          Dependencies
        </button>
        <button
          class="tab"
          role="tab"
          aria-selected=${this.selectedTab === 'versions'}
          @click=${() => this.selectTab('versions')}
        >
          Versions
        </button>
      </div>
    `;
  }

  private renderContent(pkg: PackageDetailsData) {
    // Filter versions based on includePrerelease setting
    const filteredVersions = this.includePrerelease ? pkg.versions : pkg.versions.filter(v => !v.isPrerelease);

    return html`
      <div class="content">
        <div class="tab-panel" role="tabpanel" ?active=${this.selectedTab === 'readme'}>
          <readme-viewer
            .html=${this.readmeHtml}
            .loading=${this.loading}
            .projectUrl=${pkg.projectUrl}
          ></readme-viewer>
        </div>

        <div class="tab-panel" role="tabpanel" ?active=${this.selectedTab === 'dependencies'}>
          <dependency-tree
            .groups=${pkg.dependencies}
            @dependency-select=${this.handleDependencySelect}
          ></dependency-tree>
        </div>

        <div class="tab-panel" role="tabpanel" ?active=${this.selectedTab === 'versions'}>
          <version-list
            .versions=${filteredVersions}
            .selectedVersion=${pkg.version}
            @version-select=${this.handleVersionSelect}
          ></version-list>
        </div>
      </div>
    `;
  }

  private selectTab(tab: TabName): void {
    this.selectedTab = tab;

    // Lazy load README when first selected
    if (tab === 'readme' && !this.readmeHtml && !this.loading && this.packageData) {
      this.dispatchEvent(
        new CustomEvent('readme-request', {
          detail: {
            packageId: this.packageData.id,
            version: this.packageData.version,
          },
          bubbles: true,
          composed: true,
        }),
      );
      this.loading = true;
    }
  }

  private handleClose(): void {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  private handleBackdropClick(e: Event): void {
    // Only close if clicking directly on backdrop, not on panel
    if (e.target === e.currentTarget) {
      this.handleClose();
    }
  }

  private handlePanelClick(e: Event): void {
    // Stop propagation to prevent backdrop from closing
    e.stopPropagation();
  }

  private handleVersionSelect(e: CustomEvent): void {
    this.dispatchEvent(
      new CustomEvent('version-selected', {
        detail: e.detail,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleDependencySelect(e: CustomEvent): void {
    this.dispatchEvent(
      new CustomEvent('dependency-selected', {
        detail: e.detail,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleAlternativeClick(packageId: string): void {
    this.dispatchEvent(
      new CustomEvent('package-selected', {
        detail: { packageId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * Called when parent receives README response.
   */
  public setReadmeHtml(html: string | null): void {
    this.readmeHtml = html;
    this.loading = false;
  }

  /**
   * Called when README request fails.
   */
  public setReadmeError(): void {
    this.readmeHtml = null;
    this.loading = false;
  }

  override updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties);

    // When package changes, reset and trigger README if we're on readme tab
    if (changedProperties.has('packageData') && this.packageData) {
      const pkg = this.packageData;
      if (pkg.id !== this.lastPackageId) {
        this.readmeHtml = null;
        this.loading = false;
        this.lastPackageId = pkg.id;

        // If we're already on the readme tab, trigger the request
        if (this.selectedTab === 'readme') {
          this.dispatchEvent(
            new CustomEvent('readme-request', {
              detail: {
                packageId: pkg.id,
                version: pkg.version,
              },
              bubbles: true,
              composed: true,
            }),
          );
          this.loading = true;
        }
      }
    }
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
}
