import { describe, it, expect } from 'bun:test';
import { LoggerService, formatLog } from '../loggerService';

describe('formatLog', () => {
  it('produces an ISO 8601 timestamp, level and message', () => {
    const out = formatLog('INFO', 'Package installed', []);
    expect(out).toMatch(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[INFO\] Package installed$/);
  });

  it('serializes non-string args as JSON appended to the message', () => {
    const out = formatLog('DEBUG', 'Details', [{ a: 1 }, [1, 2]]);
    expect(out).toMatch(/\[DEBUG\] Details \{"a":1\} \[1,2\]$/);
  });
});

describe('LoggerService', () => {
  it('writes info/warn/error to the output channel', () => {
    const lines: string[] = [];
    const mockChannel = {
      appendLine: (s: string) => lines.push(s),
      show: (_: boolean) => null,
      dispose: () => null,
    } as any;

    const logger = new LoggerService(undefined, mockChannel, () => false);
    logger.info('Info message');
    logger.warn('Warn message');
    logger.error('Err message');

    expect(lines.length).toBe(3);
    expect(lines[0]).toMatch(/\[INFO\] Info message$/);
    expect(lines[1]).toMatch(/\[WARN\] Warn message$/);
    expect(lines[2]).toMatch(/\[ERROR\] Err message$/);
    logger.dispose();
  });

  it('respects debug flag when provided via getDebug', () => {
    const lines: string[] = [];
    const mockChannel = {
      appendLine: (s: string) => lines.push(s),
      show: (_: boolean) => null,
      dispose: () => null,
    } as any;

    const loggerOff = new LoggerService(undefined, mockChannel, () => false);
    loggerOff.debug('should not log');
    expect(lines.length).toBe(0);
    loggerOff.dispose();

    const loggerOn = new LoggerService(undefined, mockChannel, () => true);
    loggerOn.debug('should log');
    expect(lines.length).toBe(1);
    expect(lines[0]).toMatch(/\[DEBUG\] should log$/);
    loggerOn.dispose();
  });
});
