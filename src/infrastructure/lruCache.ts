/**
 * Least Recently Used (LRU) cache with time-to-live (TTL) expiration.
 *
 * Implements bounded caching with automatic eviction of least recently used entries
 * when the cache reaches maximum size, and automatic expiration of entries after TTL.
 *
 * @example
 * ```typescript
 * const cache = new LruCache<string, Data>(100, 5 * 60 * 1000); // 100 items, 5 min TTL
 *
 * cache.set('key', data);
 * const value = cache.get('key'); // undefined if expired or evicted
 * cache.clear();
 * ```
 */

interface CacheEntry<V> {
  readonly value: V;
  readonly expiresAt: number;
}

export class LruCache<K, V> {
  private readonly cache = new Map<K, CacheEntry<V>>();

  /**
   * @param maxSize Maximum number of entries before LRU eviction
   * @param ttlMs Time-to-live in milliseconds (entries expire after this duration)
   */
  constructor(private readonly maxSize: number, private readonly ttlMs: number) {
    if (maxSize <= 0) {
      throw new Error('maxSize must be positive');
    }
    if (ttlMs <= 0) {
      throw new Error('ttlMs must be positive');
    }
  }

  /**
   * Get a value from the cache.
   * Returns undefined if the key doesn't exist or has expired.
   * Moves the entry to the end (most recently used) if found and not expired.
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (LRU: most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  /**
   * Set a value in the cache.
   * Evicts the least recently used entry if the cache is at max size.
   */
  set(key: K, value: V): void {
    // Remove existing entry if present
    this.cache.delete(key);

    // Evict LRU if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    // Add new entry at the end
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  /**
   * Check if a key exists in the cache (and is not expired).
   */
  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Delete a specific key from the cache.
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries from the cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the current number of entries in the cache.
   * Note: May include expired entries that haven't been accessed yet.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Remove all expired entries from the cache.
   * Useful for periodic cleanup of stale entries.
   */
  prune(): void {
    const now = Date.now();
    const expiredKeys: K[] = [];

    this.cache.forEach((entry, key) => {
      if (now > entry.expiresAt) {
        expiredKeys.push(key);
      }
    });

    expiredKeys.forEach(key => this.cache.delete(key));
  }

  /**
   * Get all keys in the cache (including expired ones).
   * For debugging/inspection only.
   */
  keys(): K[] {
    return Array.from(this.cache.keys());
  }
}
