import { describe, test, expect } from 'bun:test';
import { PrereleaseToggle, PRERELEASE_TOGGLE_TAG } from '../prerelease-toggle';

describe('PrereleaseToggle Component Module', () => {
  test('should export PrereleaseToggle class', async () => {
    expect(PrereleaseToggle).toBeDefined();
    expect(typeof PrereleaseToggle).toBe('function');
  });

  test('should export tag constant', () => {
    expect(PRERELEASE_TOGGLE_TAG).toBe('prerelease-toggle');
  });

  test('should have default checked state as false', () => {
    const instance = new PrereleaseToggle();
    expect(instance.checked).toBe(false);
  });

  test('should have default disabled state as false', () => {
    const instance = new PrereleaseToggle();
    expect(instance.disabled).toBe(false);
  });

  test('should update checked property', () => {
    const instance = new PrereleaseToggle();
    instance.checked = true;
    expect(instance.checked).toBe(true);
  });

  test('should update disabled property', () => {
    const instance = new PrereleaseToggle();
    instance.disabled = true;
    expect(instance.disabled).toBe(true);
  });
});
