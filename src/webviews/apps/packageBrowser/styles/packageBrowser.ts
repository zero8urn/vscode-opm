/**
 * Styles for PackageBrowserApp root component
 */

import { css } from 'lit';

export const appStyles = css`
  :host {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100%;
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background-color: var(--vscode-editor-background);
  }

  .app-header {
    position: sticky;
    top: 0;
    z-index: 1100;
    background-color: var(--vscode-editor-background);
  }

  .app-body {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
  }

  .search-container {
    flex-shrink: 0;
    padding: var(--opm-spacing-sm, 8px) var(--opm-spacing-md, 12px);
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .search-header {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .search-input-wrapper {
    flex: 1 1 260px;
    min-width: 200px;
  }

  .search-input {
    width: 100%;
    padding: 6px 10px;
    font-size: var(--opm-font-size-md, 14px);
    font-family: var(--vscode-font-family);
    color: var(--vscode-input-foreground);
    background-color: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border);
    border-radius: var(--opm-border-radius-sm, 2px);
    outline: none;
    box-sizing: border-box;
  }

  .search-input:focus {
    border-color: var(--vscode-focusBorder);
  }

  .search-input::placeholder {
    color: var(--vscode-input-placeholderForeground);
  }

  .refresh-button {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px;
    width: 32px;
    height: 32px;
    font-size: 16px;
    font-family: var(--vscode-font-family);
    color: var(--vscode-icon-foreground);
    background-color: transparent;
    border: none;
    border-radius: var(--opm-border-radius, 3px);
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .refresh-button:hover {
    background-color: var(--vscode-toolbar-hoverBackground);
  }

  .refresh-button:active {
    opacity: 0.8;
  }

  prerelease-toggle {
    flex: 0 0 auto;
  }

  source-selector {
    flex: 0 0 auto;
  }

  .results-container {
    flex: 1;
    overflow: hidden;
  }

  @media (max-width: 600px) {
    :host {
      --opm-header-height: 72px;
    }

    .search-header {
      align-items: stretch;
    }

    .refresh-button {
      justify-content: center;
    }
  }
`;
