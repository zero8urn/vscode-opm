/**
 * Styles for Package Details Panel component
 */

import { css } from 'lit';

export const detailsPanelStyles = css`
  :host {
    display: block;
    position: fixed;
    top: var(--opm-header-height, 120px);
    right: 0;
    bottom: 0;
    width: 60%;
    min-width: 400px;
    max-width: 600px;
    z-index: 1000;
    transform: translateX(100%);
    transition: transform 200ms ease-out;
    box-shadow: -4px 0 12px rgba(0, 0, 0, 0.3);
  }

  :host([open]) {
    transform: translateX(0);
  }

  .backdrop {
    display: none;
    position: fixed;
    top: var(--opm-header-height, 120px);
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: -1;
  }

  :host([open]) .backdrop {
    display: block;
  }

  .panel {
    position: relative;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--vscode-editor-background);
    color: var(--vscode-foreground);
    z-index: 1;
  }

  .header {
    flex-shrink: 0;
    padding: 1rem;
    border-bottom: 1px solid var(--vscode-panel-border);
    background: var(--vscode-editor-background);
  }

  .header-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }

  .package-icon {
    font-size: 20px;
    flex-shrink: 0;
    width: 20px;
    height: 20px;
  }

  .package-icon[src] {
    object-fit: contain;
  }

  .package-name {
    flex: 1;
    font-size: 16px;
    font-weight: 600;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .verified-badge {
    color: var(--vscode-charts-green);
    font-size: 14px;
    title: 'Verified Publisher';
  }

  .close-button {
    flex-shrink: 0;
    background: none;
    border: none;
    color: var(--vscode-foreground);
    font-size: 18px;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 3px;
    line-height: 1;
  }

  .close-button:hover {
    background: var(--vscode-toolbar-hoverBackground);
  }

  .close-button:focus {
    outline: 2px solid var(--vscode-focusBorder);
    outline-offset: 2px;
  }

  .controls-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .source-badge {
    flex-shrink: 0;
    padding: 3px 8px;
    font-size: 11px;
    font-family: var(--vscode-font-family);
    color: var(--vscode-badge-foreground);
    background-color: var(--vscode-badge-background);
    border-radius: 3px;
    white-space: nowrap;
  }

  .content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .warning-banner {
    padding: 0.75rem 1rem;
    margin: 0;
    border-bottom: 1px solid var(--vscode-panel-border);
    border-left: 4px solid;
  }

  .warning-banner.deprecation {
    background: var(--vscode-inputValidation-warningBackground);
    border-left-color: var(--vscode-inputValidation-warningBorder);
    color: var(--vscode-inputValidation-warningForeground);
  }

  .warning-banner.vulnerability {
    background: var(--vscode-inputValidation-errorBackground);
    border-left-color: var(--vscode-inputValidation-errorBorder);
    color: var(--vscode-inputValidation-errorForeground);
  }

  .warning-title {
    font-weight: 600;
    font-size: 13px;
    margin-bottom: 0.25rem;
  }

  .warning-content {
    font-size: 12px;
  }

  .details-list {
    list-style: none;
    padding: 0;
    margin: 0;
    font-size: 13px;
    line-height: 1.8;
  }

  .details-list li {
    margin-bottom: 0.5rem;
  }

  .detail-label {
    color: var(--vscode-descriptionForeground);
    margin-right: 0.5rem;
  }

  .detail-value {
    color: var(--vscode-foreground);
  }

  .detail-link {
    color: var(--vscode-textLink-foreground);
    text-decoration: none;
    cursor: pointer;
  }

  .detail-link:hover {
    text-decoration: underline;
  }
`;
