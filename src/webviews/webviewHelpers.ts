import type * as vscode from 'vscode';
import type { IVsCodeRuntime } from '../core/vscodeRuntime';
import { randomBytes } from 'crypto';
import { sanitizeHtml } from './sanitizer';
import type { SanitizerOptions } from './sanitizer';

/**
 * Generate a cryptographic nonce for CSP script-src.
 * Call once per webview load; reuse the nonce for all scripts in that webview.
 */
export function createNonce(): string {
  return randomBytes(16).toString('base64');
}

/**
 * URI utilities for webview resource conversion.
 * Injected for testability - use createWebviewUriConverter in production.
 */
export interface IUriUtils {
  joinPath(base: vscode.Uri, ...pathSegments: string[]): vscode.Uri;
}

/**
 * Converts a local file URI to a webview URI.
 */
export function getWebviewUri(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  uriUtils: IUriUtils,
  ...pathSegments: string[]
): vscode.Uri {
  const localUri = uriUtils.joinPath(extensionUri, ...pathSegments);
  return webview.asWebviewUri(localUri);
}

/**
 * Creates a production IUriUtils that delegates to vscode.Uri.
 */
export function createUriUtils(runtime: IVsCodeRuntime): IUriUtils {
  return {
    joinPath: (base, ...segments) => runtime.Uri.joinPath(base, ...segments),
  };
}

/**
 * Build a CSP meta tag for webview security.
 *
 * @param nonce - The nonce generated for this webview instance
 * @param webview - The webview panel (used to get cspSource for local resources)
 */
export function buildCspMeta(nonce: string, webview: vscode.Webview): string {
  const cspSource = webview.cspSource;
  const policy = [
    "default-src 'none'",
    `img-src https: data: ${cspSource}`,
    `style-src 'unsafe-inline' ${cspSource}`,
    `script-src 'nonce-${nonce}'`,
    `font-src ${cspSource}`,
    'connect-src https:',
  ].join('; ');

  return `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
}

/**
 * Generate a script tag with nonce for CSP compliance.
 * Includes type="module" for ES module support.
 */
export function scriptTag(src: vscode.Uri, nonce: string): string {
  return `<script type="module" nonce="${nonce}" src="${src.toString()}"></script>`;
}

/**
 * Generate a stylesheet link tag.
 */
export function styleTag(href: vscode.Uri): string {
  return `<link rel="stylesheet" href="${href.toString()}">`;
}

export interface HtmlTemplateOptions {
  /** Page title */
  title: string;
  /** Body HTML (will be sanitized) */
  bodyHtml: string;
  /** Nonce for CSP */
  nonce: string;
  /** Webview instance for CSP source */
  webview: vscode.Webview;
  /** Script URIs to include */
  scripts?: vscode.Uri[];
  /** Stylesheet URIs to include */
  styles?: vscode.Uri[];
  /** Sanitizer options (default: { allowImages: true }) */
  sanitizerOptions?: SanitizerOptions;
}

/**
 * Build a complete HTML document for a webview with CSP and sanitization.
 */
export function buildHtmlTemplate(options: HtmlTemplateOptions): string {
  const {
    title,
    bodyHtml,
    nonce,
    webview,
    scripts = [],
    styles = [],
    sanitizerOptions = { allowImages: true },
  } = options;

  const sanitizedBody = sanitizeHtml(bodyHtml, sanitizerOptions);
  const styleLinks = styles.map(s => styleTag(s)).join('\n  ');
  const scriptTags = scripts.map(s => scriptTag(s, nonce)).join('\n  ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${buildCspMeta(nonce, webview)}
  <title>${title}</title>
  ${styleLinks}
</head>
<body>
  ${sanitizedBody}
  ${scriptTags}
</body>
</html>`;
}

/**
 * Base webview message shape.
 * Extend this interface for specific message types.
 */
export interface WebviewMessage {
  type: string;
  [key: string]: unknown;
}

/**
 * Type guard to validate incoming webview messages.
 * Checks for required `type` property.
 */
export function isWebviewMessage(msg: unknown): msg is WebviewMessage {
  return typeof msg === 'object' && msg !== null && typeof (msg as { type: unknown }).type === 'string';
}
