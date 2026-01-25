/**
 * Project list item component - individual project row with checkbox and metadata
 */

import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { ProjectInfo } from '../types';
import { getVersionIndicator } from '../utils/version-compare';

export const PROJECT_LIST_ITEM_TAG = 'project-list-item' as const;

@customElement(PROJECT_LIST_ITEM_TAG)
export class ProjectListItem extends LitElement {
  @property({ type: Object }) project!: ProjectInfo;
  @property({ type: Boolean }) selected: boolean = false;
  @property({ type: String }) selectedVersion: string | undefined = undefined;

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

    .checkbox-container {
      display: flex;
      align-items: center;
      flex-shrink: 0;
      padding-top: 2px;
    }

    input[type='checkbox'] {
      cursor: pointer;
      width: 16px;
      height: 16px;
    }

    input[type='checkbox']:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }

    .project-info {
      flex: 1;
      min-width: 0;
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
    }

    .frameworks {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .project-path {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .installed-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 6px;
      background-color: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 2px;
      font-size: 11px;
      flex-shrink: 0;
    }

    .version-indicator {
      font-size: 14px;
      font-weight: bold;
    }

    .version-indicator.upgrade {
      color: var(--vscode-charts-green);
    }

    .version-indicator.downgrade {
      color: var(--vscode-charts-orange);
    }

    .checkmark {
      color: var(--vscode-charts-green);
    }
  `;

  private get isInstalled(): boolean {
    return this.project.installedVersion !== undefined;
  }

  private get versionIndicator(): '↑' | '↓' | '' {
    return getVersionIndicator(this.project.installedVersion, this.selectedVersion);
  }

  private get truncatedPath(): string {
    const path = this.project.relativePath;
    const maxLength = 50;

    if (path.length <= maxLength) {
      return path;
    }

    // Truncate in the middle to preserve directory structure
    const start = path.slice(0, 20);
    const end = path.slice(-25);
    return `${start}...${end}`;
  }

  private handleCheckboxChange(e: Event): void {
    const checkbox = e.target as HTMLInputElement;
    this.dispatchEvent(
      new CustomEvent('project-toggle', {
        detail: { projectPath: this.project.path, checked: checkbox.checked },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    const isInstalled = this.isInstalled;
    const indicator = this.versionIndicator;

    return html`
      <div class="project-row">
        <div class="checkbox-container">
          <input
            type="checkbox"
            .checked=${this.selected}
            @change=${this.handleCheckboxChange}
            aria-label="Select ${this.project.name}"
          />
        </div>

        <div class="project-info">
          <div class="project-header">
            <span class="project-name">${this.project.name}</span>
            <span class="frameworks">${this.project.frameworks.join(', ')}</span>
            ${isInstalled
              ? html`
                  <span class="installed-badge">
                    ✓ v${this.project.installedVersion}
                    ${indicator
                      ? html`
                          <span class="version-indicator ${indicator === '↑' ? 'upgrade' : 'downgrade'}">
                            ${indicator}
                          </span>
                        `
                      : ''}
                  </span>
                `
              : ''}
          </div>
          <div class="project-path" title=${this.project.relativePath}>${this.truncatedPath}</div>
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
