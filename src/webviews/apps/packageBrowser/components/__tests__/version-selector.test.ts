/**
 * Unit tests for VersionSelector component.
 */

import { describe, test, expect } from 'bun:test';
import { VersionSelector, VERSION_SELECTOR_TAG } from '../version-selector';
import type { VersionMetadata } from '../version-selector';
import {
  isPrerelease,
  sortVersionsDescending,
  compareVersions,
  identifyVersionBadges,
  getDefaultVersion,
  parseVersion,
  filterVersions,
} from '../../utils/versionUtils';

describe('VersionSelector Component Module', () => {
  describe('Component Exports', () => {
    test('should export VersionSelector class', () => {
      expect(VersionSelector).toBeDefined();
      expect(typeof VersionSelector).toBe('function');
    });

    test('should export tag constant', () => {
      expect(VERSION_SELECTOR_TAG).toBe('version-selector');
    });
  });

  describe('Component Initialization', () => {
    test('should have default packageId as empty string', () => {
      const instance = new VersionSelector();
      expect(instance.packageId).toBe('');
    });

    test('should have default selectedVersion as empty string', () => {
      const instance = new VersionSelector();
      expect(instance.selectedVersion).toBe('');
    });

    test('should have default includePrerelease as false', () => {
      const instance = new VersionSelector();
      expect(instance.includePrerelease).toBe(false);
    });
  });

  describe('Property Updates', () => {
    test('should update packageId property', () => {
      const instance = new VersionSelector();
      instance.packageId = 'Newtonsoft.Json';
      expect(instance.packageId).toBe('Newtonsoft.Json');
    });

    test('should update selectedVersion property', () => {
      const instance = new VersionSelector();
      instance.selectedVersion = '13.0.3';
      expect(instance.selectedVersion).toBe('13.0.3');
    });

    test('should update includePrerelease property', () => {
      const instance = new VersionSelector();
      instance.includePrerelease = true;
      expect(instance.includePrerelease).toBe(true);
    });
  });

  describe('Version Identification', () => {
    test('should identify prerelease versions correctly', () => {
      expect(isPrerelease('13.0.3')).toBe(false);
      expect(isPrerelease('13.0.3-beta1')).toBe(true);
      expect(isPrerelease('2.0.0-rc1')).toBe(true);
      expect(isPrerelease('1.0.0-alpha')).toBe(true);
    });
  });

  describe('Version Sorting', () => {
    test('should sort versions in descending order', () => {
      const instance = new VersionSelector();
      const versions: VersionMetadata[] = [
        { version: '1.0.0', listed: true, isPrerelease: false, publishedDate: '2020-01-01' },
        { version: '2.5.1', listed: true, isPrerelease: false, publishedDate: '2021-01-01' },
        { version: '2.5.0', listed: true, isPrerelease: false, publishedDate: '2021-01-01' },
        { version: '10.0.0', listed: true, isPrerelease: false, publishedDate: '2023-01-01' },
        { version: '2.0.0', listed: true, isPrerelease: false, publishedDate: '2020-06-01' },
      ];

      const sorted = sortVersionsDescending(versions);

      expect(sorted.map(v => v.version)).toEqual(['10.0.0', '2.5.1', '2.5.0', '2.0.0', '1.0.0']);
    });

    test('should sort stable versions before prerelease with same numeric part', () => {
      const instance = new VersionSelector();
      const versions: VersionMetadata[] = [
        { version: '2.0.0-beta1', listed: true, isPrerelease: true, publishedDate: '2020-05-01' },
        { version: '2.0.0', listed: true, isPrerelease: false, publishedDate: '2020-06-01' },
        { version: '2.0.0-alpha', listed: true, isPrerelease: true, publishedDate: '2020-04-01' },
      ];

      const sorted = sortVersionsDescending(versions);

      expect(sorted.map(v => v.version)).toEqual([
        '2.0.0', // Stable first
        '2.0.0-beta1',
        '2.0.0-alpha',
      ]);
    });

    test('should handle versions with different segment counts', () => {
      const instance = new VersionSelector();
      const versions: VersionMetadata[] = [
        { version: '1.0', listed: true, isPrerelease: false, publishedDate: '2020-01-01' },
        { version: '1.0.1', listed: true, isPrerelease: false, publishedDate: '2020-02-01' },
        { version: '1', listed: true, isPrerelease: false, publishedDate: '2019-01-01' },
      ];

      const sorted = sortVersionsDescending(versions);

      expect(sorted.map(v => v.version)).toEqual(['1.0.1', '1.0', '1']);
    });

    test('should compare version strings correctly', () => {
      const instance = new VersionSelector();

      expect(compareVersions('2.0.0', '1.0.0')).toBeGreaterThan(0);
      expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0);
      expect(compareVersions('2.0.0', '2.0.0')).toBe(0);
    });

    test('should compare prerelease strings alphabetically', () => {
      const instance = new VersionSelector();

      const result = compareVersions('2.0.0-rc1', '2.0.0-beta1');
      expect(result).toBeGreaterThan(0); // rc1 > beta1
    });
  });

  describe('Badge Identification', () => {
    test('should identify latest stable version', () => {
      const instance = new VersionSelector();
      const versions: VersionMetadata[] = [
        { version: '13.0.3', listed: true, isPrerelease: false, publishedDate: '2023-01-01' },
        { version: '12.0.3', listed: true, isPrerelease: false, publishedDate: '2022-01-01' },
        { version: '11.0.2', listed: true, isPrerelease: false, publishedDate: '2021-01-01' },
      ];

      const badgeMap = identifyVersionBadges(versions);

      const latestBadge = badgeMap.get('13.0.3');
      expect(latestBadge).toBeDefined();
      expect(latestBadge?.type).toBe('latest-stable');
      expect(latestBadge?.label).toBe('Latest stable');
      expect(badgeMap.get('12.0.3')).toBeUndefined();
    });

    test('should identify latest prerelease version', () => {
      const instance = new VersionSelector();
      const versions: VersionMetadata[] = [
        { version: '14.0.0-beta1', listed: true, isPrerelease: true, publishedDate: '2023-06-01' },
        { version: '13.0.3', listed: true, isPrerelease: false, publishedDate: '2023-01-01' },
        { version: '14.0.0-alpha', listed: true, isPrerelease: true, publishedDate: '2023-05-01' },
      ];

      const badgeMap = identifyVersionBadges(versions);

      const latestPrereleaseBadge = badgeMap.get('14.0.0-beta1');
      expect(latestPrereleaseBadge).toBeDefined();
      expect(latestPrereleaseBadge?.type).toBe('latest-prerelease');
      expect(latestPrereleaseBadge?.label).toBe('Latest prerelease');
    });

    test('should mark all other prerelease versions with Prerelease badge', () => {
      const instance = new VersionSelector();
      const versions: VersionMetadata[] = [
        { version: '14.0.0-beta1', listed: true, isPrerelease: true, publishedDate: '2023-06-01' },
        { version: '14.0.0-alpha', listed: true, isPrerelease: true, publishedDate: '2023-05-01' },
        { version: '13.0.3', listed: true, isPrerelease: false, publishedDate: '2023-01-01' },
      ];

      const badgeMap = identifyVersionBadges(versions);

      const alphaBadge = badgeMap.get('14.0.0-alpha');
      expect(alphaBadge).toBeDefined();
      expect(alphaBadge?.type).toBe('prerelease');
      expect(alphaBadge?.label).toBe('Prerelease');
    });

    test('should return empty map for no versions', () => {
      const instance = new VersionSelector();
      const badgeMap = identifyVersionBadges([]);
      expect(badgeMap.size).toBe(0);
    });
  });

  describe('Default Version Selection', () => {
    test('should select latest stable when includePrerelease is false', () => {
      const instance = new VersionSelector();
      instance.includePrerelease = false;

      (instance as any).versions = [
        { version: '14.0.0-beta1', listed: true, isPrerelease: true, publishedDate: '2023-06-01' },
        { version: '13.0.3', listed: true, isPrerelease: false, publishedDate: '2023-01-01' },
        { version: '12.0.3', listed: true, isPrerelease: false, publishedDate: '2022-01-01' },
      ];

      const defaultVersion = getDefaultVersion((instance as any).versions, instance.includePrerelease);
      expect(defaultVersion?.version).toBe('13.0.3');
    });

    test('should select latest version when includePrerelease is true', () => {
      const instance = new VersionSelector();
      instance.includePrerelease = true;

      (instance as any).versions = [
        { version: '14.0.0-beta1', listed: true, isPrerelease: true, publishedDate: '2023-06-01' },
        { version: '13.0.3', listed: true, isPrerelease: false, publishedDate: '2023-01-01' },
      ];

      const defaultVersion = getDefaultVersion((instance as any).versions, instance.includePrerelease);
      expect(defaultVersion?.version).toBe('14.0.0-beta1');
    });
  });

  describe('Filtered Versions', () => {
    test('should exclude prerelease versions when includePrerelease is false', () => {
      const instance = new VersionSelector();
      instance.includePrerelease = false;

      (instance as any).versions = [
        { version: '14.0.0-beta1', listed: true, isPrerelease: true, publishedDate: '2023-06-01' },
        { version: '13.0.3', listed: true, isPrerelease: false, publishedDate: '2023-01-01' },
        { version: '12.0.3', listed: true, isPrerelease: false, publishedDate: '2022-01-01' },
      ];

      const filtered = filterVersions((instance as any).versions, instance.includePrerelease);
      expect(filtered.map(v => v.version)).toEqual(['13.0.3', '12.0.3']);
    });

    test('should include all versions when includePrerelease is true', () => {
      const instance = new VersionSelector();
      instance.includePrerelease = true;

      (instance as any).versions = [
        { version: '14.0.0-beta1', listed: true, isPrerelease: true, publishedDate: '2023-06-01' },
        { version: '13.0.3', listed: true, isPrerelease: false, publishedDate: '2023-01-01' },
        { version: '12.0.3', listed: true, isPrerelease: false, publishedDate: '2022-01-01' },
      ];

      const filtered = filterVersions((instance as any).versions, instance.includePrerelease);
      expect(filtered).toHaveLength(3);
    });
  });

  describe('Version Parsing Utilities', () => {
    test('should parse version string into numeric and prerelease parts', () => {
      const v1 = parseVersion('13.0.3');
      expect(v1.numeric).toEqual([13, 0, 3]);
      expect(v1.prerelease).toBeNull();

      const v2 = parseVersion('14.0.0-beta1');
      expect(v2.numeric).toEqual([14, 0, 0]);
      expect(v2.prerelease).toBe('beta1');
    });

    test('should handle version strings with missing parts', () => {
      const v1 = parseVersion('1.0');
      expect(v1.numeric).toEqual([1, 0]);
      expect(v1.prerelease).toBeNull();

      const v2 = parseVersion('2');
      expect(v2.numeric).toEqual([2]);
      expect(v2.prerelease).toBeNull();
    });
  });
});
