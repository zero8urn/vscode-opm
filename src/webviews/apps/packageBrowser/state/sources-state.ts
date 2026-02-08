/**
 * Package sources state management
 *
 * Manages available package sources and cache warming.
 */

import type { PackageSourceOption } from '../components/sourceSelector';

/**
 * Manages package sources state
 */
export class SourcesState {
  private sources: PackageSourceOption[] = [];
  private cacheWarmed = false;
  private cacheWarming = false;

  /**
   * Set available package sources
   */
  setSources(sources: PackageSourceOption[]): void {
    this.sources = sources;
  }

  /**
   * Get available package sources
   */
  getSources(): PackageSourceOption[] {
    return this.sources;
  }

  /**
   * Set cache warmed state
   */
  setCacheWarmed(warmed: boolean): void {
    this.cacheWarmed = warmed;
  }

  /**
   * Get cache warmed state
   */
  isCacheWarmed(): boolean {
    return this.cacheWarmed;
  }

  /**
   * Set cache warming state
   */
  setCacheWarming(warming: boolean): void {
    this.cacheWarming = warming;
  }

  /**
   * Get cache warming state
   */
  isCacheWarming(): boolean {
    return this.cacheWarming;
  }

  /**
   * Clear all state
   */
  clear(): void {
    this.sources = [];
    this.cacheWarmed = false;
    this.cacheWarming = false;
  }
}
