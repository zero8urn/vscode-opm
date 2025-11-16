import { expect, test, describe } from 'bun:test';
import { computeThemeTokens } from '../themeTokens';

describe('ThemeService tokens', () => {
  test('computeThemeTokens returns at least 20 tokens', () => {
    const tokens = computeThemeTokens();
    const keys = Object.keys(tokens);
    expect(keys.length >= 20).toBe(true);
  });

  test('should include common tokens', () => {
    const tokens = computeThemeTokens();
    expect(tokens['--vscode-editor-background']).toBeDefined();
    expect(tokens['--vscode-button-background']).toBeDefined();
    expect(tokens['--vscode-list-hoverBackground']).toBeDefined();
  });
});
