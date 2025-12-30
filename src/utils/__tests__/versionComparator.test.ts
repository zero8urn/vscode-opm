/**
 * Unit tests for semantic version comparison utilities.
 * @module utils/__tests__/versionComparator.test
 */

import { describe, it, expect } from 'bun:test';
import { compareVersions, sortVersionsDescending, sortVersionsAscending } from '../versionComparator';

describe('versionComparator', () => {
  describe('compareVersions', () => {
    describe('major version comparison', () => {
      it('should correctly compare different major versions', () => {
        expect(compareVersions('2.0.0', '1.0.0')).toBeGreaterThan(0);
        expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0);
        expect(compareVersions('10.0.0', '2.0.0')).toBeGreaterThan(0); // Numeric, not lexicographic
        expect(compareVersions('2.0.0', '10.0.0')).toBeLessThan(0);
      });

      it('should handle large major version numbers', () => {
        expect(compareVersions('100.0.0', '99.0.0')).toBeGreaterThan(0);
        expect(compareVersions('20.0.0', '9.0.0')).toBeGreaterThan(0);
      });
    });

    describe('minor version comparison', () => {
      it('should correctly compare different minor versions', () => {
        expect(compareVersions('1.10.0', '1.2.0')).toBeGreaterThan(0); // Numeric comparison
        expect(compareVersions('1.2.0', '1.10.0')).toBeLessThan(0);
        expect(compareVersions('1.9.0', '1.10.0')).toBeLessThan(0);
      });
    });

    describe('patch version comparison', () => {
      it('should correctly compare different patch versions', () => {
        expect(compareVersions('1.0.10', '1.0.2')).toBeGreaterThan(0); // Numeric comparison
        expect(compareVersions('1.0.2', '1.0.10')).toBeLessThan(0);
        expect(compareVersions('1.0.99', '1.0.100')).toBeLessThan(0);
      });
    });

    describe('prerelease version comparison', () => {
      it('should treat prerelease as lower precedence than release', () => {
        expect(compareVersions('1.0.0-beta', '1.0.0')).toBeLessThan(0);
        expect(compareVersions('1.0.0', '1.0.0-beta')).toBeGreaterThan(0);
        expect(compareVersions('1.0.0-alpha', '1.0.0')).toBeLessThan(0);
      });

      it('should compare prerelease identifiers lexicographically', () => {
        expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBeLessThan(0);
        expect(compareVersions('1.0.0-beta', '1.0.0-alpha')).toBeGreaterThan(0);
        expect(compareVersions('1.0.0-rc.1', '1.0.0-rc.2')).toBeLessThan(0);
      });

      it('should compare numeric prerelease parts numerically', () => {
        expect(compareVersions('1.0.0-beta.10', '1.0.0-beta.2')).toBeGreaterThan(0);
        expect(compareVersions('1.0.0-beta.2', '1.0.0-beta.10')).toBeLessThan(0);
        expect(compareVersions('1.0.0-rc.100', '1.0.0-rc.99')).toBeGreaterThan(0);
      });

      it('should handle mixed alphanumeric prerelease parts', () => {
        expect(compareVersions('1.0.0-alpha.1', '1.0.0-alpha.beta')).toBeLessThan(0); // Numeric < alpha
        expect(compareVersions('1.0.0-beta.1.2', '1.0.0-beta.1.10')).toBeLessThan(0);
      });

      it('should handle missing prerelease parts', () => {
        expect(compareVersions('1.0.0-beta', '1.0.0-beta.1')).toBeLessThan(0);
        expect(compareVersions('1.0.0-beta.1', '1.0.0-beta')).toBeGreaterThan(0);
      });
    });

    describe('build metadata', () => {
      it('should ignore build metadata for precedence', () => {
        expect(compareVersions('1.0.0+build.123', '1.0.0+build.456')).toBe(0);
        expect(compareVersions('1.0.0+build', '1.0.0')).toBe(0);
        expect(compareVersions('1.0.0-beta+build', '1.0.0-beta')).toBe(0);
      });
    });

    describe('equal versions', () => {
      it('should return 0 for identical versions', () => {
        expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
        expect(compareVersions('2.5.7', '2.5.7')).toBe(0);
        expect(compareVersions('1.0.0-beta.1', '1.0.0-beta.1')).toBe(0);
      });
    });

    describe('short version formats', () => {
      it('should handle two-part versions (treat as x.y.0)', () => {
        expect(compareVersions('1.2', '1.2.0')).toBe(0);
        expect(compareVersions('1.2', '1.1.9')).toBeGreaterThan(0);
      });

      it('should handle single-part versions (treat as x.0.0)', () => {
        expect(compareVersions('2', '2.0.0')).toBe(0);
        expect(compareVersions('2', '1.9.9')).toBeGreaterThan(0);
      });
    });

    describe('edge cases', () => {
      it('should handle leading "v" prefix', () => {
        expect(compareVersions('v1.0.0', '1.0.0')).toBe(0);
        expect(compareVersions('v2.0.0', 'v1.0.0')).toBeGreaterThan(0);
      });

      it('should handle zero versions', () => {
        expect(compareVersions('0.0.0', '0.0.0')).toBe(0);
        expect(compareVersions('0.0.1', '0.0.0')).toBeGreaterThan(0);
      });
    });

    describe('real-world NuGet version examples', () => {
      it('should correctly order Microsoft.Extensions.DependencyInjection.Abstractions versions', () => {
        // From the screenshot - 10.0.1 should come before 3.1.12
        expect(compareVersions('10.0.1', '3.1.12')).toBeGreaterThan(0);
        expect(compareVersions('10.0.1', '9.0.0')).toBeGreaterThan(0);
        expect(compareVersions('3.1.12', '3.1.11')).toBeGreaterThan(0);
        expect(compareVersions('3.1.11', '3.1.10')).toBeGreaterThan(0);
      });

      it('should correctly order common NuGet version sequences', () => {
        expect(compareVersions('8.0.0', '7.0.0')).toBeGreaterThan(0);
        expect(compareVersions('6.0.1', '6.0.0')).toBeGreaterThan(0);
        expect(compareVersions('5.0.0-rc.2', '5.0.0-rc.1')).toBeGreaterThan(0);
        expect(compareVersions('5.0.0', '5.0.0-rc.2')).toBeGreaterThan(0);
      });
    });
  });

  describe('sortVersionsDescending', () => {
    it('should sort versions newest to oldest', () => {
      const versions = ['1.0.0', '2.0.0', '1.5.0', '10.0.0', '3.0.0'];
      const sorted = sortVersionsDescending(versions);
      expect(sorted).toEqual(['10.0.0', '3.0.0', '2.0.0', '1.5.0', '1.0.0']);
    });

    it('should handle prerelease versions', () => {
      const versions = ['1.0.0', '1.0.0-beta', '1.0.0-alpha', '2.0.0', '1.0.0-rc'];
      const sorted = sortVersionsDescending(versions);
      expect(sorted).toEqual(['2.0.0', '1.0.0', '1.0.0-rc', '1.0.0-beta', '1.0.0-alpha']);
    });

    it('should handle real-world NuGet version list', () => {
      const versions = ['3.1.12', '3.1.11', '3.1.10', '10.0.1', '10.0.0', '9.0.0', '8.0.0', '2.1.1', '2.0.0'];
      const sorted = sortVersionsDescending(versions);
      expect(sorted).toEqual(['10.0.1', '10.0.0', '9.0.0', '8.0.0', '3.1.12', '3.1.11', '3.1.10', '2.1.1', '2.0.0']);
    });

    it('should not mutate original array', () => {
      const original = ['1.0.0', '2.0.0', '1.5.0'];
      const originalCopy = [...original];
      sortVersionsDescending(original);
      expect(original).toEqual(originalCopy);
    });
  });

  describe('sortVersionsAscending', () => {
    it('should sort versions oldest to newest', () => {
      const versions = ['10.0.0', '2.0.0', '1.5.0', '1.0.0', '3.0.0'];
      const sorted = sortVersionsAscending(versions);
      expect(sorted).toEqual(['1.0.0', '1.5.0', '2.0.0', '3.0.0', '10.0.0']);
    });

    it('should handle prerelease versions', () => {
      const versions = ['2.0.0', '1.0.0-beta', '1.0.0', '1.0.0-alpha'];
      const sorted = sortVersionsAscending(versions);
      expect(sorted).toEqual(['1.0.0-alpha', '1.0.0-beta', '1.0.0', '2.0.0']);
    });

    it('should not mutate original array', () => {
      const original = ['1.0.0', '2.0.0', '1.5.0'];
      const originalCopy = [...original];
      sortVersionsAscending(original);
      expect(original).toEqual(originalCopy);
    });
  });
});
