import { describe, it, expect } from 'bun:test';
import {
  isSearchRequestMessage,
  isWebviewReadyMessage,
  type SearchRequestMessage,
  type WebviewReadyMessage,
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

    it('should return false for invalid message', () => {
      expect(isSearchRequestMessage(null)).toBe(false);
      expect(isSearchRequestMessage(undefined)).toBe(false);
      expect(isSearchRequestMessage({ type: 'searchRequest' })).toBe(false);
      expect(isSearchRequestMessage({ type: 'other', payload: {} })).toBe(false);
    });
  });

  describe('PackageSearchResult', () => {
    it('should have correct shape', () => {
      const result: PackageSearchResult = {
        id: 'Newtonsoft.Json',
        version: '13.0.3',
        description: 'Popular JSON framework',
        authors: 'James Newton-King',
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
        authors: 'Test Author',
        totalDownloads: 100,
      };

      expect(result.iconUrl).toBeUndefined();
    });
  });
});
