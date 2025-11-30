import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import type { INuGetApiClient } from '../../../domain/nugetApiClient';
import { NuGetApiClient } from '../nugetApiClient';
import type { ILogger } from '../../../services/loggerService';

// Mock logger
const createMockLogger = (): ILogger => ({
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
  debug: mock(() => {}),
  show: mock(() => {}),
  isDebugEnabled: mock(() => false),
  dispose: mock(() => {}),
});

// Mock service index response
const mockServiceIndex = {
  version: '3.0.0',
  resources: [
    {
      '@id': 'https://azuresearch-usnc.nuget.org/query',
      '@type': 'SearchQueryService/3.0.0-rc',
      comment: 'Query endpoint of NuGet Search service',
    },
  ],
};

describe('NuGetApiClient Authentication', () => {
  let logger: ILogger;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    logger = createMockLogger();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('buildRequestHeaders: returns default headers for no auth', async () => {
    const client = new NuGetApiClient(logger, {
      sources: [
        {
          id: 'test',
          name: 'Test',
          provider: 'custom',
          indexUrl: 'https://test.com/index.json',
          enabled: true,
        },
      ],
    });

    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = mock(async (url: string | URL | Request, options?: RequestInit) => {
      const urlStr = url.toString();

      if (urlStr.includes('index.json')) {
        return new Response(JSON.stringify(mockServiceIndex));
      }

      capturedHeaders = options?.headers as Record<string, string>;
      return new Response(JSON.stringify({ totalHits: 0, data: [] }));
    }) as any;

    await client.searchPackages({ query: 'test' });

    expect(capturedHeaders.Accept).toBe('application/json');
    expect(capturedHeaders['User-Agent']).toBe('vscode-opm/1.0.0');
    expect(capturedHeaders.Authorization).toBeUndefined();
  });

  test('buildRequestHeaders: builds Basic auth header', async () => {
    const client = new NuGetApiClient(logger, {
      sources: [
        {
          id: 'private',
          name: 'Private Feed',
          provider: 'custom',
          indexUrl: 'https://private.com/index.json',
          enabled: true,
          auth: {
            type: 'basic',
            username: 'john.doe',
            password: 'secret123',
          },
        },
      ],
    });

    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = mock(async (url: string | URL | Request, options?: RequestInit) => {
      const urlStr = url.toString();

      if (urlStr.includes('index.json')) {
        return new Response(JSON.stringify(mockServiceIndex));
      }

      capturedHeaders = options?.headers as Record<string, string>;
      return new Response(JSON.stringify({ totalHits: 0, data: [] }));
    }) as any;

    await client.searchPackages({ query: 'test' });

    expect(capturedHeaders.Authorization).toBeDefined();
    expect(capturedHeaders.Authorization).toMatch(/^Basic /);

    // Decode and verify credentials
    const base64Creds = capturedHeaders.Authorization?.replace('Basic ', '') ?? '';
    const decoded = Buffer.from(base64Creds, 'base64').toString('utf-8');
    expect(decoded).toBe('john.doe:secret123');
  });

  test('buildRequestHeaders: builds Bearer auth header', async () => {
    const client = new NuGetApiClient(logger, {
      sources: [
        {
          id: 'azure',
          name: 'Azure Feed',
          provider: 'azure-artifacts',
          indexUrl: 'https://pkgs.dev.azure.com/org/index.json',
          enabled: true,
          auth: {
            type: 'bearer',
            username: 'az',
            password: 'ghp_abc123xyz',
          },
        },
      ],
    });

    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = mock(async (url: string | URL | Request, options?: RequestInit) => {
      const urlStr = url.toString();

      if (urlStr.includes('index.json')) {
        return new Response(JSON.stringify(mockServiceIndex));
      }

      capturedHeaders = options?.headers as Record<string, string>;
      return new Response(JSON.stringify({ totalHits: 0, data: [] }));
    }) as any;

    await client.searchPackages({ query: 'test' });

    expect(capturedHeaders.Authorization).toBe('Bearer ghp_abc123xyz');
  });

  test('buildRequestHeaders: builds API-key header for GitHub', async () => {
    const client = new NuGetApiClient(logger, {
      sources: [
        {
          id: 'github',
          name: 'GitHub Feed',
          provider: 'github',
          indexUrl: 'https://nuget.pkg.github.com/owner/index.json',
          enabled: true,
          auth: {
            type: 'api-key',
            apiKeyHeader: 'X-NuGet-ApiKey',
            username: 'token',
            password: 'ghp_xyz789abc',
          },
        },
      ],
    });

    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = mock(async (url: string | URL | Request, options?: RequestInit) => {
      const urlStr = url.toString();

      if (urlStr.includes('index.json')) {
        return new Response(JSON.stringify(mockServiceIndex));
      }

      capturedHeaders = options?.headers as Record<string, string>;
      return new Response(JSON.stringify({ totalHits: 0, data: [] }));
    }) as any;

    await client.searchPackages({ query: 'test' });

    expect(capturedHeaders['X-NuGet-ApiKey']).toBe('ghp_xyz789abc');
    expect(capturedHeaders.Authorization).toBeUndefined();
  });

  test('buildRequestHeaders: handles missing credentials gracefully', async () => {
    const client = new NuGetApiClient(logger, {
      sources: [
        {
          id: 'test',
          name: 'Test',
          provider: 'custom',
          indexUrl: 'https://test.com/index.json',
          enabled: true,
          auth: {
            type: 'basic',
            // Missing username and password
          },
        },
      ],
    });

    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = mock(async (url: string | URL | Request, options?: RequestInit) => {
      const urlStr = url.toString();

      if (urlStr.includes('index.json')) {
        return new Response(JSON.stringify(mockServiceIndex));
      }

      capturedHeaders = options?.headers as Record<string, string>;
      return new Response(JSON.stringify({ totalHits: 0, data: [] }));
    }) as any;

    await client.searchPackages({ query: 'test' });

    expect(capturedHeaders.Authorization).toBeUndefined();
    expect(capturedHeaders.Accept).toBe('application/json');
  });

  test('HTTP 401 returns AuthRequired error with helpful message', async () => {
    const client = new NuGetApiClient(logger, {
      sources: [
        {
          id: 'PrivateFeed',
          name: 'Private Feed',
          provider: 'custom',
          indexUrl: 'https://private.com/index.json',
          enabled: true,
        },
      ],
    });

    globalThis.fetch = mock(async (url: string | URL | Request) => {
      const urlStr = url.toString();

      if (urlStr.includes('index.json')) {
        return new Response(JSON.stringify(mockServiceIndex));
      }

      return new Response('Unauthorized', { status: 401 });
    }) as any;

    const result = await client.searchPackages({ query: 'test' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('AuthRequired');
      if (result.error.code === 'AuthRequired') {
        expect(result.error.message).toContain('Private Feed');
        expect(result.error.statusCode).toBe(401);
        expect(result.error.hint).toContain('nuget.config');
        expect(result.error.hint).toContain('PrivateFeed');
      }
    }
  });

  test('HTTP 403 returns AuthRequired error', async () => {
    const client = new NuGetApiClient(logger, {
      sources: [
        {
          id: 'RestrictedFeed',
          name: 'Restricted Feed',
          provider: 'custom',
          indexUrl: 'https://restricted.com/index.json',
          enabled: true,
        },
      ],
    });

    globalThis.fetch = mock(async (url: string | URL | Request) => {
      const urlStr = url.toString();

      if (urlStr.includes('index.json')) {
        return new Response(JSON.stringify(mockServiceIndex));
      }

      return new Response('Forbidden', { status: 403 });
    }) as any;

    const result = await client.searchPackages({ query: 'test' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('AuthRequired');
      if (result.error.code === 'AuthRequired') {
        expect(result.error.statusCode).toBe(403);
      }
    }
  });
});
