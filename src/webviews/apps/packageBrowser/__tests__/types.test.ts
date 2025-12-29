import { describe, it, expect } from 'bun:test';
import {
  isSearchRequestMessage,
  isWebviewReadyMessage,
  isSearchResponseMessage,
  type SearchRequestMessage,
  type WebviewReadyMessage,
  type SearchResponseMessage,
  type PackageSearchResult,
} from '../types';

describe('Package Browser Types', () => {
  describe('isWebviewReadyMessage', () => {
    it('should return true for valid ready message', () => {
      const msg: WebviewReadyMessage = { type: 'ready' };
      expect(isWebviewReadyMessage(msg)).toBe(true);
    });

    it('should return false for invalid message', () => {
      expect(isWebviewReadyMessage(null)).toBe(false);
      expect(isWebviewReadyMessage(undefined)).toBe(false);
      expect(isWebviewReadyMessage({ type: 'other' })).toBe(false);
      expect(isWebviewReadyMessage({ foo: 'bar' })).toBe(false);
    });
  });

  describe('isSearchRequestMessage', () => {
    it('should return true for valid search request', () => {
      const msg: SearchRequestMessage = {
        type: 'searchRequest',
        payload: {
          query: 'newtonsoft',
          includePrerelease: false,
          skip: 0,
          take: 25,
        },
      };
      expect(isSearchRequestMessage(msg)).toBe(true);
    });

    it('should return true for minimal search request', () => {
      const msg = {
        type: 'searchRequest',
        payload: { query: 'test' },
      };
      expect(isSearchRequestMessage(msg)).toBe(true);
    });

    it('should return true for search request with includePrerelease true', () => {
      const msg: SearchRequestMessage = {
        type: 'searchRequest',
        payload: {
          query: 'serilog',
          includePrerelease: true,
        },
      };
      expect(isSearchRequestMessage(msg)).toBe(true);
    });

    it('should return true for search request with includePrerelease false', () => {
      const msg: SearchRequestMessage = {
        type: 'searchRequest',
        payload: {
          query: 'serilog',
          includePrerelease: false,
        },
      };
      expect(isSearchRequestMessage(msg)).toBe(true);
    });

    it('should return true for search request without includePrerelease field', () => {
      const msg = {
        type: 'searchRequest',
        payload: {
          query: 'serilog',
          // includePrerelease omitted - should still be valid
        },
      };
      expect(isSearchRequestMessage(msg)).toBe(true);
    });

    it('should return false for invalid message', () => {
      expect(isSearchRequestMessage(null)).toBe(false);
      expect(isSearchRequestMessage(undefined)).toBe(false);
      expect(isSearchRequestMessage({ type: 'searchRequest' })).toBe(false);
      expect(isSearchRequestMessage({ type: 'other', payload: {} })).toBe(false);
    });
  });

  describe('isSearchResponseMessage', () => {
    it('should return true for valid search response', () => {
      const msg: SearchResponseMessage = {
        type: 'notification',
        name: 'searchResponse',
        args: {
          query: 'newtonsoft',
          results: [],
          totalCount: 0,
          totalHits: 0,
          hasMore: false,
          requestId: '123',
        },
      };
      expect(isSearchResponseMessage(msg)).toBe(true);
    });

    it('should return false for invalid message', () => {
      expect(isSearchResponseMessage(null)).toBe(false);
      expect(isSearchResponseMessage(undefined)).toBe(false);
      expect(isSearchResponseMessage({ type: 'notification' })).toBe(false);
      expect(isSearchResponseMessage({ type: 'notification', name: 'other' })).toBe(false);
      expect(isSearchResponseMessage({ name: 'searchResponse' })).toBe(false);
    });
  });

  describe('PackageSearchResult', () => {
    it('should have correct shape', () => {
      const result: PackageSearchResult = {
        id: 'Newtonsoft.Json',
        version: '13.0.3',
        description: 'Popular JSON framework',
        authors: ['James Newton-King'],
        totalDownloads: 1000000000,
        iconUrl: 'https://example.com/icon.png',
      };

      expect(result.id).toBe('Newtonsoft.Json');
      expect(result.version).toBe('13.0.3');
      expect(result.totalDownloads).toBe(1000000000);
    });

    it('should allow optional iconUrl', () => {
      const result: PackageSearchResult = {
        id: 'Test.Package',
        version: '1.0.0',
        description: 'Test',
        authors: ['Test Author'],
        totalDownloads: 100,
        iconUrl: null,
      };

      expect(result.iconUrl).toBeNull();
    });
  });
});
