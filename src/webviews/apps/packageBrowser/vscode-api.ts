/**
 * VS Code API singleton for the Package Browser webview.
 *
 * CRITICAL: acquireVsCodeApi() can only be called ONCE per webview.
 * This module ensures we acquire the API once and export it for reuse
 * across all components in the webview.
 */

// Declare VS Code API types
interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare global {
  function acquireVsCodeApi(): VsCodeApi;
}

/**
 * Singleton VS Code API instance.
 *
 * In test environments, acquireVsCodeApi may not be available,
 * so we provide a mock implementation for unit tests.
 */
export const vscode: VsCodeApi =
  typeof acquireVsCodeApi !== 'undefined'
    ? acquireVsCodeApi()
    : {
        postMessage: () => {},
        setState: () => {},
        getState: () => ({}),
      };
