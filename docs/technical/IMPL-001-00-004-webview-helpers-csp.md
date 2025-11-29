# IMPL-001-00-004-webview-helpers-csp

**Story**: [STORY-001-00-004](../stories/STORY-001-00-004-webview-helpers-csp.md)  
**Feature**: [FEAT-001-00-foundations](../features/FEAT-001-00-foundations.md)  
**Created**: 2025-11-29  
**Last Updated**: 2025-11-29

## Summary

Implement minimal webview security utilities to generate Content Security Policy headers, cryptographic nonces, webview-safe resource URIs, and HTML templates that integrate with the existing `sanitizer.ts`. This provides a lightweight, reusable API for building secure webviews without duplicating sanitization logic.

**Key Goals:**
- Generate unique nonces per webview instance for CSP script-src enforcement
- Convert extension-local file paths to webview-safe URIs using VS Code's `asWebviewUri()`
- Build strict CSP meta tags that block inline scripts and restrict resource origins
- Provide composable HTML template helpers that integrate the sanitizer
- Add type-safe message validation for webview IPC

**Non-Goals:**
- Replace or reimplement the existing HTML sanitizer
- Build a full webview framework or component library
- Handle message routing or command dispatch (defer to webview hosts)

---

## Implementation Checklist

- [ ] <a href="#nonce-generation">Implement cryptographic nonce generation</a>
- [ ] <a href="#uri-helpers">Implement webview URI conversion helper</a>
- [ ] <a href="#csp-builder">Implement CSP meta tag builder</a>
- [ ] <a href="#html-helpers">Implement HTML tag helpers (script, style)</a>
- [ ] <a href="#template-builder">Implement HTML template builder with sanitizer integration</a>
- [ ] <a href="#message-validation">Implement message type guard for IPC validation</a>
- [ ] <a href="#unit-tests">Add unit tests for all helpers</a>
- [ ] <a href="#integration">Update sampleWebview.ts to use helpers</a>

---

## <a id="nonce-generation"></a>Nonce Generation

**File**: `src/webviews/webviewHelpers.ts`

Generate a cryptographically-strong random nonce for each webview instance to enable CSP `script-src 'nonce-<value>'` without allowing `'unsafe-inline'`.

### API

```typescript
/**
 * Generate a cryptographic nonce for CSP script-src.
 * Call once per webview load; reuse the nonce for all scripts in that webview.
 */
export function createNonce(): string;
```

### Implementation Notes

- Use Node.js `crypto.randomBytes(16).toString('base64')` for sufficient entropy
- Length: 16 bytes (128 bits) → 24 base64 characters is adequate
- Call once during webview HTML generation; pass result to all script tags

### Example

```typescript
const nonce = createNonce(); // "a3d8f2e1b9c7..."
// Use in CSP: script-src 'nonce-a3d8f2e1b9c7...'
// Use in script tags: <script nonce="a3d8f2e1b9c7...">...</script>
```

---

## <a id="uri-helpers"></a>Webview URI Conversion

**File**: `src/webviews/webviewHelpers.ts`

Convert extension-local file paths to webview-safe `vscode-webview-resource:` URIs using the VS Code Webview API.

### API

```typescript
/**
 * Convert an extension-relative path to a webview-safe URI.
 * 
 * @param webview - The webview panel instance
 * @param extensionUri - The extension root URI (from context.extensionUri)
 * @param pathSegments - Path segments relative to extension root (e.g., 'media', 'script.js')
 */
export function getWebviewUri(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  ...pathSegments: string[]
): vscode.Uri;
```

### Implementation Notes

- Use `vscode.Uri.joinPath(extensionUri, ...pathSegments)` to build absolute path
- Call `webview.asWebviewUri(localUri)` to convert to webview-safe scheme
- Return the transformed URI for use in `src`, `href` attributes

### Example

```typescript
const scriptUri = getWebviewUri(panel.webview, context.extensionUri, 'out', 'webview.js');
// Returns: vscode-webview-resource://…/out/webview.js
```

---

## <a id="csp-builder"></a>CSP Meta Tag Builder

**File**: `src/webviews/webviewHelpers.ts`

Generate a strict Content Security Policy `<meta>` tag that enforces nonce-based script execution and restricts resource origins.

### API

```typescript
/**
 * Build a CSP meta tag for webview security.
 * 
 * @param nonce - The nonce generated for this webview instance
 * @param webview - The webview panel (used to get cspSource for local resources)
 */
export function buildCspMeta(nonce: string, webview: vscode.Webview): string;
```

### Implementation Notes

**Policy Directives:**
- `default-src 'none'` — deny all by default
- `img-src https: data: ${webview.cspSource}` — allow HTTPS images, data URIs, and webview resources
- `style-src 'unsafe-inline' ${webview.cspSource}` — allow inline styles (VS Code webviews require this) and local stylesheets
- `script-src 'nonce-${nonce}'` — only allow scripts with matching nonce (blocks all inline without nonce)
- `font-src ${webview.cspSource}` — allow local fonts
- `connect-src https:` — allow HTTPS fetch/XHR (for API calls if needed)

**Output Format:**
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data: vscode-webview-resource:; style-src 'unsafe-inline' vscode-webview-resource:; script-src 'nonce-abc123'; font-src vscode-webview-resource:; connect-src https:">
```

### Security Rationale

- **No `'unsafe-inline'` for scripts** — prevents XSS via injected event handlers or inline scripts
- **Nonce-based execution** — only scripts with correct nonce can run (nonce changes per load)
- **`'unsafe-inline'` for styles** — VS Code webviews inject theme styles inline; blocking this breaks theming
- **`https:` for images** — package icons from nuget.org use HTTPS URLs
- **`data:` for images** — fallback for inline SVG/base64 images if needed

---

## <a id="html-helpers"></a>HTML Tag Helpers

**File**: `src/webviews/webviewHelpers.ts`

Generate `<script>` and `<link>` tags with correct nonce and URI handling.

### API

```typescript
/**
 * Generate a script tag with nonce for CSP compliance.
 */
export function scriptTag(src: vscode.Uri, nonce: string): string;

/**
 * Generate a stylesheet link tag.
 */
export function styleTag(href: vscode.Uri): string;
```

### Implementation Notes

**Script Tag:**
```typescript
export function scriptTag(src: vscode.Uri, nonce: string): string {
  return `<script nonce="${nonce}" src="${src.toString()}"></script>`;
}
```

**Style Tag:**
```typescript
export function styleTag(href: vscode.Uri): string {
  return `<link rel="stylesheet" href="${href.toString()}">`;
}
```

### Example

```typescript
const scriptUri = getWebviewUri(panel.webview, context.extensionUri, 'out', 'webview.js');
const styleUri = getWebviewUri(panel.webview, context.extensionUri, 'media', 'styles.css');
const nonce = createNonce();

const scriptHtml = scriptTag(scriptUri, nonce);
// <script nonce="abc123" src="vscode-webview-resource://…/out/webview.js"></script>

const styleHtml = styleTag(styleUri);
// <link rel="stylesheet" href="vscode-webview-resource://…/media/styles.css">
```

---

## <a id="template-builder"></a>HTML Template Builder

**File**: `src/webviews/webviewHelpers.ts`

Compose a complete HTML document with CSP, sanitized body content, and script/style tags.

### API

```typescript
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
export function buildHtmlTemplate(options: HtmlTemplateOptions): string;
```

### Implementation Notes

**Template Structure:**
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${buildCspMeta(nonce, webview)}
  <title>${title}</title>
  ${styles.map(s => styleTag(s)).join('\n')}
</head>
<body>
  ${sanitizeHtml(bodyHtml, sanitizerOptions)}
  ${scripts.map(s => scriptTag(s, nonce)).join('\n')}
</body>
</html>
```

**Integration with Sanitizer:**
- Import `sanitizeHtml` from `./sanitizer`
- Default sanitizer options: `{ allowImages: true }` (package READMEs may contain images)
- Allow caller to override sanitizer options via `sanitizerOptions` parameter

### Example

```typescript
import { buildHtmlTemplate, createNonce, getWebviewUri } from './webviewHelpers';

const nonce = createNonce();
const scriptUri = getWebviewUri(panel.webview, context.extensionUri, 'out', 'webview.js');
const styleUri = getWebviewUri(panel.webview, context.extensionUri, 'media', 'main.css');

const html = buildHtmlTemplate({
  title: 'NuGet Package Browser',
  bodyHtml: '<div id="app">Loading...</div>',
  nonce,
  webview: panel.webview,
  scripts: [scriptUri],
  styles: [styleUri],
  sanitizerOptions: { allowImages: true },
});

panel.webview.html = html;
```

---

## <a id="message-validation"></a>Message Type Guard

**File**: `src/webviews/webviewHelpers.ts`

Provide a type guard to validate incoming webview messages before processing.

### API

```typescript
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
export function isWebviewMessage(msg: unknown): msg is WebviewMessage;
```

### Implementation Notes

**Minimal Validation:**
```typescript
export function isWebviewMessage(msg: unknown): msg is WebviewMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    typeof (msg as { type: unknown }).type === 'string'
  );
}
```

**Usage Pattern:**
```typescript
panel.webview.onDidReceiveMessage((msg) => {
  if (!isWebviewMessage(msg)) {
    logger.warn('Invalid webview message', msg);
    return;
  }
  
  // msg.type is now string; safe to switch on
  switch (msg.type) {
    case 'search':
      // handle search
      break;
    // ...
  }
});
```

**Extension Point:**
- Define specific message types by extending `WebviewMessage`
- Add more specific type guards in webview hosts if needed

---

## <a id="unit-tests"></a>Unit Tests

**File**: `src/webviews/__tests__/webviewHelpers.test.ts`

Test all helpers with Bun's test runner.

### Test Coverage

**Nonce Generation:**
- [ ] `createNonce()` returns a non-empty string
- [ ] `createNonce()` returns unique values on repeated calls
- [ ] Nonce length is at least 16 characters (base64 encoded)

**URI Conversion:**
- [ ] `getWebviewUri()` returns a URI with `vscode-webview-resource` scheme
- [ ] Path segments are correctly joined
- [ ] Works with nested paths (e.g., `'out', 'webview', 'main.js'`)

**CSP Builder:**
- [ ] `buildCspMeta()` includes `default-src 'none'`
- [ ] CSP includes `script-src 'nonce-<value>'` with provided nonce
- [ ] CSP includes `img-src https: data: <cspSource>`
- [ ] CSP includes `style-src 'unsafe-inline' <cspSource>`
- [ ] Output is a valid `<meta http-equiv="Content-Security-Policy" ...>` tag

**HTML Tag Helpers:**
- [ ] `scriptTag()` includes nonce attribute
- [ ] `scriptTag()` uses `src` from URI
- [ ] `styleTag()` generates valid `<link rel="stylesheet">`

**Template Builder:**
- [ ] `buildHtmlTemplate()` includes DOCTYPE and basic structure
- [ ] Body HTML is sanitized (scripts removed)
- [ ] CSP meta tag is included in `<head>`
- [ ] Scripts are appended with nonce
- [ ] Styles are included in `<head>`

**Message Validation:**
- [ ] `isWebviewMessage()` returns true for `{ type: 'test' }`
- [ ] Returns false for `null`, `undefined`, arrays, primitives
- [ ] Returns false for objects without `type` property
- [ ] Returns false when `type` is not a string

### Example Test

```typescript
import { describe, test, expect } from 'bun:test';
import { createNonce, buildCspMeta, isWebviewMessage } from '../webviewHelpers';

describe('webviewHelpers', () => {
  describe('createNonce', () => {
    test('generates non-empty string', () => {
      const nonce = createNonce();
      expect(nonce).toBeTruthy();
      expect(typeof nonce).toBe('string');
      expect(nonce.length).toBeGreaterThan(16);
    });

    test('generates unique values', () => {
      const nonce1 = createNonce();
      const nonce2 = createNonce();
      expect(nonce1).not.toBe(nonce2);
    });
  });

  describe('isWebviewMessage', () => {
    test('validates message with type', () => {
      expect(isWebviewMessage({ type: 'test' })).toBe(true);
      expect(isWebviewMessage({ type: 'search', query: 'foo' })).toBe(true);
    });

    test('rejects invalid messages', () => {
      expect(isWebviewMessage(null)).toBe(false);
      expect(isWebviewMessage(undefined)).toBe(false);
      expect(isWebviewMessage('string')).toBe(false);
      expect(isWebviewMessage({})).toBe(false);
      expect(isWebviewMessage({ type: 123 })).toBe(false);
    });
  });

  // Additional tests for CSP, URI, template...
});
```

---

## <a id="integration"></a>Integration with Existing Webviews

**File**: `src/webviews/sampleWebview.ts`

Update the sample webview to demonstrate helper usage.

### Changes Required

**Before (manual HTML construction):**
```typescript
panel.webview.html = `
  <!DOCTYPE html>
  <html>
  <head><title>Sample</title></head>
  <body><h1>Hello</h1></body>
  </html>
`;
```

**After (using helpers):**
```typescript
import { buildHtmlTemplate, createNonce, getWebviewUri } from './webviewHelpers';

const nonce = createNonce();
const scriptUri = getWebviewUri(
  panel.webview,
  context.extensionUri,
  'out',
  'webview.js'
);

panel.webview.html = buildHtmlTemplate({
  title: 'Sample Webview',
  bodyHtml: '<div id="app"><h1>Hello from helpers</h1></div>',
  nonce,
  webview: panel.webview,
  scripts: [scriptUri],
});
```

**Message Handling:**
```typescript
panel.webview.onDidReceiveMessage((msg) => {
  if (!isWebviewMessage(msg)) {
    return;
  }
  
  switch (msg.type) {
    case 'command':
      // handle
      break;
  }
});
```

---

## Security Considerations

### CSP Enforcement
- **Nonce per load**: Generate a fresh nonce on each webview creation/reload to prevent replay attacks
- **No unsafe-eval**: Never add `'unsafe-eval'` to CSP; it enables arbitrary code execution
- **Strict script-src**: Only nonce-based scripts; no inline event handlers (onclick, onerror, etc.)

### URI Handling
- **Always use `asWebviewUri()`**: Never construct `vscode-resource:` URIs manually
- **Validate paths**: Ensure path segments don't escape extension directory (e.g., no `../../../etc/passwd`)

### Sanitization Integration
- **Trust the sanitizer**: Rely on `sanitizer.ts` for all HTML sanitization; don't bypass it
- **Sanitize all external content**: Package READMEs, descriptions, author names, etc.
- **Allow images conditionally**: Default to `allowImages: true` for READMEs, but allow override

### Message Validation
- **Validate all incoming messages**: Use type guard before processing
- **Sanitize message payloads**: If messages contain user input, sanitize before displaying
- **Rate limiting**: Consider adding throttle/debounce for high-frequency messages (search queries, etc.)

---

## Performance Considerations

### Nonce Generation
- **Cost**: Minimal (crypto.randomBytes is fast)
- **Frequency**: Once per webview load (not per message)

### Template Building
- **Cost**: Low (string concatenation + single sanitizer pass)
- **Frequency**: Once per webview load
- **Optimization**: Cache static parts if webview is recreated frequently

### URI Conversion
- **Cost**: Minimal (VS Code API call)
- **Frequency**: Once per resource per webview load
- **Optimization**: Compute URIs once during setup, reuse for template

---

## Testing Checklist

- [ ] Unit tests pass with >80% coverage
- [ ] CSP blocks inline scripts without nonce
- [ ] CSP allows scripts with correct nonce
- [ ] CSP allows HTTPS images and data URIs
- [ ] Sanitizer removes `<script>` tags from body HTML
- [ ] Webview loads resources from extension directory
- [ ] Message validation rejects malformed messages
- [ ] Integration test with sampleWebview.ts works end-to-end

---

## Future Enhancements

**Out of scope for this story, consider for future iterations:**

- **Typed message router**: Build a typed command/notification system on top of base validation
- **Theme-aware CSS helpers**: Generate CSS custom properties from VS Code theme tokens
- **Resource bundler**: Inline small CSS/JS to reduce webview load time
- **CSP violation reporting**: Add `report-uri` directive to log CSP violations for debugging
- **Subresource integrity**: Add SRI hashes for third-party resources if needed

---

## References

- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [Content Security Policy (MDN)](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [VS Code Webview Sample](https://github.com/microsoft/vscode-extension-samples/tree/main/webview-sample)
- [OWASP XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)

---

**Implementation Document ID**: IMPL-001-00-004-webview-helpers-csp  
**Story**: [STORY-001-00-004](../stories/STORY-001-00-004-webview-helpers-csp.md)
