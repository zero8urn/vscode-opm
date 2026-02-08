import { describe, test, expect } from 'bun:test';
import { MockVsCodeRuntime, MockOutputChannel } from '../vscodeRuntime';

describe('MockVsCodeRuntime', () => {
  test('captures information messages', async () => {
    const runtime = new MockVsCodeRuntime();
    await runtime.showInformationMessage('Test message');
    expect(runtime.hasMessage('Test message')).toBe(true);
    expect(runtime.getMessages('info')).toContain('Test message');
  });

  test('captures error messages', async () => {
    const runtime = new MockVsCodeRuntime();
    await runtime.showErrorMessage('Error occurred');
    expect(runtime.hasMessage('Error occurred')).toBe(true);
    expect(runtime.getMessages('error')).toContain('Error occurred');
  });

  test('stores configuration', () => {
    const runtime = new MockVsCodeRuntime();
    runtime.setConfig('opm', 'debug', true);
    const config = runtime.getConfiguration('opm');
    expect(config.get<boolean>('debug')).toBe(true);
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

    expect(opmConfig.get<string>('key1')).toBe('value1');
    expect(otherConfig.get<string>('key2')).toBe('value2');
    expect(opmConfig.get<string>('key2')).toBeUndefined();
  });

  test('captures multiple messages by type', async () => {
    const runtime = new MockVsCodeRuntime();
    await runtime.showInformationMessage('Message 1');
    await runtime.showInformationMessage('Message 2');
    await runtime.showErrorMessage('Error 1');

    expect(runtime.getMessages('info')).toEqual(['Message 1', 'Message 2']);
    expect(runtime.getMessages('error')).toEqual(['Error 1']);
  });

  test('config get returns undefined for missing key without default', () => {
    const runtime = new MockVsCodeRuntime();
    const config = runtime.getConfiguration('opm');
    expect(config.get<string>('missing')).toBeUndefined();
  });

  test('config can store different value types', () => {
    const runtime = new MockVsCodeRuntime();
    runtime.setConfig('opm', 'string', 'text');
    runtime.setConfig('opm', 'number', 42);
    runtime.setConfig('opm', 'boolean', true);
    runtime.setConfig('opm', 'array', [1, 2, 3]);
    runtime.setConfig('opm', 'object', { nested: 'value' });

    const config = runtime.getConfiguration('opm');
    expect(config.get<string>('string')).toBe('text');
    expect(config.get<number>('number')).toBe(42);
    expect(config.get<boolean>('boolean')).toBe(true);
    expect(config.get<number[]>('array')).toEqual([1, 2, 3]);
    expect(config.get<{ nested: string }>('object')).toEqual({ nested: 'value' });
  });

  test('clearConfig() removes all stored config', () => {
    const runtime = new MockVsCodeRuntime();
    runtime.setConfig('opm', 'key1', 'value');
    runtime.setConfig('test', 'key2', 'value');
    runtime.clearConfig();
    expect(runtime.getConfiguration('opm').has('key1')).toBe(false);
    expect(runtime.getConfiguration('test').has('key2')).toBe(false);
  });

  test('clearMessages() removes all tracked messages', () => {
    const runtime = new MockVsCodeRuntime();
    runtime.showInformationMessage('Test');
    runtime.clearMessages();
    expect(runtime.messages).toHaveLength(0);
  });

  test('tracks warning messages', async () => {
    const runtime = new MockVsCodeRuntime();
    await runtime.showWarningMessage('Warning message');
    expect(runtime.hasMessage('Warning message')).toBe(true);
    expect(runtime.getMessages('warning')).toContain('Warning message');
  });

  test('tracks progress calls', async () => {
    const runtime = new MockVsCodeRuntime();
    await runtime.withProgress({ title: 'Installing', location: 15 }, async () => {});
    expect(runtime.progressCalls).toHaveLength(1);
    expect(runtime.progressCalls[0]?.title).toBe('Installing');
  });

  test('clearProgress() removes tracked progress', async () => {
    const runtime = new MockVsCodeRuntime();
    await runtime.withProgress({ title: 'Test', location: 15 }, async () => {});
    runtime.clearProgress();
    expect(runtime.progressCalls).toHaveLength(0);
  });

  test('createOutputChannel() creates and retrieves channels', () => {
    const runtime = new MockVsCodeRuntime();
    runtime.createOutputChannel('OPM');
    const channel = runtime.getOutputChannel('OPM');
    expect(channel).toBeDefined();
    expect(channel?.name).toBe('OPM');
  });
});

describe('MockOutputChannel', () => {
  test('appendLine() adds lines', () => {
    const channel = new MockOutputChannel('Test');
    channel.appendLine('Line 1');
    channel.appendLine('Line 2');
    expect(channel.lines).toEqual(['Line 1', 'Line 2']);
  });

  test('append() appends to last line', () => {
    const channel = new MockOutputChannel('Test');
    channel.appendLine('Start');
    channel.append(' End');
    expect(channel.lines).toEqual(['Start End']);
  });

  test('getText() joins all lines', () => {
    const channel = new MockOutputChannel('Test');
    channel.appendLine('Line 1');
    channel.appendLine('Line 2');
    expect(channel.getText()).toBe('Line 1\nLine 2');
  });

  test('contains() checks for substring', () => {
    const channel = new MockOutputChannel('Test');
    channel.appendLine('Package Newtonsoft.Json installed');
    expect(channel.contains('Newtonsoft.Json')).toBe(true);
    expect(channel.contains('Missing')).toBe(false);
  });

  test('clear() removes all lines', () => {
    const channel = new MockOutputChannel('Test');
    channel.appendLine('Test');
    channel.clear();
    expect(channel.lines).toHaveLength(0);
  });

  test('show() and hide() track visibility', () => {
    const channel = new MockOutputChannel('Test');
    expect(channel.isShown).toBe(false);
    channel.show();
    expect(channel.isShown).toBe(true);
    channel.hide();
    expect(channel.isShown).toBe(false);
  });

  test('dispose() clears lines', () => {
    const channel = new MockOutputChannel('Test');
    channel.appendLine('Test');
    channel.dispose();
    expect(channel.lines).toHaveLength(0);
  });
});
