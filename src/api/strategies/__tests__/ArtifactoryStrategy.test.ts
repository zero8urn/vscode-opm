import { describe, test, expect } from 'bun:test';
import { ArtifactoryStrategy } from '../ArtifactoryStrategy';
import { ok, fail } from '../../../core/result';
import type { Result, AppError } from '../../../core/result';
import type { ServiceIndex } from '../../../domain/models/serviceIndex';
import type { PackageSource } from '../../../domain/models/nugetApiOptions';
import type { IHttpClient } from '../../services/serviceIndexResolver';
import { createMockLogger } from './test-helpers';

describe('ArtifactoryStrategy', () => {
  const mockLogger = createMockLogger();

  const createMockSource = (): PackageSource => ({
    id: 'artifactory-test',
    name: 'Test Artifactory',
    provider: 'artifactory',
    indexUrl: 'https://artifactory.example.com/api/nuget/my-repo/index.json',
    enabled: true,
  });

  const createMockServiceIndex = (): ServiceIndex => ({
    version: '3.0.0',
    resources: [
      { '@type': 'SearchQueryService', '@id': 'https://example.com/search' },
      { '@type': 'RegistrationsBaseUrl', '@id': 'https://example.com/registration' },
    ],
  });

  test('successfully resolves on first attempt with original URL', async () => {
    let callCount = 0;
    const mockHttp: IHttpClient = {
      get: async <T>(): Promise<Result<T, AppError>> => {
        callCount++;
        return ok(createMockServiceIndex()) as Result<T, AppError>;
      },
    };

    const strategy = new ArtifactoryStrategy();
    const result = await strategy.resolve({
      indexUrl: 'https://artifactory.example.com/api/nuget/my-repo/index.json',
      source: createMockSource(),
      http: mockHttp,
      logger: mockLogger,
    });

    expect(result.success).toBe(true);
    expect(callCount).toBe(1);
  });

  test('tries fallback URLs on 406 error', async () => {
    let callCount = 0;
    const mockHttp: IHttpClient = {
      get: async <T>(): Promise<Result<T, AppError>> => {
        callCount++;
        if (callCount === 1) {
          return fail({ code: 'ApiError' as const, message: 'Not Acceptable', statusCode: 406 });
        }
        return ok(createMockServiceIndex()) as Result<T, AppError>;
      },
    };

    const strategy = new ArtifactoryStrategy();
    const result = await strategy.resolve({
      indexUrl: 'https://artifactory.example.com/api/nuget/my-repo/index.json',
      source: createMockSource(),
      http: mockHttp,
      logger: mockLogger,
    });

    expect(result.success).toBe(true);
    expect(callCount).toBe(2);
  });

  test('stops retries on 401 auth error', async () => {
    let callCount = 0;
    const mockHttp: IHttpClient = {
      get: async <T>(): Promise<Result<T, AppError>> => {
        callCount++;
        return fail({ code: 'ApiError' as const, message: 'Unauthorized', statusCode: 401 });
      },
    };

    const strategy = new ArtifactoryStrategy();
    const result = await strategy.resolve({
      indexUrl: 'https://artifactory.example.com/api/nuget/my-repo/index.json',
      source: createMockSource(),
      http: mockHttp,
      logger: mockLogger,
    });

    expect(result.success).toBe(false);
    expect(callCount).toBe(1); // Should not retry after 401
  });

  test('stops retries on 403 forbidden error', async () => {
    let callCount = 0;
    const mockHttp: IHttpClient = {
      get: async <T>(): Promise<Result<T, AppError>> => {
        callCount++;
        return fail({ code: 'ApiError' as const, message: 'Forbidden', statusCode: 403 });
      },
    };

    const strategy = new ArtifactoryStrategy();
    const result = await strategy.resolve({
      indexUrl: 'https://artifactory.example.com/api/nuget/my-repo/index.json',
      source: createMockSource(),
      http: mockHttp,
      logger: mockLogger,
    });

    expect(result.success).toBe(false);
    expect(callCount).toBe(1); // Should not retry after 403
  });

  test('generates correct candidate URLs for standard pattern', () => {
    const strategy = new ArtifactoryStrategy();
    const urls = (strategy as any).generateCandidateUrls(
      'https://artifactory.example.com/api/nuget/my-repo/index.json',
    );

    expect(urls).toEqual([
      'https://artifactory.example.com/api/nuget/my-repo/index.json', // original
      'https://artifactory.example.com/api/nuget/my-repo/v3/index.json', // v3 injection
      'https://artifactory.example.com/api/nuget/my-repo/v3', // v3 only
    ]);
  });

  test('generates correct candidate URLs when v3 already in path', () => {
    const strategy = new ArtifactoryStrategy();
    const urls = (strategy as any).generateCandidateUrls(
      'https://artifactory.example.com/api/nuget/v3/my-repo/index.json',
    );

    expect(urls).toEqual([
      'https://artifactory.example.com/api/nuget/v3/my-repo/index.json', // original
      'https://artifactory.example.com/api/nuget/v3/my-repo/v3/index.json', // v3 injection
      'https://artifactory.example.com/api/nuget/v3/my-repo/v3', // v3 only
    ]);
  });

  test('generates correct candidate URLs when no /index.json suffix', () => {
    const strategy = new ArtifactoryStrategy();
    const urls = (strategy as any).generateCandidateUrls('https://artifactory.example.com/api/nuget/my-repo');

    expect(urls).toEqual([
      'https://artifactory.example.com/api/nuget/my-repo', // original
      'https://artifactory.example.com/api/nuget/my-repo/v3/index.json', // v3 append
    ]);
  });

  test('adds basic auth header when configured', async () => {
    let capturedHeaders: Record<string, string> | undefined;
    const mockHttp: IHttpClient = {
      get: async <T>(url: string, options?: { headers?: Record<string, string> }): Promise<Result<T, AppError>> => {
        capturedHeaders = options?.headers;
        return ok(createMockServiceIndex()) as Result<T, AppError>;
      },
    };

    const source = createMockSource();
    source.auth = {
      type: 'basic',
      username: 'testuser',
      password: 'testpass',
    };

    const strategy = new ArtifactoryStrategy();
    await strategy.resolve({
      indexUrl: 'https://artifactory.example.com/api/nuget/my-repo/index.json',
      source,
      http: mockHttp,
      logger: mockLogger,
    });

    expect(capturedHeaders).toBeDefined();
    expect(capturedHeaders?.Authorization).toContain('Basic ');
    expect(capturedHeaders?.Accept).toBe('application/json');
    expect(capturedHeaders?.['User-Agent']).toBe('OPM-VSCode-Extension/1.0');
  });

  test('returns last error when all attempts fail', async () => {
    const mockHttp: IHttpClient = {
      get: async <T>(): Promise<Result<T, AppError>> => {
        return fail({ code: 'ApiError' as const, message: 'Service Unavailable', statusCode: 503 });
      },
    };

    const strategy = new ArtifactoryStrategy();
    const result = await strategy.resolve({
      indexUrl: 'https://artifactory.example.com/api/nuget/my-repo/index.json',
      source: createMockSource(),
      http: mockHttp,
      logger: mockLogger,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('ApiError');
      if (result.error.code === 'ApiError') {
        expect(result.error.statusCode).toBe(503);
      }
    }
  });

  test('provider property returns artifactory', () => {
    const strategy = new ArtifactoryStrategy();
    expect(strategy.provider).toBe('artifactory');
  });
});
