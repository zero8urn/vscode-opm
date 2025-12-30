import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

/** Custom element tag name for README viewer component */
export const README_VIEWER_TAG = 'readme-viewer' as const;

/**
 * Renders sanitized README HTML content.
 * HTML is pre-sanitized by PackageDetailsService, safe to render.
 */
@customElement(README_VIEWER_TAG)
export class ReadmeViewer extends LitElement {
  @property({ type: String })
  html: string | null = null;

  @property({ type: Boolean })
  loading = false;

  @property({ type: String })
  projectUrl?: string;

  static override styles = css`
    :host {
      display: block;
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      color: var(--vscode-descriptionForeground);
    }

    .empty {
      padding: 2rem;
      text-align: center;
      color: var(--vscode-descriptionForeground);
    }

    .empty-message {
      margin-bottom: 1rem;
    }

    .project-link {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
    }

    .project-link:hover {
      text-decoration: underline;
    }

    .readme-content {
      padding: 1rem;
      overflow-wrap: break-word;
    }

    /* README content styling with VS Code theme variables */
    .readme-content :is(h1, h2, h3, h4, h5, h6) {
      color: var(--vscode-foreground);
      margin-top: 1.5em;
      margin-bottom: 0.5em;
      font-weight: 600;
    }

    .readme-content h1 {
      font-size: 2em;
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 0.3em;
    }

    .readme-content h2 {
      font-size: 1.5em;
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 0.3em;
    }

    .readme-content h3 {
      font-size: 1.25em;
    }

    .readme-content p {
      margin: 0.5em 0;
      line-height: 1.6;
    }

    .readme-content code {
      background: var(--vscode-textCodeBlock-background);
      padding: 0.2em 0.4em;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
      font-size: 0.9em;
    }

    .readme-content pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 1em;
      border-radius: 4px;
      overflow-x: auto;
      margin: 1em 0;
    }

    .readme-content pre code {
      background: none;
      padding: 0;
    }

    .readme-content a {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
    }

    .readme-content a:hover {
      text-decoration: underline;
    }

    /* External link icon */
    .readme-content a[href^='http']::after {
      content: ' ↗';
      font-size: 0.8em;
      color: var(--vscode-descriptionForeground);
    }

    .readme-content table {
      border-collapse: collapse;
      margin: 1em 0;
      width: 100%;
    }

    .readme-content th,
    .readme-content td {
      border: 1px solid var(--vscode-panel-border);
      padding: 0.5em;
      text-align: left;
    }

    .readme-content th {
      background: var(--vscode-input-background);
      font-weight: 600;
    }

    .readme-content img {
      max-width: 100%;
      height: auto;
    }

    .readme-content ul,
    .readme-content ol {
      margin: 0.5em 0;
      padding-left: 2em;
    }

    .readme-content li {
      margin: 0.25em 0;
    }

    .readme-content blockquote {
      border-left: 4px solid var(--vscode-panel-border);
      padding-left: 1em;
      margin: 1em 0;
      color: var(--vscode-descriptionForeground);
    }
  `;

  override render() {
    if (this.loading) {
      return html` <div class="loading">Loading README...</div> `;
    }

    if (!this.html) {
      return html`
        <div class="empty">
          <div class="empty-message">No README available for this package.</div>
          ${this.projectUrl
            ? html`
                <a href="${this.projectUrl}" class="project-link" target="_blank" rel="noopener noreferrer">
                  Visit the project site for more information
                </a>
              `
            : ''}
        </div>
      `;
    }

    return html` <div class="readme-content">${unsafeHTML(this.html)}</div> `;
  }
}
