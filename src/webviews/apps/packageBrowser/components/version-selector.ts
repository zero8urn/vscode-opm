/**
 * Version selector dropdown component for NuGet packages.
 * Displays actual version numbers with informational badges (Latest stable, Latest prerelease, Prerelease).
 * Integrates with package details cache and emits custom events on version selection.
 */

import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import {
  sortVersionsDescending,
  identifyVersionBadges,
  getDefaultVersion,
  filterVersions,
} from '../utils/versionUtils';

/** Custom element tag name for version selector component */
export const VERSION_SELECTOR_TAG = 'version-selector' as const;

/**
 * Metadata for a single package version.
 */
export interface VersionMetadata {
  /** SemVer 2.0.0 version string */
  version: string;
  /** Whether this version is listed/published */
  listed: boolean;
  /** Whether this version is a prerelease */
  isPrerelease: boolean;
  /** Publish date (ISO 8601 string) */
  publishedDate: string;
}

/**
 * Badge type for version labeling.
 */
export interface VersionBadge {
  /** Badge variant */
  type: 'latest-stable' | 'latest-prerelease' | 'prerelease' | null;
  /** Display label */
  label: string;
}

/**
 * Version selector dropdown component.
 *
 * @fires version-changed - Dispatched when user selects a different version
 */
@customElement(VERSION_SELECTOR_TAG)
export class VersionSelector extends LitElement {
  // Public properties
  /** Package ID (for event emission) */
  @property({ type: String })
  packageId = '';

  /** Currently selected version */
  @property({ type: String })
  selectedVersion = '';

  /** Whether to include prerelease versions */
  @property({ type: Boolean })
  includePrerelease = false;

  /** All available versions (passed from parent) */
  @property({ type: Array })
  versions: VersionMetadata[] = [];

  // Internal state
  /** Loading state (for parent to control) */
  @property({ type: Boolean })
  loading = false;

  /** Error message (for parent to control) */
  @property({ type: String })
  error = '';

  /** Badge map for version labeling */
  @state()
  private badgeMap = new Map<string, VersionBadge>();

  static override styles = css`
    :host {
      display: block;
    }

    .version-selector-container {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .selector-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .version-label {
      font-size: 13px;
      font-weight: 600;
      color: var(--vscode-foreground);
      white-space: nowrap;
    }

    .version-dropdown {
      flex: 1;
      min-width: 120px;
      max-width: 155px;
      padding: 4px 8px;
      background-color: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border);
      border-radius: 2px;
      font-family: var(--vscode-font-family);
      font-size: 13px;
      cursor: pointer;
    }

    .version-dropdown:focus {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: -1px;
    }

    .version-dropdown:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 6px;
      font-size: 11px;
      font-weight: 500;
      border-radius: 2px;
      white-space: nowrap;
    }

    .badge.latest-stable {
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .badge.latest-prerelease {
      background-color: var(--vscode-inputValidation-warningBackground);
      color: var(--vscode-inputValidation-warningForeground);
      border: 1px solid var(--vscode-inputValidation-warningBorder);
    }

    .badge.prerelease {
      background-color: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }

    .loading-container,
    .error-container {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
    }

    .spinner {
      width: 14px;
      height: 14px;
      border: 2px solid var(--vscode-progressBar-background);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    .error-text {
      color: var(--vscode-errorForeground);
      font-size: 13px;
    }

    .retry-button {
      padding: 4px 8px;
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 2px;
      cursor: pointer;
      font-size: 12px;
      font-family: var(--vscode-font-family);
    }

    .retry-button:hover {
      background-color: var(--vscode-button-hoverBackground);
    }
  `;

  /**
   * Handle retry button click.
   */
  private handleRetry(): void {
    // Emit event for parent to handle retry
    this.dispatchEvent(
      new CustomEvent('retry-fetch', {
        bubbles: true,
        composed: true,
      }),
    );
  }

  override connectedCallback() {
    super.connectedCallback();
    this.initializeVersions();
  }

  override updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('versions')) {
      this.initializeVersions();
    }
    if (changedProperties.has('includePrerelease')) {
      this.updateFilteredVersions();
    }
  }

  /**
   * Initialize version-related state when versions property changes.
   */
  private initializeVersions(): void {
    if (this.versions.length === 0) return;

    // Ensure versions are sorted
    const sortedVersions = sortVersionsDescending(this.versions);

    // Only update if order changed (avoid infinite loop)
    if (JSON.stringify(sortedVersions) !== JSON.stringify(this.versions)) {
      this.versions = sortedVersions;
    }

    // Identify badges
    this.badgeMap = identifyVersionBadges(this.versions);

    // Set default selected version if not already set
    if (!this.selectedVersion && this.versions.length > 0) {
      const defaultVersion = getDefaultVersion(this.versions, this.includePrerelease);
      if (defaultVersion) {
        this.selectedVersion = defaultVersion.version;
      }
    }
  }

  /**
   * Update filtered versions when includePrerelease changes.
   */
  private updateFilteredVersions(): void {
    // Recompute default selection if needed
    if (this.selectedVersion && !this.includePrerelease) {
      const selected = this.versions.find(v => v.version === this.selectedVersion);
      if (selected?.isPrerelease) {
        // Current selection is prerelease but filter is off - switch to latest stable
        const defaultVersion = getDefaultVersion(this.versions, this.includePrerelease);
        if (defaultVersion) {
          this.selectedVersion = defaultVersion.version;
          // Manually trigger change event
          const select = this.shadowRoot?.querySelector('select') as HTMLSelectElement;
          if (select) {
            select.value = defaultVersion.version;
            this.dispatchVersionChange(defaultVersion.version);
          }
        }
      }
    }
  }

  /**
   * Handle version selection change.
   */
  private handleVersionChange(e: Event): void {
    const select = e.target as HTMLSelectElement;
    const newVersion = select.value;

    if (newVersion !== this.selectedVersion) {
      this.selectedVersion = newVersion;
      this.dispatchVersionChange(newVersion);
    }
  }

  /**
   * Dispatch custom event for parent component.
   */
  private dispatchVersionChange(version: string): void {
    this.dispatchEvent(
      new CustomEvent('version-changed', {
        detail: { version },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * Handle keyboard navigation.
   */
  private handleKeyDown(e: KeyboardEvent): void {
    const select = e.target as HTMLSelectElement;

    // Home: Jump to first option (latest)
    if (e.key === 'Home' && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      select.selectedIndex = 0;
      this.handleVersionChange(e);
    }

    // End: Jump to last option (oldest)
    if (e.key === 'End' && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      select.selectedIndex = select.options.length - 1;
      this.handleVersionChange(e);
    }
  }

  /**
   * Get filtered versions based on includePrerelease.
   */
  private get filteredVersions(): VersionMetadata[] {
    return filterVersions(this.versions, this.includePrerelease);
  }

  private renderLoading() {
    return html`
      <div class="loading-container">
        <span class="spinner" role="progressbar" aria-label="Loading versions"></span>
        <span>Loading versions...</span>
      </div>
    `;
  }

  private renderError() {
    return html`
      <div class="error-container">
        <span class="error-text">Version unavailable</span>
        <button class="retry-button" @click=${this.handleRetry} aria-label="Retry loading versions">Retry</button>
      </div>
    `;
  }

  override render() {
    if (this.loading) {
      return this.renderLoading();
    }

    if (this.error) {
      return this.renderError();
    }

    const versions = this.filteredVersions;

    if (versions.length === 0) {
      return html`
        <div class="version-selector-container">
          <span class="version-label">Version:</span>
          <span class="error-text">No versions available</span>
        </div>
      `;
    }

    return html`
      <div class="version-selector-container">
        <div class="selector-row">
          <label class="version-label" for="version-dropdown">Version:</label>
          <select
            id="version-dropdown"
            class="version-dropdown"
            .value=${this.selectedVersion}
            @change=${this.handleVersionChange}
            @keydown=${this.handleKeyDown}
            aria-label="Package version selector"
          >
            ${versions.map(v => {
              const badge = this.badgeMap.get(v.version);
              const optionLabel = badge ? `${v.version} (${badge.label})` : v.version;
              return html`
                <option value=${v.version} ?selected=${v.version === this.selectedVersion}>${optionLabel}</option>
              `;
            })}
          </select>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    [VERSION_SELECTOR_TAG]: VersionSelector;
  }
}
