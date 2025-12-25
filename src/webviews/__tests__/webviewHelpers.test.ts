import { describe, test, expect } from 'bun:test';
import {
  createNonce,
  getWebviewUri,
  buildCspMeta,
  scriptTag,
  styleTag,
  buildHtmlTemplate,
  isWebviewMessage,
} from '../webviewHelpers';

describe('webviewHelpers', () => {
  describe('createNonce', () => {
    test('returns a non-empty string', () => {
      const nonce = createNonce();
      expect(nonce).toBeTruthy();
      expect(typeof nonce).toBe('string');
      expect(nonce.length).toBeGreaterThan(0);
    });

    test('returns unique values on repeated calls', () => {
      const nonce1 = createNonce();
      const nonce2 = createNonce();
      expect(nonce1).not.toBe(nonce2);
    });

    test('nonce length is at least 16 characters (base64 encoded)', () => {
      const nonce = createNonce();
      // 16 bytes base64 encoded = 24 characters (with padding)
      expect(nonce.length).toBeGreaterThanOrEqual(16);
    });
  });

  describe('getWebviewUri', () => {
    test('returns a URI with vscode-webview-resource scheme', () => {
      const mockWebview = {
        asWebviewUri: (uri: any) => ({
          scheme: 'vscode-webview-resource',
          toString: () => `vscode-webview-resource://authority${uri.path}`,
        }),
      } as any;

      const mockExtensionUri = { path: '/extension' } as any;

      const mockUriUtils = {
        joinPath: (base: any, ...segments: string[]) => ({
          path: `${base.path}/${segments.join('/')}`,
        }),
      } as any;

      const result = getWebviewUri(mockWebview, mockExtensionUri, mockUriUtils, 'out', 'main.js');
      expect(result.scheme).toBe('vscode-webview-resource');
    });

    test('path segments are correctly joined', () => {
      const mockWebview = {
        asWebviewUri: (uri: any) => ({
          scheme: 'vscode-webview-resource',
          path: uri.path,
          toString: () => `vscode-webview-resource://authority${uri.path}`,
        }),
      } as any;

      const mockExtensionUri = { path: '/extension' } as any;

      const mockUriUtils = {
        joinPath: (base: any, ...segments: string[]) => ({
          path: `${base.path}/${segments.join('/')}`,
        }),
      } as any;

      const result = getWebviewUri(mockWebview, mockExtensionUri, mockUriUtils, 'out', 'webview', 'main.js');
      expect(result.toString()).toContain('main.js');
    });
  });

  describe('buildCspMeta', () => {
    test('includes default-src none', () => {
      const mockWebview = { cspSource: 'vscode-webview-resource:' } as any;
      const nonce = 'test-nonce-123';
      const result = buildCspMeta(nonce, mockWebview);

      expect(result).toContain("default-src 'none'");
    });

    test('includes script-src with nonce', () => {
      const mockWebview = { cspSource: 'vscode-webview-resource:' } as any;
      const nonce = 'test-nonce-123';
      const result = buildCspMeta(nonce, mockWebview);

      expect(result).toContain(`script-src 'nonce-${nonce}'`);
    });

    test('includes img-src https data and cspSource', () => {
      const mockWebview = { cspSource: 'vscode-webview-resource:' } as any;
      const nonce = 'test-nonce-123';
      const result = buildCspMeta(nonce, mockWebview);

      expect(result).toContain('img-src https: data: vscode-webview-resource:');
    });

    test('includes style-src unsafe-inline and cspSource', () => {
      const mockWebview = { cspSource: 'vscode-webview-resource:' } as any;
      const nonce = 'test-nonce-123';
      const result = buildCspMeta(nonce, mockWebview);

      expect(result).toContain("style-src 'unsafe-inline' vscode-webview-resource:");
    });

    test('output is a valid meta tag', () => {
      const mockWebview = { cspSource: 'vscode-webview-resource:' } as any;
      const nonce = 'test-nonce-123';
      const result = buildCspMeta(nonce, mockWebview);

      expect(result).toMatch(/^<meta http-equiv="Content-Security-Policy" content=".+">$/);
    });
  });

  describe('HTML tag helpers', () => {
    describe('scriptTag', () => {
      test('includes nonce attribute', () => {
        const mockUri = { toString: () => 'vscode-webview-resource://test/script.js' } as any;
        const nonce = 'test-nonce';
        const result = scriptTag(mockUri, nonce);

        expect(result).toContain(`nonce="${nonce}"`);
      });

      test('uses src from URI', () => {
        const mockUri = { toString: () => 'vscode-webview-resource://test/script.js' } as any;
        const nonce = 'test-nonce';
        const result = scriptTag(mockUri, nonce);

        expect(result).toContain('src="vscode-webview-resource://test/script.js"');
      });
    });

    describe('styleTag', () => {
      test('generates valid link rel stylesheet', () => {
        const mockUri = { toString: () => 'vscode-webview-resource://test/style.css' } as any;
        const result = styleTag(mockUri);

        expect(result).toContain('<link rel="stylesheet"');
        expect(result).toContain('href="vscode-webview-resource://test/style.css"');
      });
    });
  });

  describe('buildHtmlTemplate', () => {
    test('includes DOCTYPE and basic structure', () => {
      const mockWebview = { cspSource: 'vscode-webview-resource:' } as any;
      const nonce = createNonce();

      const result = buildHtmlTemplate({
        title: 'Test',
        bodyHtml: '<div>Content</div>',
        nonce,
        webview: mockWebview,
      });

      expect(result).toContain('<!DOCTYPE html>');
      expect(result).toContain('<html lang="en">');
      expect(result).toContain('</html>');
    });

    test('body HTML is sanitized', () => {
      const mockWebview = { cspSource: 'vscode-webview-resource:' } as any;
      const nonce = createNonce();

      const result = buildHtmlTemplate({
        title: 'Test',
        bodyHtml: '<div>Safe</div><script>alert("bad")</script>',
        nonce,
        webview: mockWebview,
      });

      expect(result).toContain('<div>Safe</div>');
      expect(result).not.toContain('<script>alert');
    });

    test('CSP meta tag is included in head', () => {
      const mockWebview = { cspSource: 'vscode-webview-resource:' } as any;
      const nonce = createNonce();

      const result = buildHtmlTemplate({
        title: 'Test',
        bodyHtml: '<div>Content</div>',
        nonce,
        webview: mockWebview,
      });

      expect(result).toContain('<meta http-equiv="Content-Security-Policy"');
      expect(result.indexOf('Content-Security-Policy')).toBeLessThan(result.indexOf('</head>'));
    });

    test('scripts are appended with nonce', () => {
      const mockWebview = { cspSource: 'vscode-webview-resource:' } as any;
      const nonce = 'test-nonce';
      const mockScriptUri = { toString: () => 'vscode-webview-resource://test/script.js' } as any;

      const result = buildHtmlTemplate({
        title: 'Test',
        bodyHtml: '<div>Content</div>',
        nonce,
        webview: mockWebview,
        scripts: [mockScriptUri],
      });

      expect(result).toContain(`<script type="module" nonce="${nonce}"`);
      expect(result).toContain('src="vscode-webview-resource://test/script.js"');
    });

    test('styles are included in head', () => {
      const mockWebview = { cspSource: 'vscode-webview-resource:' } as any;
      const nonce = createNonce();
      const mockStyleUri = { toString: () => 'vscode-webview-resource://test/style.css' } as any;

      const result = buildHtmlTemplate({
        title: 'Test',
        bodyHtml: '<div>Content</div>',
        nonce,
        webview: mockWebview,
        styles: [mockStyleUri],
      });

      expect(result).toContain('<link rel="stylesheet"');
      expect(result).toContain('href="vscode-webview-resource://test/style.css"');
      expect(result.indexOf('stylesheet')).toBeLessThan(result.indexOf('</head>'));
    });
  });

  describe('isWebviewMessage', () => {
    test('returns true for valid message', () => {
      const msg = { type: 'test' };
      expect(isWebviewMessage(msg)).toBe(true);
    });

    test('returns false for null', () => {
      expect(isWebviewMessage(null)).toBe(false);
    });

    test('returns false for undefined', () => {
      expect(isWebviewMessage(undefined)).toBe(false);
    });

    test('returns false for arrays', () => {
      expect(isWebviewMessage([])).toBe(false);
    });

    test('returns false for primitives', () => {
      expect(isWebviewMessage('string')).toBe(false);
      expect(isWebviewMessage(123)).toBe(false);
      expect(isWebviewMessage(true)).toBe(false);
    });

    test('returns false for objects without type property', () => {
      expect(isWebviewMessage({ data: 'value' })).toBe(false);
    });

    test('returns false when type is not a string', () => {
      expect(isWebviewMessage({ type: 123 })).toBe(false);
      expect(isWebviewMessage({ type: null })).toBe(false);
      expect(isWebviewMessage({ type: {} })).toBe(false);
    });
  });
});
