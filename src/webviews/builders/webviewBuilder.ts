/**
 * WebviewBuilder — Builder Pattern for Webview HTML Construction.
 *
 * Separates HTML generation logic from webview lifecycle management.
 * Uses the existing buildHtmlTemplate helper with proper CSP and sanitization.
 *
 * @see IMPL-REDESIGN-04-WEBVIEW-MEDIATOR.md
 */

import type * as vscode from 'vscode';
import { buildHtmlTemplate, createNonce } from '../webviewHelpers';
import type { IVsCodeRuntime } from '../../core/vscodeRuntime';

/**
 * Builder for constructing webview HTML with proper security and structure.
 *
 * **Usage:**
 * ```typescript
 * const builder = new WebviewBuilder(extensionUri, webview);
 * const html = builder.buildPackageBrowserHtml();
 * webview.html = html;
 * ```
 */
export class WebviewBuilder {
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly webview: vscode.Webview,
    private readonly runtime?: IVsCodeRuntime,
  ) {}

  /**
   * Build HTML for the Package Browser webview.
   * Loads the bundled Lit component from out/webviews/packageBrowser.js.
   *
   * @returns Complete HTML document with CSP, scripts, and webview app
   */
  buildPackageBrowserHtml(): string {
    const nonce = createNonce();

    const runtime = this.runtime;
    const uriJoin = runtime ? runtime.Uri.joinPath.bind(runtime.Uri) : undefined;

    // Get URI for bundled webview script
    const scriptUri = this.webview.asWebviewUri(
      uriJoin ? uriJoin(this.extensionUri, 'out', 'webviews', 'packageBrowser.js') : this.extensionUri,
    );

    // Build HTML with bundled Lit component
    // Note: Use scripts array instead of inline script to avoid sanitization
    return buildHtmlTemplate({
      title: 'NuGet Package Browser',
      nonce,
      webview: this.webview,
      bodyHtml: '<package-browser-app></package-browser-app>',
      scripts: [scriptUri],
    });
  }

  /**
   * Build error HTML for displaying errors in the webview.
   *
   * @param message - Error message to display (will be sanitized)
   * @returns HTML document with error message
   */
  buildErrorHtml(message: string): string {
    const nonce = createNonce();

    // buildHtmlTemplate already sanitizes bodyHtml
    return buildHtmlTemplate({
      title: 'Error',
      nonce,
      webview: this.webview,
      bodyHtml: `<div class="error" style="padding: 20px; color: var(--vscode-errorForeground);">${message}</div>`,
      scripts: [],
    });
  }
}
