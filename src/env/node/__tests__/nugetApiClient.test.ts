import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
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

describe('NuGetApiClient', () => {
  let logger: ILogger;
  let client: NuGetApiClient;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    logger = createMockLogger();
    client = new NuGetApiClient(logger);
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('builds correct URL with query parameter', async () => {
    let capturedUrl = '';
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      capturedUrl = url.toString();
      return new Response(JSON.stringify({ totalHits: 0, data: [] }));
    }) as any;

    await client.searchPackages({ query: 'Newtonsoft.Json' });

    expect(capturedUrl).toContain('q=Newtonsoft.Json');
    expect(capturedUrl).toContain('semVerLevel=2.0.0');
  });

  test('builds correct URL with prerelease parameter', async () => {
    let capturedUrl = '';
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      capturedUrl = url.toString();
      return new Response(JSON.stringify({ totalHits: 0, data: [] }));
    }) as any;

    await client.searchPackages({ query: 'test', prerelease: true });

    expect(capturedUrl).toContain('prerelease=true');
  });

  test('builds correct URL with pagination parameters', async () => {
    let capturedUrl = '';
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      capturedUrl = url.toString();
      return new Response(JSON.stringify({ totalHits: 0, data: [] }));
    }) as any;

    await client.searchPackages({ skip: 20, take: 10 });

    expect(capturedUrl).toContain('skip=20');
    expect(capturedUrl).toContain('take=10');
  });

  test('successful search returns parsed results', async () => {
    const mockResponse = {
      totalHits: 1,
      data: [
        {
          id: 'TestPackage',
          version: '1.0.0',
          description: 'Test description',
        },
      ],
    };

    globalThis.fetch = mock(async () => {
      return new Response(JSON.stringify(mockResponse));
    }) as any;

    const result = await client.searchPackages({ query: 'test' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result).toHaveLength(1);
      expect(result.result[0]!.id).toBe('TestPackage');
    }
  });

  test('empty results returns empty array', async () => {
    globalThis.fetch = mock(async () => {
      return new Response(JSON.stringify({ totalHits: 0, data: [] }));
    }) as any;

    const result = await client.searchPackages({ query: 'nonexistent' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result).toHaveLength(0);
    }
  });

  test('429 rate limit returns RateLimit error', async () => {
    globalThis.fetch = mock(async () => {
      return new Response('Rate limited', {
        status: 429,
        headers: { 'Retry-After': '60' },
      });
    }) as any;

    const result = await client.searchPackages({ query: 'test' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('RateLimit');
      if (result.error.code === 'RateLimit') {
        expect(result.error.retryAfter).toBe(60);
      }
    }
  });

  test('HTTP 404 returns ApiError', async () => {
    globalThis.fetch = mock(async () => {
      return new Response('Not Found', { status: 404 });
    }) as any;

    const result = await client.searchPackages({ query: 'test' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('ApiError');
      if (result.error.code === 'ApiError') {
        expect(result.error.statusCode).toBe(404);
      }
    }
  });

  test('HTTP 500 returns ApiError', async () => {
    globalThis.fetch = mock(async () => {
      return new Response('Internal Server Error', { status: 500 });
    }) as any;

    const result = await client.searchPackages({ query: 'test' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('ApiError');
      if (result.error.code === 'ApiError') {
        expect(result.error.statusCode).toBe(500);
      }
    }
  });

  test('invalid JSON returns ParseError', async () => {
    globalThis.fetch = mock(async () => {
      return new Response('not valid json');
    }) as any;

    const result = await client.searchPackages({ query: 'test' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('ParseError');
    }
  });

  test('network error returns Network error', async () => {
    globalThis.fetch = mock(async () => {
      throw new Error('Network connection failed');
    }) as any;

    const result = await client.searchPackages({ query: 'test' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('Network');
    }
  });

  test('request timeout returns Network error', async () => {
    globalThis.fetch = mock(async (_url, options) => {
      // Simulate long request that gets aborted
      return new Promise((_, reject) => {
        const timeout = setTimeout(() => {
          reject(new DOMException('The operation was aborted', 'AbortError'));
        }, 100);

        options?.signal?.addEventListener('abort', () => {
          clearTimeout(timeout);
          reject(new DOMException('The operation was aborted', 'AbortError'));
        });
      });
    }) as any;

    const result = await client.searchPackages({ query: 'test' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('Network');
      expect(result.error.message).toContain('timed out');
    }
  }, 35000); // Extend test timeout to allow for client timeout

  test('caller cancellation returns Network error', async () => {
    globalThis.fetch = mock(async (_url, options) => {
      return new Promise((_, reject) => {
        options?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted', 'AbortError'));
        });
      });
    }) as any;

    const controller = new AbortController();
    const resultPromise = client.searchPackages({ query: 'test' }, controller.signal);
    controller.abort();

    const result = await resultPromise;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('Network');
      expect(result.error.message).toContain('cancelled');
    }
  });

  test('already aborted signal returns immediately', async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await client.searchPackages({ query: 'test' }, controller.signal);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('Network');
      expect(result.error.message).toContain('cancelled before it started');
    }
  });

  test('logs debug information on successful search', async () => {
    globalThis.fetch = mock(async () => {
      return new Response(JSON.stringify({ totalHits: 0, data: [] }));
    }) as any;

    await client.searchPackages({ query: 'test' });

    expect(logger.debug).toHaveBeenCalled();
  });

  test('accepts custom options for package sources', async () => {
    const customClient = new NuGetApiClient(logger, {
      sources: [
        {
          id: 'custom',
          name: 'Custom NuGet',
          provider: 'custom',
          searchUrl: 'https://custom.nuget.org/api/search',
          enabled: true,
        },
      ],
    });

    let capturedUrl = '';
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      capturedUrl = url.toString();
      return new Response(JSON.stringify({ totalHits: 0, data: [] }));
    }) as any;

    await customClient.searchPackages({ query: 'test' });

    expect(capturedUrl).toContain('https://custom.nuget.org/api/search');
  });

  test('accepts custom timeout option', async () => {
    const customClient = new NuGetApiClient(logger, {
      timeout: 5000,
    });

    // Verify client was created (timeout will be used internally)
    expect(customClient).toBeDefined();
  });
});
