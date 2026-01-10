/**
 * Selection state management for project selector
 */

import type { ProjectInfo, SelectAllState } from '../types';

/**
 * Manages the selection state of projects for installation
 */
export class SelectionState {
  private selectedProjects: Set<string> = new Set();

  constructor(private projects: ProjectInfo[] = []) {}

  /**
   * Update the projects list (e.g., after fetching from IPC)
   */
  setProjects(projects: ProjectInfo[]): void {
    this.projects = projects;
    // Clear selections for projects that no longer exist
    const validPaths = new Set(projects.map(p => p.path));
    this.selectedProjects.forEach(path => {
      if (!validPaths.has(path)) {
        this.selectedProjects.delete(path);
      }
    });
  }

  /**
   * Get projects that are available for installation (not already installed)
   */
  getAvailableProjects(): ProjectInfo[] {
    return this.projects.filter(p => p.installedVersion === undefined);
  }

  /**
   * Get projects that already have the package installed
   */
  getInstalledProjects(): ProjectInfo[] {
    return this.projects.filter(p => p.installedVersion !== undefined);
  }

  /**
   * Toggle selection for a specific project path
   */
  toggleProject(projectPath: string): void {
    if (this.selectedProjects.has(projectPath)) {
      this.selectedProjects.delete(projectPath);
    } else {
      this.selectedProjects.add(projectPath);
    }
  }

  /**
   * Check if a project is selected
   */
  isSelected(projectPath: string): boolean {
    return this.selectedProjects.has(projectPath);
  }

  /**
   * Get all selected project paths
   */
  getSelectedPaths(): string[] {
    return Array.from(this.selectedProjects);
  }

  /**
   * Get count of selected projects
   */
  getSelectedCount(): number {
    return this.selectedProjects.size;
  }

  /**
   * Clear all selections
   */
  clearSelections(): void {
    this.selectedProjects.clear();
  }

  /**
   * Select all available projects (excluding already installed)
   */
  selectAll(): void {
    const available = this.getAvailableProjects();
    available.forEach(p => this.selectedProjects.add(p.path));
  }

  /**
   * Determine the "Select All" checkbox state
   */
  getSelectAllState(): SelectAllState {
    const available = this.getAvailableProjects();

    if (available.length === 0) {
      return 'unchecked';
    }

    const selectedCount = available.filter(p => this.selectedProjects.has(p.path)).length;

    if (selectedCount === 0) {
      return 'unchecked';
    }
    if (selectedCount === available.length) {
      return 'checked';
    }

    return 'indeterminate';
  }

  /**
   * Toggle "Select All" state (cycle through unchecked → checked → unchecked)
   */
  toggleSelectAll(): void {
    const state = this.getSelectAllState();
    const available = this.getAvailableProjects();

    if (state === 'checked' || state === 'indeterminate') {
      // Unselect all available projects
      available.forEach(p => this.selectedProjects.delete(p.path));
    } else {
      // Select all available projects
      available.forEach(p => this.selectedProjects.add(p.path));
    }
  }
}
