import * as vscode from 'vscode';
import { computeThemeTokens as computeTokens } from './themeTokens';

export type ThemeKind = 'light' | 'dark' | 'high-contrast' | 'high-contrast-light';

export interface ThemeUpdateMessage {
  type: 'notification';
  name: 'themeChanged';
  args: {
    kind: ThemeKind;
    tokens: Record<string, string>;
  };
}

/**
 * ThemeService posts theme updates to registered webviews. It computes a list
 * of CSS custom properties that webviews can apply. For now, this service
 * uses CSS var() references to VS Code design tokens so webviews can render
 * correctly regardless of the actual theme colors.
 */
export class ThemeService implements vscode.Disposable {
  private static _instance: ThemeService | undefined;
  public static get instance(): ThemeService {
    if (!this._instance) this._instance = new ThemeService();
    return this._instance;
  }

  private registeredWebviews = new Set<vscode.Webview>();
  private disposable?: vscode.Disposable;
  private debounceTimer?: NodeJS.Timeout;

  private constructor() {
    // Immediately post initial theme tokens if required when a webview registers.
    this.disposable = vscode.window.onDidChangeActiveColorTheme(() => this.onThemeChanged());
  }

  registerWebview(webviewOrPanel: vscode.Webview | vscode.WebviewPanel) {
    const webview = this.toWebview(webviewOrPanel);
    this.registeredWebviews.add(webview);
    // Send initial tokens right away
    this.postThemeUpdateTo(webview);
  }

  unregisterWebview(webviewOrPanel: vscode.Webview | vscode.WebviewPanel) {
    const webview = this.toWebview(webviewOrPanel);
    this.registeredWebviews.delete(webview);
  }

  dispose() {
    if (this.disposable) this.disposable.dispose();
    this.registeredWebviews.clear();
  }

  private toWebview(webviewOrPanel: vscode.Webview | vscode.WebviewPanel) {
    // Accept either a Webview or a WebviewPanel
    return ('webview' in webviewOrPanel ? webviewOrPanel.webview : webviewOrPanel) as vscode.Webview;
  }

  private onThemeChanged() {
    // Debounce rapid theme changes (e.g., when user cycles quickly)
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.postThemeUpdate();
    }, 50);
  }

  private postThemeUpdate() {
    const kind = this.mapKind(vscode.window.activeColorTheme.kind);
    const tokens = this.computeThemeTokens();
    const msg: ThemeUpdateMessage = { type: 'notification', name: 'themeChanged', args: { kind, tokens } };
    this.registeredWebviews.forEach(webview => {
      try {
        webview.postMessage(msg);
      } catch (e) {
        // ignore webview errors; webview might already be disposed
        // We'll also remove it from the list to avoid future errors
        this.registeredWebviews.delete(webview);
      }
    });
  }

  private postThemeUpdateTo(webview: vscode.Webview) {
    const kind = this.mapKind(vscode.window.activeColorTheme.kind);
    const tokens = this.computeThemeTokens();
    const msg: ThemeUpdateMessage = { type: 'notification', name: 'themeChanged', args: { kind, tokens } };
    try {
      webview.postMessage(msg);
    } catch (e) {
      // ignore
    }
  }

  /**
   * Compute a map of tokens for use inside webviews. This returns names -> CSS expressions
   * using `var(--vscode-*)` tokens so the webview can apply CSS custom properties
   * directly. These tokens map closely to common UI elements used in webviews.
   */
  private computeThemeTokens(): Record<string, string> {
    const tokens: Record<string, string> = {
      '--vscode-editor-background': 'var(--vscode-editor-background)',
      '--vscode-editor-foreground': 'var(--vscode-editor-foreground)',
      '--vscode-editor-selectionBackground': 'var(--vscode-editor-selectionBackground)',
      '--vscode-editor-selectionHighlightBackground': 'var(--vscode-editor-selectionHighlightBackground)',
      '--vscode-input-background': 'var(--vscode-input-background)',
      '--vscode-input-foreground': 'var(--vscode-input-foreground)',
      '--vscode-button-background': 'var(--vscode-button-background)',
      '--vscode-button-foreground': 'var(--vscode-button-foreground)',
      '--vscode-badge-background': 'var(--vscode-badge-background)',
      '--vscode-badge-foreground': 'var(--vscode-badge-foreground)',
      '--vscode-list-hoverBackground': 'var(--vscode-list-hoverBackground)',
      '--vscode-list-activeSelectionBackground': 'var(--vscode-list-activeSelectionBackground)',
      '--vscode-list-focusBackground': 'var(--vscode-list-focusBackground)',
      '--vscode-quick-input-background': 'var(--vscode-quick-input-background)',
      '--vscode-sideBar-background': 'var(--vscode-sideBar-background)',
      '--vscode-editorGroup-border': 'var(--vscode-editorGroup-border)',
      '--vscode-activityBar-background': 'var(--vscode-activityBar-background)',
      '--vscode-editor-errorForeground': 'var(--vscode-editor-errorForeground)',
      '--vscode-editor-warningForeground': 'var(--vscode-editor-warningForeground)',
      '--vscode-editorWidget-background': 'var(--vscode-editorWidget-background)',
    };
    return tokens;
  }

  private mapKind(kind: vscode.ColorThemeKind): ThemeKind {
    switch (kind) {
      case vscode.ColorThemeKind.Dark:
        return 'dark';
      case vscode.ColorThemeKind.HighContrast:
        return 'high-contrast';
      case vscode.ColorThemeKind.Light:
      default:
        return 'light';
    }
  }

}

/**
 * Helper exported for tests and for webviews that might want to compute tokens
 * without instantiating the service. This mirrors the private computeThemeTokens
 * used by ThemeService.instance.postThemeUpdate().
 */
// NOTE: computeThemeTokens has been moved to `themeTokens.ts` for testability
export { computeTokens as computeThemeTokens } from './themeTokens';

export default ThemeService;
