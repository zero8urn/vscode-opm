/**
 * Projects state management
 *
 * Manages the cached projects list and loading states.
 */

import type { ProjectInfo } from '../types';

/**
 * Manages projects state for the package browser
 */
export class ProjectsState {
  private cachedProjects: ProjectInfo[] = [];
  private loading = false;
  private fetched = false;

  /**
   * Set cached projects
   */
  setProjects(projects: ProjectInfo[]): void {
    this.cachedProjects = projects;
    this.fetched = true;
  }

  /**
   * Get cached projects
   */
  getProjects(): ProjectInfo[] {
    return this.cachedProjects;
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
   * Check if projects have been fetched
   */
  isFetched(): boolean {
    return this.fetched;
  }

  /**
   * Update a specific project in the cache
   */
  updateProject(projectPath: string, updater: (project: ProjectInfo) => ProjectInfo): void {
    this.cachedProjects = this.cachedProjects.map(p => (p.path === projectPath ? updater(p) : p));
  }

  /**
   * Clear all state
   */
  clear(): void {
    this.cachedProjects = [];
    this.loading = false;
    this.fetched = false;
  }
}
