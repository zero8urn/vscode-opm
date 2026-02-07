import { describe, test, expect } from 'bun:test';
import { MockVsCodeRuntime } from '../vscodeRuntime';

describe('MockVsCodeRuntime', () => {
  test('captures information messages', async () => {
    const runtime = new MockVsCodeRuntime();
    await runtime.showInformationMessage('Test message');
    expect(runtime.messages).toContain('Test message');
  });

  test('captures error messages', async () => {
    const runtime = new MockVsCodeRuntime();
    await runtime.showErrorMessage('Error occurred');
    expect(runtime.errors).toContain('Error occurred');
  });

  test('stores configuration', () => {
    const runtime = new MockVsCodeRuntime();
    runtime.setConfig('opm', 'debug', true);
    const config = runtime.getConfiguration('opm');
    expect(config.get('debug')).toBe(true);
  });

  test('returns default value for missing config', () => {
    const runtime = new MockVsCodeRuntime();
    const config = runtime.getConfiguration('opm');
    expect(config.get('missing', 'default')).toBe('default');
  });

  test('has() returns correct results', () => {
    const runtime = new MockVsCodeRuntime();
    runtime.setConfig('opm', 'existing', 'value');
    const config = runtime.getConfiguration('opm');
    expect(config.has('existing')).toBe(true);
    expect(config.has('missing')).toBe(false);
  });

  test('supports multiple configuration sections', () => {
    const runtime = new MockVsCodeRuntime();
    runtime.setConfig('opm', 'key1', 'value1');
    runtime.setConfig('other', 'key2', 'value2');

    const opmConfig = runtime.getConfiguration('opm');
    const otherConfig = runtime.getConfiguration('other');

    expect(opmConfig.get('key1')).toBe('value1');
    expect(otherConfig.get('key2')).toBe('value2');
    expect(opmConfig.get('key2')).toBeUndefined();
  });

  test('captures multiple messages', async () => {
    const runtime = new MockVsCodeRuntime();
    await runtime.showInformationMessage('Message 1');
    await runtime.showInformationMessage('Message 2');
    await runtime.showErrorMessage('Error 1');

    expect(runtime.messages).toEqual(['Message 1', 'Message 2']);
    expect(runtime.errors).toEqual(['Error 1']);
  });

  test('config get returns undefined for missing key without default', () => {
    const runtime = new MockVsCodeRuntime();
    const config = runtime.getConfiguration('opm');
    expect(config.get('missing')).toBeUndefined();
  });

  test('config can store different value types', () => {
    const runtime = new MockVsCodeRuntime();
    runtime.setConfig('opm', 'string', 'text');
    runtime.setConfig('opm', 'number', 42);
    runtime.setConfig('opm', 'boolean', true);
    runtime.setConfig('opm', 'array', [1, 2, 3]);
    runtime.setConfig('opm', 'object', { nested: 'value' });

    const config = runtime.getConfiguration('opm');
    expect(config.get('string')).toBe('text');
    expect(config.get('number')).toBe(42);
    expect(config.get('boolean')).toBe(true);
    expect(config.get('array')).toEqual([1, 2, 3]);
    expect(config.get('object')).toEqual({ nested: 'value' });
  });
});
