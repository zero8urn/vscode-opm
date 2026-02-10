import { describe, test, expect, mock } from 'bun:test';
import { NuGetOrgStrategy } from '../NuGetOrgStrategy';
import { ok, fail } from '../../../core/result';
import type { AppError, Result } from '../../../core/result';
import type { ServiceIndex } from '../../../domain/models/serviceIndex';
import type { PackageSource } from '../../../domain/models/nugetApiOptions';
import type { IHttpClient } from '../../services/serviceIndexResolver';
import type { ILogger } from '../../../services/loggerService';

describe('NuGetOrgStrategy', () => {
  const mockLogger: ILogger = {
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
    show: function (preserveFocus?: boolean): void {
      throw new Error('Function not implemented.');
    },
    isDebugEnabled: function (): boolean {
      throw new Error('Function not implemented.');
    },
    dispose: function () {
      throw new Error('Function not implemented.');
    },
  };

  const createMockSource = (): PackageSource => ({
    id: 'nuget.org',
    name: 'nuget.org',
    provider: 'nuget.org',
    indexUrl: 'https://api.nuget.org/v3/index.json',
    enabled: true,
  });

  const createMockServiceIndex = (): ServiceIndex => ({
    version: '3.0.0',
    resources: [
      { '@type': 'SearchQueryService', '@id': 'https://api.nuget.org/search' },
      { '@type': 'RegistrationsBaseUrl', '@id': 'https://api.nuget.org/registration' },
    ],
  });

  test('successfully resolves service index', async () => {
    const getSpy = mock((...args: any[]) => Promise.resolve(ok(createMockServiceIndex())));
    const mockHttp: IHttpClient = {
      get: <T>(url: string, options?: { signal?: AbortSignal; headers?: Record<string, string> }) =>
        getSpy(url, options) as Promise<Result<T, AppError>>,
    };

    const strategy = new NuGetOrgStrategy();
    const result = await strategy.resolve({
      indexUrl: 'https://api.nuget.org/v3/index.json',
      source: createMockSource(),
      http: mockHttp,
      logger: mockLogger,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.version).toBe('3.0.0');
      expect(result.value.resources.length).toBe(2);
    }
  });

  test('returns error when HTTP request fails', async () => {
    const getFailSpy = mock((...args: any[]) =>
      Promise.resolve(fail({ code: 'Network', message: 'Connection refused' } as AppError)),
    );
    const mockHttp: IHttpClient = {
      get: <T>(url: string, options?: { signal?: AbortSignal; headers?: Record<string, string> }) =>
        getFailSpy(url, options) as Promise<Result<T, AppError>>,
    };

    const strategy = new NuGetOrgStrategy();
    const result = await strategy.resolve({
      indexUrl: 'https://api.nuget.org/v3/index.json',
      source: createMockSource(),
      http: mockHttp,
      logger: mockLogger,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('Network');
    }
  });

  test('returns error when request is cancelled', async () => {
    const abortController = new AbortController();
    abortController.abort();

    const getAbortSpy = mock((...args: any[]) => Promise.resolve(ok(createMockServiceIndex())));
    // Expose the spy directly as `get` so tests can assert on the mock call-count
    const mockHttp: IHttpClient = {
      get: getAbortSpy as unknown as <T>(
        url: string,
        options?: { signal?: AbortSignal; headers?: Record<string, string> },
      ) => Promise<Result<T, AppError>>,
    };

    const strategy = new NuGetOrgStrategy();
    const result = await strategy.resolve({
      indexUrl: 'https://api.nuget.org/v3/index.json',
      source: createMockSource(),
      http: mockHttp,
      logger: mockLogger,
      signal: abortController.signal,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('Network');
      expect(result.error.message).toContain('cancelled');
    }
    expect(mockHttp.get).not.toHaveBeenCalled();
  });

  test('validates service index has resources array', async () => {
    const invalidIndex = { version: '3.0.0', resources: null };
    const getInvalidSpy = mock((...args: any[]) => Promise.resolve(ok(invalidIndex as any)));
    const mockHttp: IHttpClient = {
      get: <T>(url: string, options?: { signal?: AbortSignal; headers?: Record<string, string> }) =>
        getInvalidSpy(url, options) as Promise<Result<T, AppError>>,
    };

    const strategy = new NuGetOrgStrategy();
    const result = await strategy.resolve({
      indexUrl: 'https://api.nuget.org/v3/index.json',
      source: createMockSource(),
      http: mockHttp,
      logger: mockLogger,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('ApiError');
      expect(result.error.message).toContain('resources array');
    }
  });

  test('validates resources array is not empty', async () => {
    const emptyIndex = { version: '3.0.0', resources: [] };
    const getEmptySpy = mock((...args: any[]) => Promise.resolve(ok(emptyIndex)));
    const mockHttp: IHttpClient = {
      get: <T>(url: string, options?: { signal?: AbortSignal; headers?: Record<string, string> }) =>
        getEmptySpy(url, options) as Promise<Result<T, AppError>>,
    };

    const strategy = new NuGetOrgStrategy();
    const result = await strategy.resolve({
      indexUrl: 'https://api.nuget.org/v3/index.json',
      source: createMockSource(),
      http: mockHttp,
      logger: mockLogger,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('ApiError');
      expect(result.error.message).toContain('resources array');
    }
  });

  test('sets correct HTTP headers', async () => {
    let capturedHeaders: Record<string, string> | undefined;
    const getHeadersSpy = mock((url: string, options?: { headers?: Record<string, string> }) => {
      capturedHeaders = options?.headers;
      return Promise.resolve(ok(createMockServiceIndex()));
    });
    const mockHttp: IHttpClient = {
      get: <T>(url: string, options?: { signal?: AbortSignal; headers?: Record<string, string> }) =>
        getHeadersSpy(url, options) as Promise<Result<T, AppError>>,
    };

    const strategy = new NuGetOrgStrategy();
    await strategy.resolve({
      indexUrl: 'https://api.nuget.org/v3/index.json',
      source: createMockSource(),
      http: mockHttp,
      logger: mockLogger,
    });

    expect(capturedHeaders).toBeDefined();
    expect(capturedHeaders?.Accept).toBe('application/json');
    expect(capturedHeaders?.['User-Agent']).toBe('OPM-VSCode-Extension/1.0');
  });

  test('provider property returns nuget.org', () => {
    const strategy = new NuGetOrgStrategy();
    expect(strategy.provider).toBe('nuget.org');
  });
});
