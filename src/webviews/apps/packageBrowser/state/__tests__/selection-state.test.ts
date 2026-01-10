/**
 * Unit tests for SelectionState
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { SelectionState } from '../selection-state.js';
import type { ProjectInfo } from '../../types.js';

const createMockProject = (name: string, path: string, installedVersion?: string): ProjectInfo => ({
  name,
  path,
  relativePath: `src/${name}/${name}.csproj`,
  frameworks: ['net8.0'],
  installedVersion,
});

describe('SelectionState', () => {
  let selectionState: SelectionState;
  let projects: ProjectInfo[];

  beforeEach(() => {
    projects = [
      createMockProject('MyApp.Web', '/workspace/src/MyApp.Web/MyApp.Web.csproj'),
      createMockProject('MyApp.Core', '/workspace/src/MyApp.Core/MyApp.Core.csproj'),
      createMockProject('MyApp.Tests', '/workspace/tests/MyApp.Tests/MyApp.Tests.csproj', '13.0.3'),
    ];
    selectionState = new SelectionState(projects);
  });

  describe('setProjects', () => {
    test('updates projects list', () => {
      const newProjects = [createMockProject('NewProject', '/workspace/NewProject.csproj')];
      selectionState.setProjects(newProjects);
      expect(selectionState.getAvailableProjects()).toHaveLength(1);
    });

    test('clears selections for projects that no longer exist', () => {
      selectionState.toggleProject(projects[0]!.path);
      expect(selectionState.getSelectedCount()).toBe(1);

      const newProjects = [projects[1]!, projects[2]!];
      selectionState.setProjects(newProjects);
      expect(selectionState.getSelectedCount()).toBe(0);
    });
  });

  describe('getAvailableProjects', () => {
    test('returns projects without installed version', () => {
      const available = selectionState.getAvailableProjects();
      expect(available).toHaveLength(2);
      expect(available.every(p => p.installedVersion === undefined)).toBe(true);
    });
  });

  describe('getInstalledProjects', () => {
    test('returns projects with installed version', () => {
      const installed = selectionState.getInstalledProjects();
      expect(installed).toHaveLength(1);
      expect(installed[0]!.name).toBe('MyApp.Tests');
    });
  });

  describe('toggleProject', () => {
    test('selects unselected project', () => {
      selectionState.toggleProject(projects[0]!.path);
      expect(selectionState.isSelected(projects[0]!.path)).toBe(true);
    });

    test('deselects selected project', () => {
      selectionState.toggleProject(projects[0]!.path);
      selectionState.toggleProject(projects[0]!.path);
      expect(selectionState.isSelected(projects[0]!.path)).toBe(false);
    });
  });

  describe('getSelectedCount', () => {
    test('returns 0 when no projects selected', () => {
      expect(selectionState.getSelectedCount()).toBe(0);
    });

    test('returns correct count when projects selected', () => {
      selectionState.toggleProject(projects[0]!.path);
      selectionState.toggleProject(projects[1]!.path);
      expect(selectionState.getSelectedCount()).toBe(2);
    });
  });

  describe('selectAll', () => {
    test('selects all available projects', () => {
      selectionState.selectAll();
      expect(selectionState.getSelectedCount()).toBe(2); // Only available projects
      expect(selectionState.isSelected(projects[0]!.path)).toBe(true);
      expect(selectionState.isSelected(projects[1]!.path)).toBe(true);
      expect(selectionState.isSelected(projects[2]!.path)).toBe(false); // Installed project
    });
  });

  describe('clearSelections', () => {
    test('clears all selections', () => {
      selectionState.toggleProject(projects[0]!.path);
      selectionState.toggleProject(projects[1]!.path);
      selectionState.clearSelections();
      expect(selectionState.getSelectedCount()).toBe(0);
    });
  });

  describe('getSelectAllState', () => {
    test('returns unchecked when no projects selected', () => {
      expect(selectionState.getSelectAllState()).toBe('unchecked');
    });

    test('returns checked when all available projects selected', () => {
      selectionState.selectAll();
      expect(selectionState.getSelectAllState()).toBe('checked');
    });

    test('returns indeterminate when some available projects selected', () => {
      selectionState.toggleProject(projects[0]!.path);
      expect(selectionState.getSelectAllState()).toBe('indeterminate');
    });

    test('returns unchecked when no available projects', () => {
      const installedOnly = [
        createMockProject('Installed1', '/path/1', '1.0.0'),
        createMockProject('Installed2', '/path/2', '1.0.0'),
      ];
      const state = new SelectionState(installedOnly);
      expect(state.getSelectAllState()).toBe('unchecked');
    });
  });

  describe('toggleSelectAll', () => {
    test('selects all when unchecked', () => {
      selectionState.toggleSelectAll();
      expect(selectionState.getSelectAllState()).toBe('checked');
    });

    test('deselects all when checked', () => {
      selectionState.selectAll();
      selectionState.toggleSelectAll();
      expect(selectionState.getSelectAllState()).toBe('unchecked');
    });

    test('deselects all when indeterminate', () => {
      selectionState.toggleProject(projects[0]!.path);
      selectionState.toggleSelectAll();
      expect(selectionState.getSelectAllState()).toBe('unchecked');
    });
  });
});
