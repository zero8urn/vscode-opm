/**
 * Helper utility for computing theme tokens independent of VS Code APIs.
 * This lets unit tests run without needing VS Code's `vscode` module to be available.
 */
export function computeThemeTokens(): Record<string, string> {
  return {
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
}

export default computeThemeTokens;
