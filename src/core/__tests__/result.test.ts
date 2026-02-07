import { describe, test, expect } from 'bun:test';
import {
  ok,
  fail,
  mapResult,
  flatMapResult,
  unwrapOr,
  unwrap,
  combineResults,
  type Result,
  type AppError,
} from '../result';

describe('Result Type', () => {
  describe('ok()', () => {
    test('creates success result', () => {
      const result = ok(42);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(42);
      }
    });

    test('creates success result with complex type', () => {
      const result = ok({ name: 'test', count: 5 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.name).toBe('test');
        expect(result.value.count).toBe(5);
      }
    });
  });

  describe('fail()', () => {
    test('creates error result', () => {
      const error: AppError = { code: 'Network', message: 'Connection failed' };
      const result = fail(error);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('Network');
        expect(result.error.message).toBe('Connection failed');
      }
    });

    test('creates error result with all error types', () => {
      const errors: AppError[] = [
        { code: 'Network', message: 'Network error', cause: new Error('boom') },
        { code: 'ApiError', message: 'API error', statusCode: 500 },
        { code: 'RateLimit', message: 'Rate limited', retryAfter: 60 },
        { code: 'AuthRequired', message: 'Auth required', hint: 'Login first' },
        { code: 'ParseError', message: 'Parse failed', raw: '{invalid' },
        { code: 'Cancelled', message: 'Cancelled' },
        { code: 'Timeout', message: 'Timeout', timeoutMs: 5000 },
        { code: 'NotFound', message: 'Not found', resource: 'package' },
        { code: 'Validation', message: 'Invalid', field: 'packageId' },
        { code: 'CliError', message: 'CLI failed', exitCode: 1, stderr: 'error output' },
        { code: 'ProjectNotFound', message: 'Project missing', projectPath: '/path/to/proj' },
        { code: 'DotnetNotFound', message: 'dotnet not found' },
        { code: 'Unknown', message: 'Unknown error', cause: 'something' },
      ];

      errors.forEach(error => {
        const result = fail(error);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe(error.code);
        }
      });
    });
  });

  describe('mapResult()', () => {
    test('maps success value', () => {
      const result = ok(10);
      const mapped = mapResult(result, x => x * 2);
      expect(mapped.success).toBe(true);
      if (mapped.success) {
        expect(mapped.value).toBe(20);
      }
    });

    test('passes through error', () => {
      const error: AppError = { code: 'NotFound', message: 'Missing' };
      const result = fail(error);
      const mapped = mapResult(result, (x: number) => x * 2);
      expect(mapped.success).toBe(false);
      if (!mapped.success) {
        expect(mapped.error.code).toBe('NotFound');
      }
    });

    test('maps to different type', () => {
      const result = ok(42);
      const mapped = mapResult(result, x => `Number: ${x}`);
      expect(mapped.success).toBe(true);
      if (mapped.success) {
        expect(mapped.value).toBe('Number: 42');
      }
    });
  });

  describe('flatMapResult()', () => {
    test('chains successful results', () => {
      const result = ok(10);
      const chained = flatMapResult(result, x => ok(x * 2));
      expect(chained.success).toBe(true);
      if (chained.success) {
        expect(chained.value).toBe(20);
      }
    });

    test('short-circuits on error', () => {
      const error: AppError = { code: 'Validation', message: 'Invalid input' };
      const result = fail(error);
      const chained = flatMapResult(result, (x: number) => ok(x * 2));
      expect(chained.success).toBe(false);
    });

    test('propagates inner error', () => {
      const result = ok(10);
      const chained = flatMapResult(result, () => fail({ code: 'Network', message: 'Inner failure' } as AppError));
      expect(chained.success).toBe(false);
      if (!chained.success) {
        expect(chained.error.code).toBe('Network');
      }
    });

    test('chains multiple operations', () => {
      const result = ok(5);
      const final = flatMapResult(
        flatMapResult(result, x => ok(x * 2)),
        x => ok(x + 10),
      );
      expect(final.success).toBe(true);
      if (final.success) {
        expect(final.value).toBe(20);
      }
    });
  });

  describe('unwrapOr()', () => {
    test('returns value on success', () => {
      const result = ok(42);
      expect(unwrapOr(result, 0)).toBe(42);
    });

    test('returns default on error', () => {
      const error: AppError = { code: 'NotFound', message: 'Missing' };
      const result = fail(error);
      expect(unwrapOr(result, 999)).toBe(999);
    });
  });

  describe('unwrap()', () => {
    test('returns value on success', () => {
      const result = ok(42);
      expect(unwrap(result)).toBe(42);
    });

    test('throws on error', () => {
      const error: AppError = { code: 'Network', message: 'Failed' };
      const result = fail(error);
      expect(() => unwrap(result)).toThrow();
    });
  });

  describe('combineResults()', () => {
    test('combines successful results', () => {
      const results = [ok(1), ok(2), ok(3)];
      const combined = combineResults(results);
      expect(combined.success).toBe(true);
      if (combined.success) {
        expect(combined.value).toEqual([1, 2, 3]);
      }
    });

    test('returns first error', () => {
      const results: Result<number, AppError>[] = [
        ok(1),
        fail({ code: 'Network', message: 'Error 1' }),
        fail({ code: 'ApiError', message: 'Error 2', statusCode: 500 }),
      ];
      const combined = combineResults(results);
      expect(combined.success).toBe(false);
      if (!combined.success) {
        expect(combined.error.code).toBe('Network');
        expect(combined.error.message).toBe('Error 1');
      }
    });

    test('handles empty array', () => {
      const combined = combineResults([]);
      expect(combined.success).toBe(true);
      if (combined.success) {
        expect(combined.value).toEqual([]);
      }
    });

    test('combines different value types', () => {
      const results = [ok('a'), ok('b'), ok('c')];
      const combined = combineResults(results);
      expect(combined.success).toBe(true);
      if (combined.success) {
        expect(combined.value).toEqual(['a', 'b', 'c']);
      }
    });
  });
});
