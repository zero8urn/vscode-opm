/**
 * Unit tests for version comparison utilities
 */

import { describe, test, expect } from 'bun:test';
import { compareVersions, getVersionIndicator } from '../version-compare.js';

describe('compareVersions', () => {
  test('compares major versions correctly', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0);
  });

  test('compares minor versions correctly', () => {
    expect(compareVersions('1.2.0', '1.1.0')).toBeGreaterThan(0);
    expect(compareVersions('1.1.0', '1.2.0')).toBeLessThan(0);
  });

  test('compares patch versions correctly', () => {
    expect(compareVersions('1.0.2', '1.0.1')).toBeGreaterThan(0);
    expect(compareVersions('1.0.1', '1.0.2')).toBeLessThan(0);
  });

  test('returns 0 for equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('2.5.3', '2.5.3')).toBe(0);
  });

  test('handles versions with v prefix', () => {
    expect(compareVersions('v2.0.0', 'v1.0.0')).toBeGreaterThan(0);
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0);
  });

  test('stable versions are greater than prerelease versions', () => {
    expect(compareVersions('1.0.0', '1.0.0-alpha')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0-beta', '1.0.0')).toBeLessThan(0);
  });

  test('compares prerelease versions lexicographically', () => {
    expect(compareVersions('1.0.0-beta', '1.0.0-alpha')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBeLessThan(0);
    expect(compareVersions('1.0.0-rc1', '1.0.0-rc1')).toBe(0);
  });

  test('handles missing patch version', () => {
    expect(compareVersions('1.2', '1.1')).toBeGreaterThan(0);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
  });
});

describe('getVersionIndicator', () => {
  test('returns empty string when installed version is undefined', () => {
    expect(getVersionIndicator(undefined, '1.0.0')).toBe('');
  });

  test('returns empty string when selected version is undefined', () => {
    expect(getVersionIndicator('1.0.0', undefined)).toBe('');
  });

  test('returns empty string when versions are equal', () => {
    expect(getVersionIndicator('1.0.0', '1.0.0')).toBe('');
    expect(getVersionIndicator('v2.5.3', '2.5.3')).toBe('');
  });

  test('returns upgrade indicator when selected version is higher', () => {
    expect(getVersionIndicator('1.0.0', '2.0.0')).toBe('↑');
    expect(getVersionIndicator('1.5.0', '1.6.0')).toBe('↑');
    expect(getVersionIndicator('1.0.1', '1.0.2')).toBe('↑');
  });

  test('returns downgrade indicator when selected version is lower', () => {
    expect(getVersionIndicator('2.0.0', '1.0.0')).toBe('↓');
    expect(getVersionIndicator('1.6.0', '1.5.0')).toBe('↓');
    expect(getVersionIndicator('1.0.2', '1.0.1')).toBe('↓');
  });

  test('handles prerelease versions correctly', () => {
    expect(getVersionIndicator('1.0.0-alpha', '1.0.0')).toBe('↑');
    expect(getVersionIndicator('1.0.0', '1.0.0-beta')).toBe('↓');
    expect(getVersionIndicator('1.0.0-alpha', '1.0.0-beta')).toBe('↑');
  });
});
