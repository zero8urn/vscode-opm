import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { fetchServiceIndex, getSearchUrl } from '../serviceIndexClient';
import type { ILogger } from '../../../services/loggerService';
import { ResourceTypes } from '../../../domain/models/serviceIndex';

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

const mockServiceIndex = {
  version: '3.0.0',
  resources: [
    {
      '@id': 'https://azuresearch-usnc.nuget.org/query',
      '@type': 'SearchQueryService/3.0.0-rc',
      comment: 'Query endpoint',
    },
    {
      '@id': 'https://api.nuget.org/v3/registration5',
      '@type': 'RegistrationsBaseUrl/3.6.0',
      comment: 'Registration endpoint',
    },
  ],
};

describe('serviceIndexClient', () => {
  let logger: ILogger;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    logger = createMockLogger();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('fetchServiceIndex', () => {
    test('fetches and parses service index successfully', async () => {
      globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify(mockServiceIndex));
      }) as any;

      const result = await fetchServiceIndex('https://api.nuget.org/v3/index.json', logger);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.version).toBe('3.0.0');
        expect(result.result.resources).toHaveLength(2);
      }
    });

    test('returns ApiError on HTTP error', async () => {
      globalThis.fetch = mock(async () => {
        return new Response('Not Found', { status: 404 });
      }) as any;

      const result = await fetchServiceIndex('https://api.nuget.org/v3/index.json', logger);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ApiError');
      }
    });

    test('returns ParseError on invalid JSON', async () => {
      globalThis.fetch = mock(async () => {
        return new Response('not json');
      }) as any;

      const result = await fetchServiceIndex('https://api.nuget.org/v3/index.json', logger);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ParseError');
      }
    });

    test('returns Network error on fetch failure', async () => {
      globalThis.fetch = mock(async () => {
        throw new Error('Network failure');
      }) as any;

      const result = await fetchServiceIndex('https://api.nuget.org/v3/index.json', logger);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('Network');
      }
    });

    test('handles abort signal', async () => {
      globalThis.fetch = mock(async () => {
        throw new DOMException('aborted', 'AbortError');
      }) as any;

      const result = await fetchServiceIndex('https://api.nuget.org/v3/index.json', logger);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('Network');
      }
    });
  });

  describe('getSearchUrl', () => {
    test('extracts SearchQueryService URL from service index', async () => {
      globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify(mockServiceIndex));
      }) as any;

      const result = await getSearchUrl('https://api.nuget.org/v3/index.json', logger);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toBe('https://azuresearch-usnc.nuget.org/query');
      }
    });

    test('returns error when SearchQueryService not found', async () => {
      const indexWithoutSearch = {
        version: '3.0.0',
        resources: [
          {
            '@id': 'https://api.nuget.org/v3/registration5',
            '@type': 'RegistrationsBaseUrl/3.6.0',
          },
        ],
      };

      globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify(indexWithoutSearch));
      }) as any;

      const result = await getSearchUrl('https://api.nuget.org/v3/index.json', logger);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ApiError');
        expect(result.error.message).toContain('SearchQueryService not found');
      }
    });

    test('propagates fetch errors', async () => {
      globalThis.fetch = mock(async () => {
        return new Response('Server Error', { status: 500 });
      }) as any;

      const result = await getSearchUrl('https://api.nuget.org/v3/index.json', logger);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ApiError');
      }
    });
  });
});
