# Webviews — Lifecycle, Security, and IPC

This document explains best practices and implementation details for Webviews in VS Code extensions. It focuses on lifecycle, bundling, security, communication (IPC), and using Lit for structured UI.

## Purpose

Webviews provide rich browser-style UI within VS Code. They run in a sandboxed environment and communicate with the extension host using `postMessage`/`onDidReceiveMessage`.

## Where to place webview code

- `src/webviews/` — host-side controllers, protocol types (`protocol.ts`), and helpers.
- `src/webviews/apps/` — webview app source code (e.g., Lit components) that will be bundled for the browser.

## Lifecycle

- Webview creation: host constructs a WebviewPanel and sets HTML content (usually generated from a template or a bundled entry).
- Lifecycle events: `onDidDispose`, `onDidChangeViewState` should be used to manage resources and update state.
- Reuse vs recreate: prefer reusing panels when appropriate and reset state on show.

## Bundling & assets

- Bundle webview apps separately with a browser target (e.g., via `webpack.config.mjs`).
- Serve local assets using a unique hashed URL (avoid relative file paths) to enable cache-busting.
- Ensure CSP meta tags are set correctly in webview HTML and only allow what is necessary.

## Security

- Always call `acquireVsCodeApi()` from webview scripts and avoid exposing global state.
- Use strict CSP and avoid `unsafe-inline` where possible (use hashed inline scripts if necessary).
- Do not embed secrets or long-lived tokens in webview HTML.
- Sanitize any data rendered into innerHTML; prefer lit-html or Lit which handles safe templating when used correctly.

## IPC / Messaging

- Use a small typed protocol (see `src/webviews/protocol.ts`) that defines the message shapes for requests, commands, notifications, and responses.
- Implement request/response helpers to correlate `id` fields for Promises and to standardize error handling.
- Validate incoming messages and handle unknown message types gracefully.
- Debounce or coalesce frequent updates if host state changes rapidly.

## Host-side controller pattern

- Implement a `WebviewController` class responsible for:
  - Creating and showing the panel
  - Injecting the initial state
  - Wiring message handlers (onDidReceiveMessage)
  - Sending notifications/requests to the webview
  - Disposing of resources on close

## Webview-side client pattern

- Implement a small `ipcClient` wrapper that:
  - Calls `acquireVsCodeApi()` once
  - Provides `request(name, args)` which returns a Promise
  - Provides `onNotification(name, handler)` to react to host pushes

## Using Lit in webviews

- Use Lit for UI components for a small, reactive, and safe templating library.
- Keep components modular and stateless where possible; use a centralized store for global state.
- Use CSS custom properties for theming to integrate with VS Code colors.

## Example flow

1. Host creates webview panel and injects initial state via `webview.postMessage({ type: 'notification', name: 'init', args: { repo: '...' } })`.
2. Webview calls `request('getHistory', { path })` which resolves when the host responds with a result or error.
3. Host sends `notification` messages for repository changes; webview updates UI.

## Testing webviews

- Unit test webview app code ( Lit components ) in isolation using jsdom or a browser test harness.
- Integration tests: use the extension test runner to open the webview and assert messaging and render behavior.

## Best practices

- Keep protocol small and versioned; bump protocol version for breaking changes.
- Minimize initial HTML size and lazy-load heavy components.
- Favor reuse of webview panels instead of creating multiple panels for the same purpose.

---

Created to provide a practical, focused reference for building safe, maintainable, and testable webviews in VS Code extensions.
