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

/**
 * Creates a mock fetch that responds to service index and search requests.
 */
const createMockFetch = (searchResponse: any = { totalHits: 0, data: [] }) => {
  let capturedSearchUrl = '';
  let callCount = 0;

  const mockFn = async (url: string | URL | Request, options?: RequestInit) => {
    callCount++;
    let urlStr = '';
    if (typeof url === 'string') {
      urlStr = url;
    } else if (url instanceof Request) {
      urlStr = url.url;
    } else if (url && typeof url === 'object' && 'toString' in url) {
      urlStr = url.toString();
    } else {
      urlStr = String(url);
    }

    // Service index request
    if (urlStr.includes('index.json')) {
      return new Response(JSON.stringify(mockServiceIndex));
    }

    // Search request
    capturedSearchUrl = urlStr;
    return new Response(JSON.stringify(searchResponse));
  };

  return { mockFn: mockFn as any, getCapturedUrl: () => capturedSearchUrl, getCallCount: () => callCount };
};

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
    const { mockFn, getCapturedUrl } = createMockFetch();
    globalThis.fetch = mockFn;

    const result = await client.searchPackages({ query: 'Newtonsoft.Json' });

    // Debug: print result if it failed
    if (!result.success) {
      console.log('ERROR:', result.error);
    }

    const capturedUrl = getCapturedUrl();
    expect(capturedUrl).toContain('q=Newtonsoft.Json');
    expect(capturedUrl).toContain('semVerLevel=2.0.0');
  });

  test('builds correct URL with prerelease parameter', async () => {
    const { mockFn, getCapturedUrl } = createMockFetch();
    globalThis.fetch = mockFn;

    await client.searchPackages({ query: 'test', prerelease: true });

    expect(getCapturedUrl()).toContain('prerelease=true');
  });

  test('builds correct URL with pagination parameters', async () => {
    const { mockFn, getCapturedUrl } = createMockFetch();
    globalThis.fetch = mockFn;

    await client.searchPackages({ skip: 20, take: 10 });

    expect(getCapturedUrl()).toContain('skip=20');
    expect(getCapturedUrl()).toContain('take=10');
  });

  test('successful search returns parsed results', async () => {
    const mockResponse = {
      totalHits: 1,
      data: [
        {
          id: 'Newtonsoft.Json',
          version: '13.0.1',
          description: 'Json.NET',
          authors: 'James Newton-King',
        },
      ],
    };

    const { mockFn } = createMockFetch(mockResponse);
    globalThis.fetch = mockFn;

    const result = await client.searchPackages({ query: 'test' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result).toHaveLength(1);
      expect(result.result[0]?.id).toBe('Newtonsoft.Json');
    }
  });

  test('empty results returns empty array', async () => {
    const { mockFn } = createMockFetch();
    globalThis.fetch = mockFn;

    const result = await client.searchPackages({ query: 'nonexistent' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result).toHaveLength(0);
    }
  });

  test('429 rate limit returns RateLimit error', async () => {
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      const urlStr = url.toString();

      // Service index succeeds
      if (urlStr.includes('index.json')) {
        return new Response(JSON.stringify(mockServiceIndex));
      }

      // Search request returns rate limit
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
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      const urlStr = url.toString();

      // Service index succeeds
      if (urlStr.includes('index.json')) {
        return new Response(JSON.stringify(mockServiceIndex));
      }

      // Search request returns 404
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
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      const urlStr = url.toString();

      // Service index succeeds
      if (urlStr.includes('index.json')) {
        return new Response(JSON.stringify(mockServiceIndex));
      }

      // Search request returns 500
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
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      const urlStr = url.toString();

      // Service index succeeds
      if (urlStr.includes('index.json')) {
        return new Response(JSON.stringify(mockServiceIndex));
      }

      // Search request returns invalid JSON
      return new Response('not valid json');
    }) as any;

    const result = await client.searchPackages({ query: 'test' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('ParseError');
    }
  });

  test('network error returns Network error', async () => {
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      const urlStr = url.toString();

      // Service index succeeds
      if (urlStr.includes('index.json')) {
        return new Response(JSON.stringify(mockServiceIndex));
      }

      // Search request throws network error
      throw new Error('Network connection failed');
    }) as any;

    const result = await client.searchPackages({ query: 'test' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('Network');
    }
  });

  test('request timeout returns Network error', async () => {
    globalThis.fetch = mock(async (url: string | URL | Request, options) => {
      const urlStr = typeof url === 'string' ? url : url instanceof Request ? url.url : url.toString();

      // Service index succeeds quickly
      if (urlStr.includes('index.json')) {
        return new Response(JSON.stringify(mockServiceIndex));
      }

      // Search request simulates long delay that gets aborted
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
    globalThis.fetch = mock(async (url: string | URL | Request, options) => {
      const urlStr = typeof url === 'string' ? url : url instanceof Request ? url.url : url.toString();

      // Service index succeeds
      if (urlStr.includes('index.json')) {
        return new Response(JSON.stringify(mockServiceIndex));
      }

      // Search request waits for abort
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
      expect(result.error.message).toContain('cancelled');
    }
  });

  test('logs debug information on successful search', async () => {
    const { mockFn } = createMockFetch();
    globalThis.fetch = mockFn;

    await client.searchPackages({ query: 'test' });

    expect(logger.debug).toHaveBeenCalled();
  });

  test('accepts custom options for package sources', async () => {
    const customIndexUrl = 'https://custom.nuget.org/v3/index.json';
    const customSearchUrl = 'https://custom.nuget.org/api/search';

    const customClient = new NuGetApiClient(logger, {
      sources: [
        {
          id: 'custom',
          name: 'Custom NuGet',
          provider: 'custom',
          indexUrl: customIndexUrl,
          enabled: true,
        },
      ],
    });

    const customServiceIndex = {
      version: '3.0.0',
      resources: [
        {
          '@id': customSearchUrl,
          '@type': 'SearchQueryService/3.0.0',
        },
      ],
    };

    let capturedSearchUrl = '';
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      const urlStr = url.toString();

      // Service index request
      if (urlStr === customIndexUrl) {
        return new Response(JSON.stringify(customServiceIndex));
      }

      // Search request
      capturedSearchUrl = urlStr;
      return new Response(JSON.stringify({ totalHits: 0, data: [] }));
    }) as any;

    await customClient.searchPackages({ query: 'test' });

    expect(capturedSearchUrl).toContain(customSearchUrl);
  });

  test('accepts custom timeout option', async () => {
    const customClient = new NuGetApiClient(logger, {
      timeout: 5000,
    });

    // Verify client was created (timeout will be used internally)
    expect(customClient).toBeDefined();
  });
});
