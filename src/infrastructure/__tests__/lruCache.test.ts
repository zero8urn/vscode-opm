import { describe, test, expect, beforeEach } from 'bun:test';
import { LruCache } from '../lruCache';

describe('LruCache', () => {
  let cache: LruCache<string, number>;

  beforeEach(() => {
    cache = new LruCache<string, number>(3, 1000); // 3 items, 1 second TTL
  });

  describe('constructor', () => {
    test('throws on zero maxSize', () => {
      expect(() => new LruCache<string, number>(0, 1000)).toThrow('maxSize must be positive');
    });

    test('throws on negative maxSize', () => {
      expect(() => new LruCache<string, number>(-1, 1000)).toThrow('maxSize must be positive');
    });

    test('throws on zero ttlMs', () => {
      expect(() => new LruCache<string, number>(10, 0)).toThrow('ttlMs must be positive');
    });

    test('throws on negative ttlMs', () => {
      expect(() => new LruCache<string, number>(10, -1)).toThrow('ttlMs must be positive');
    });
  });

  describe('set and get', () => {
    test('stores and retrieves values', () => {
      cache.set('a', 1);
      expect(cache.get('a')).toBe(1);
    });

    test('returns undefined for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    test('overwrites existing values', () => {
      cache.set('a', 1);
      cache.set('a', 2);
      expect(cache.get('a')).toBe(2);
    });
  });

  describe('LRU eviction', () => {
    test('evicts least recently used when at capacity', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.set('d', 4); // Should evict 'a'

      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBe(3);
      expect(cache.get('d')).toBe(4);
    });

    test('get updates access order', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Access 'a' to make it most recently used
      cache.get('a');

      cache.set('d', 4); // Should evict 'b' (least recently used)

      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('c')).toBe(3);
      expect(cache.get('d')).toBe(4);
    });

    test('set updates access order', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Update 'a' to make it most recently used
      cache.set('a', 10);

      cache.set('d', 4); // Should evict 'b'

      expect(cache.get('a')).toBe(10);
      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('c')).toBe(3);
      expect(cache.get('d')).toBe(4);
    });
  });

  describe('TTL expiration', () => {
    test('expires entries after TTL', async () => {
      const shortTtlCache = new LruCache<string, number>(10, 50); // 50ms TTL
      shortTtlCache.set('a', 1);

      expect(shortTtlCache.get('a')).toBe(1);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 60));

      expect(shortTtlCache.get('a')).toBeUndefined();
    });

    test('removes expired entries on access', async () => {
      const shortTtlCache = new LruCache<string, number>(10, 50);
      shortTtlCache.set('a', 1);

      await new Promise(resolve => setTimeout(resolve, 60));

      // Accessing expired entry should remove it
      expect(shortTtlCache.get('a')).toBeUndefined();
      expect(shortTtlCache.size).toBe(0);
    });
  });

  describe('has', () => {
    test('returns true for existing non-expired keys', () => {
      cache.set('a', 1);
      expect(cache.has('a')).toBe(true);
    });

    test('returns false for non-existent keys', () => {
      expect(cache.has('nonexistent')).toBe(false);
    });

    test('returns false for expired keys', async () => {
      const shortTtlCache = new LruCache<string, number>(10, 50);
      shortTtlCache.set('a', 1);

      await new Promise(resolve => setTimeout(resolve, 60));

      expect(shortTtlCache.has('a')).toBe(false);
    });
  });

  describe('delete', () => {
    test('removes entries', () => {
      cache.set('a', 1);
      expect(cache.delete('a')).toBe(true);
      expect(cache.get('a')).toBeUndefined();
    });

    test('returns false for non-existent keys', () => {
      expect(cache.delete('nonexistent')).toBe(false);
    });
  });

  describe('clear', () => {
    test('removes all entries', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      cache.clear();

      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('c')).toBeUndefined();
      expect(cache.size).toBe(0);
    });
  });

  describe('size', () => {
    test('returns current number of entries', () => {
      expect(cache.size).toBe(0);

      cache.set('a', 1);
      expect(cache.size).toBe(1);

      cache.set('b', 2);
      expect(cache.size).toBe(2);

      cache.delete('a');
      expect(cache.size).toBe(1);

      cache.clear();
      expect(cache.size).toBe(0);
    });

    test('includes expired entries until accessed', async () => {
      const shortTtlCache = new LruCache<string, number>(10, 50);
      shortTtlCache.set('a', 1);

      await new Promise(resolve => setTimeout(resolve, 60));

      // Size still includes expired entry
      expect(shortTtlCache.size).toBe(1);

      // Access removes it
      shortTtlCache.get('a');
      expect(shortTtlCache.size).toBe(0);
    });
  });

  describe('prune', () => {
    test('removes all expired entries', async () => {
      const shortTtlCache = new LruCache<string, number>(10, 50);
      shortTtlCache.set('a', 1);
      shortTtlCache.set('b', 2);

      await new Promise(resolve => setTimeout(resolve, 60));

      // Both entries expired
      expect(shortTtlCache.size).toBe(2);

      shortTtlCache.prune();

      expect(shortTtlCache.size).toBe(0);
      expect(shortTtlCache.get('a')).toBeUndefined();
      expect(shortTtlCache.get('b')).toBeUndefined();
    });

    test('keeps non-expired entries', async () => {
      const cache = new LruCache<string, number>(10, 100); // 100ms TTL
      cache.set('a', 1);

      await new Promise(resolve => setTimeout(resolve, 50)); // Wait 50ms

      cache.set('b', 2); // Set new entry with fresh TTL

      await new Promise(resolve => setTimeout(resolve, 60)); // Wait another 60ms (total 110ms)

      // 'a' expired (110ms), 'b' still valid (60ms)
      cache.prune();

      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe(2);
      expect(cache.size).toBe(1);
    });
  });

  describe('keys', () => {
    test('returns all keys', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      const keys = cache.keys();
      expect(keys).toHaveLength(3);
      expect(keys).toContain('a');
      expect(keys).toContain('b');
      expect(keys).toContain('c');
    });

    test('includes expired keys', async () => {
      const shortTtlCache = new LruCache<string, number>(10, 50);
      shortTtlCache.set('a', 1);

      await new Promise(resolve => setTimeout(resolve, 60));

      const keys = shortTtlCache.keys();
      expect(keys).toContain('a');
    });
  });
});
