import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

/** Custom element tag name for accordion section component */
export const ACCORDION_SECTION_TAG = 'accordion-section' as const;

/**
 * Collapsible accordion section with expand/collapse animation.
 * Used for organizing package details into expandable sections.
 */
@customElement(ACCORDION_SECTION_TAG)
export class AccordionSection extends LitElement {
  @property({ type: String })
  override title = '';

  @property({ type: Boolean, reflect: true })
  expanded = false;

  @property({ type: String })
  icon = '';

  static override styles = css`
    :host {
      display: block;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.1rem 0.5rem;
      cursor: pointer;
      background: var(--vscode-editor-background);
      user-select: none;
      transition: background-color 0.1s ease;
    }

    .header:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .header:focus {
      outline: 2px solid var(--vscode-focusBorder);
      outline-offset: -2px;
    }

    .expand-icon {
      transition: transform 0.2s ease;
      color: var(--vscode-foreground);
    }

    :host([expanded]) .expand-icon {
      transform: rotate(90deg);
    }

    .section-icon {
      font-size: 16px;
      flex-shrink: 0;
    }

    .title {
      flex: 1;
      font-weight: 600;
      font-size: 13px;
      color: var(--vscode-foreground);
    }

    .content {
      overflow: hidden;
      max-height: 0;
      transition: max-height 0.2s ease-out;
    }

    :host([expanded]) .content {
      max-height: 1000px;
      transition: max-height 0.3s ease-in;
    }

    .content-inner {
      padding: 0.75rem 1rem;
      padding-left: 2.5rem;
    }
  `;

  override render() {
    return html`
      <div
        class="header"
        role="button"
        tabindex="0"
        aria-expanded="${this.expanded}"
        @click=${this.toggle}
        @keydown=${this.handleKeydown}
      >
        <span class="expand-icon">▶</span>
        ${this.icon ? html`<span class="section-icon">${this.icon}</span>` : ''}
        <span class="title">${this.title}</span>
      </div>
      <div class="content">
        <div class="content-inner">
          <slot></slot>
        </div>
      </div>
    `;
  }

  private toggle() {
    this.expanded = !this.expanded;
    this.dispatchEvent(
      new CustomEvent('toggle', {
        detail: { expanded: this.expanded },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.toggle();
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    [ACCORDION_SECTION_TAG]: AccordionSection;
  }
}
