/**
 * Search state management for package browser
 *
 * Manages search query, results, pagination, and loading states.
 */

import type { PackageSearchResult } from '../types';

export interface SearchError {
  message: string;
  code: string;
}

/**
 * Manages search-related state for the package browser
 */
export class SearchState {
  private query = '';
  private results: PackageSearchResult[] = [];
  private totalHits = 0;
  private hasMore = false;
  private loading = false;
  private includePrerelease = false;
  private error: SearchError | null = null;
  private selectedSourceId = 'all';

  /**
   * Set the current search query
   */
  setQuery(query: string): void {
    this.query = query;
  }

  /**
   * Get the current search query
   */
  getQuery(): string {
    return this.query;
  }

  /**
   * Set search results
   */
  setResults(results: PackageSearchResult[], totalHits: number, hasMore: boolean): void {
    this.results = results;
    this.totalHits = totalHits;
    this.hasMore = hasMore;
  }

  /**
   * Append more results (for pagination)
   */
  appendResults(results: PackageSearchResult[], totalHits: number, hasMore: boolean): void {
    this.results = [...this.results, ...results];
    this.totalHits = totalHits;
    this.hasMore = hasMore;
  }

  /**
   * Get current search results
   */
  getResults(): PackageSearchResult[] {
    return this.results;
  }

  /**
   * Get total number of search hits
   */
  getTotalHits(): number {
    return this.totalHits;
  }

  /**
   * Check if there are more results to load
   */
  getHasMore(): boolean {
    return this.hasMore;
  }

  /**
   * Set loading state
   */
  setLoading(loading: boolean): void {
    this.loading = loading;
  }

  /**
   * Get loading state
   */
  isLoading(): boolean {
    return this.loading;
  }

  /**
   * Set prerelease filter
   */
  setIncludePrerelease(include: boolean): void {
    this.includePrerelease = include;
  }

  /**
   * Get prerelease filter
   */
  getIncludePrerelease(): boolean {
    return this.includePrerelease;
  }

  /**
   * Set search error
   */
  setError(error: SearchError | null): void {
    this.error = error;
  }

  /**
   * Get search error
   */
  getError(): SearchError | null {
    return this.error;
  }

  /**
   * Clear search error
   */
  clearError(): void {
    this.error = null;
  }

  /**
   * Set selected package source ID
   */
  setSelectedSourceId(sourceId: string): void {
    this.selectedSourceId = sourceId;
  }

  /**
   * Get selected package source ID
   */
  getSelectedSourceId(): string {
    return this.selectedSourceId;
  }

  /**
   * Clear all search results and state
   */
  clear(): void {
    this.query = '';
    this.results = [];
    this.totalHits = 0;
    this.hasMore = false;
    this.loading = false;
    this.error = null;
  }

  /**
   * Reset to initial state
   */
  reset(): void {
    this.clear();
    this.includePrerelease = false;
    this.selectedSourceId = 'all';
  }
}
