import { describe, test, expect, beforeEach } from 'bun:test';
import { SearchState } from '../search-state';
import type { PackageSearchResult } from '../../types';

describe('SearchState', () => {
  let state: SearchState;

  beforeEach(() => {
    state = new SearchState();
  });

  describe('query management', () => {
    test('sets and gets query', () => {
      state.setQuery('Newtonsoft.Json');
      expect(state.getQuery()).toBe('Newtonsoft.Json');
    });

    test('initializes with empty query', () => {
      expect(state.getQuery()).toBe('');
    });
  });

  describe('results management', () => {
    const mockResults: PackageSearchResult[] = [
      {
        id: 'pkg1',
        version: '1.0.0',
        description: null,
        authors: [],
        totalDownloads: 100,
        iconUrl: null,
        verified: false,
        sourceId: 's1',
        sourceName: 'S1',
        tags: [],
      },
      {
        id: 'pkg2',
        version: '2.0.0',
        description: null,
        authors: [],
        totalDownloads: 200,
        iconUrl: null,
        verified: true,
        sourceId: 's1',
        sourceName: 'S1',
        tags: [],
      },
    ];

    test('sets results', () => {
      state.setResults(mockResults, 50, true);
      expect(state.getResults()).toEqual(mockResults);
      expect(state.getTotalHits()).toBe(50);
      expect(state.getHasMore()).toBe(true);
    });

    test('appends results for pagination', () => {
      state.setResults(mockResults, 50, true);
      const moreResults: PackageSearchResult[] = [
        {
          id: 'pkg3',
          version: '3.0.0',
          description: null,
          authors: [],
          totalDownloads: 300,
          iconUrl: null,
          verified: false,
          sourceId: 's1',
          sourceName: 'S1',
          tags: [],
        },
      ];
      state.appendResults(moreResults, 50, false);

      expect(state.getResults()).toHaveLength(3);
      expect(state.getResults()[2]?.id).toBe('pkg3');
      expect(state.getHasMore()).toBe(false);
    });
  });

  describe('loading state', () => {
    test('sets and gets loading state', () => {
      state.setLoading(true);
      expect(state.isLoading()).toBe(true);

      state.setLoading(false);
      expect(state.isLoading()).toBe(false);
    });

    test('initializes as not loading', () => {
      expect(state.isLoading()).toBe(false);
    });
  });

  describe('prerelease filter', () => {
    test('sets and gets prerelease filter', () => {
      state.setIncludePrerelease(true);
      expect(state.getIncludePrerelease()).toBe(true);

      state.setIncludePrerelease(false);
      expect(state.getIncludePrerelease()).toBe(false);
    });

    test('initializes as false', () => {
      expect(state.getIncludePrerelease()).toBe(false);
    });
  });

  describe('error handling', () => {
    test('sets and gets error', () => {
      const error = { message: 'Network error', code: 'NETWORK' };
      state.setError(error);
      expect(state.getError()).toEqual(error);
    });

    test('clears error', () => {
      state.setError({ message: 'Error', code: 'ERR' });
      state.clearError();
      expect(state.getError()).toBeNull();
    });

    test('initializes with no error', () => {
      expect(state.getError()).toBeNull();
    });
  });

  describe('source selection', () => {
    test('sets and gets selected source ID', () => {
      state.setSelectedSourceId('nuget.org');
      expect(state.getSelectedSourceId()).toBe('nuget.org');
    });

    test('initializes with "all"', () => {
      expect(state.getSelectedSourceId()).toBe('all');
    });
  });

  describe('clear and reset', () => {
    test('clear removes results and query', () => {
      state.setQuery('test');
      state.setResults(
        [
          {
            id: 'pkg1',
            version: '1.0.0',
            description: null,
            authors: [],
            totalDownloads: 100,
            iconUrl: null,
            verified: false,
            sourceId: 's1',
            sourceName: 'S1',
            tags: [],
          },
        ],
        10,
        true,
      );
      state.setLoading(true);
      state.setError({ message: 'Error', code: 'ERR' });

      state.clear();

      expect(state.getQuery()).toBe('');
      expect(state.getResults()).toEqual([]);
      expect(state.getTotalHits()).toBe(0);
      expect(state.getHasMore()).toBe(false);
      expect(state.isLoading()).toBe(false);
      expect(state.getError()).toBeNull();
    });

    test('reset clears and resets filters', () => {
      state.setQuery('test');
      state.setIncludePrerelease(true);
      state.setSelectedSourceId('custom');

      state.reset();

      expect(state.getQuery()).toBe('');
      expect(state.getIncludePrerelease()).toBe(false);
      expect(state.getSelectedSourceId()).toBe('all');
    });
  });
});
