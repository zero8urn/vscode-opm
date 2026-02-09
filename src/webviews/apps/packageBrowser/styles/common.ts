/**
 * Common CSS variables and utilities for Package Browser components
 */

import { css } from 'lit';

export const commonStyles = css`
  :host {
    /* Spacing scale */
    --opm-spacing-xs: 4px;
    --opm-spacing-sm: 8px;
    --opm-spacing-md: 12px;
    --opm-spacing-lg: 16px;
    --opm-spacing-xl: 24px;

    /* Border radius */
    --opm-border-radius: 3px;
    --opm-border-radius-sm: 2px;

    /* Header height */
    --opm-header-height: 56px;

    /* Font sizes */
    --opm-font-size-sm: 12px;
    --opm-font-size-base: 13px;
    --opm-font-size-md: 14px;

    /* Transitions */
    --opm-transition-fast: 100ms ease;
    --opm-transition-normal: 200ms ease;
  }
`;

export const buttonStyles = css`
  button {
    font-family: var(--vscode-font-family);
    cursor: pointer;
    border-radius: var(--opm-border-radius);
    transition: background-color var(--opm-transition-fast), opacity var(--opm-transition-fast);
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  button:active:not(:disabled) {
    opacity: 0.8;
  }
`;

export const iconStyles = css`
  .icon {
    width: 18px;
    height: 18px;
    fill: currentColor;
    display: block;
    flex-shrink: 0;
  }
`;

export const errorStyles = css`
  .error-banner {
    padding: var(--opm-spacing-md) var(--opm-spacing-lg);
    margin: var(--opm-spacing-sm) var(--opm-spacing-md);
    border-radius: var(--opm-border-radius);
    background-color: var(--vscode-inputValidation-errorBackground);
    border: 1px solid var(--vscode-inputValidation-errorBorder);
    color: var(--vscode-errorForeground);
  }

  .error-title {
    font-weight: 600;
    margin-bottom: 6px;
  }

  .error-content {
    font-size: var(--opm-font-size-base);
    line-height: 1.5;
  }

  .auth-hint {
    margin-top: var(--opm-spacing-sm);
    padding: var(--opm-spacing-sm);
    background-color: var(--vscode-textBlockQuote-background);
    border-left: 3px solid var(--vscode-textBlockQuote-border);
    font-size: var(--opm-font-size-sm);
    color: var(--vscode-descriptionForeground);
  }
`;
