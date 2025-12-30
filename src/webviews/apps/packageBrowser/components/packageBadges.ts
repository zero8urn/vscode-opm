import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { PackageDetailsData } from '../../../services/packageDetailsService';

/** Custom element tag name for package badges component */
export const PACKAGE_BADGES_TAG = 'package-badges' as const;

/**
 * Display package status badges (verified, deprecated, vulnerable).
 */
@customElement(PACKAGE_BADGES_TAG)
export class PackageBadges extends LitElement {
  @property({ type: Boolean })
  verified = false;

  @property({ type: Boolean })
  deprecated = false;

  @property({ type: Boolean })
  hasVulnerabilities = false;

  static override styles = css`
    :host {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.25rem 0.5rem;
      border-radius: 3px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .badge:focus {
      outline: 2px solid var(--vscode-focusBorder);
      outline-offset: 2px;
    }

    .verified {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }

    .deprecated {
      background: var(--vscode-inputValidation-warningBackground);
      color: var(--vscode-inputValidation-warningForeground);
    }

    .vulnerable {
      background: var(--vscode-inputValidation-errorBackground);
      color: var(--vscode-inputValidation-errorForeground);
    }

    .icon {
      font-size: 12px;
    }
  `;

  override render() {
    return html`
      ${this.verified
        ? html`
            <span class="badge verified" role="status" aria-label="Verified publisher" title="Verified publisher">
              <span class="icon">✓</span>
              <span>Verified</span>
            </span>
          `
        : ''}
      ${this.deprecated
        ? html`
            <span
              class="badge deprecated"
              role="status"
              aria-label="Deprecated package"
              title="This package is deprecated"
            >
              <span class="icon">⚠️</span>
              <span>Deprecated</span>
            </span>
          `
        : ''}
      ${this.hasVulnerabilities
        ? html`
            <span
              class="badge vulnerable"
              role="status"
              aria-label="Security vulnerabilities"
              title="This package has known security vulnerabilities"
            >
              <span class="icon">🛡️</span>
              <span>Vulnerability</span>
            </span>
          `
        : ''}
    `;
  }
}
