import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { DependencyGroup } from '../../../services/packageDetailsService';

/** Custom element tag name for dependency tree component */
export const DEPENDENCY_TREE_TAG = 'dependency-tree' as const;

/**
 * Display package dependencies grouped by target framework.
 * Shows direct dependencies only (no transitive dependency expansion).
 */
@customElement(DEPENDENCY_TREE_TAG)
export class DependencyTree extends LitElement {
  @property({ type: Array })
  groups: DependencyGroup[] = [];

  @state()
  private expandedFrameworks = new Set<string>();

  static override styles = css`
    :host {
      display: block;
    }

    .empty {
      padding: 2rem;
      text-align: center;
      color: var(--vscode-descriptionForeground);
    }

    .framework-group {
      margin-bottom: 0.5rem;
    }

    .framework-header {
      display: flex;
      align-items: center;
      padding: 0.75rem 1rem;
      background: var(--vscode-input-background);
      border-bottom: 1px solid var(--vscode-panel-border);
      cursor: pointer;
      user-select: none;
    }

    .framework-header:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .framework-header:focus {
      outline: 2px solid var(--vscode-focusBorder);
      outline-offset: -2px;
    }

    .chevron {
      margin-right: 0.5rem;
      transition: transform 0.2s ease;
      font-size: 12px;
    }

    .chevron.expanded {
      transform: rotate(90deg);
    }

    .framework-name {
      font-weight: 600;
      font-size: 14px;
    }

    .dependency-count {
      margin-left: auto;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .dependencies {
      border-left: 2px solid var(--vscode-panel-border);
      margin-left: 1rem;
    }

    .dependency-item {
      padding: 0.5rem 1rem;
      border-bottom: 1px solid var(--vscode-panel-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      transition: background 0.1s ease;
    }

    .dependency-item:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .dependency-item:focus {
      outline: 2px solid var(--vscode-focusBorder);
      outline-offset: -2px;
    }

    .dependency-name {
      color: var(--vscode-textLink-foreground);
      font-weight: 500;
    }

    .dependency-version {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
    }

    .no-dependencies {
      padding: 1rem;
      color: var(--vscode-descriptionForeground);
      font-style: italic;
    }
  `;

  override render() {
    if (this.groups.length === 0) {
      return html` <div class="empty">No dependency information available</div> `;
    }

    return html`
      ${this.groups.map(
        group => html`
          <div class="framework-group">
            <div
              class="framework-header"
              role="button"
              tabindex="0"
              @click=${() => this.toggleFramework(group.framework)}
              @keydown=${(e: KeyboardEvent) => this.handleHeaderKeyDown(e, group.framework)}
            >
              <span class="chevron ${this.expandedFrameworks.has(group.framework) ? 'expanded' : ''}">▸</span>
              <span class="framework-name">${group.framework}</span>
              <span class="dependency-count">${group.dependencies.length} dependencies</span>
            </div>

            ${this.expandedFrameworks.has(group.framework)
              ? html`
                  <div class="dependencies">
                    ${group.dependencies.length === 0
                      ? html` <div class="no-dependencies">No dependencies for this framework</div> `
                      : group.dependencies.map(
                          dep => html`
                            <div
                              class="dependency-item"
                              role="button"
                              tabindex="0"
                              @click=${() => this.handleDependencyClick(dep.id)}
                              @keydown=${(e: KeyboardEvent) => this.handleDependencyKeyDown(e, dep.id)}
                            >
                              <span class="dependency-name">${dep.id}</span>
                              <span class="dependency-version">${dep.versionRange}</span>
                            </div>
                          `,
                        )}
                  </div>
                `
              : ''}
          </div>
        `,
      )}
    `;
  }

  private toggleFramework(framework: string): void {
    if (this.expandedFrameworks.has(framework)) {
      this.expandedFrameworks.delete(framework);
    } else {
      this.expandedFrameworks.add(framework);
    }
    this.requestUpdate();
  }

  private handleHeaderKeyDown(e: KeyboardEvent, framework: string): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.toggleFramework(framework);
    }
  }

  private handleDependencyClick(packageId: string): void {
    this.dispatchEvent(
      new CustomEvent('dependency-select', {
        detail: { packageId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleDependencyKeyDown(e: KeyboardEvent, packageId: string): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.handleDependencyClick(packageId);
    }
  }
}
