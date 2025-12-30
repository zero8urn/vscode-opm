/**
 * Unit tests for .NET framework comparison utilities.
 * @module utils/__tests__/frameworkComparator.test
 */

import { describe, it, expect } from 'bun:test';
import { compareFrameworks, sortFrameworksDescending } from '../frameworkComparator';

describe('frameworkComparator', () => {
  describe('compareFrameworks', () => {
    describe('modern .NET (net5.0+) precedence', () => {
      it('should rank modern .NET highest', () => {
        expect(compareFrameworks('net8.0', 'netstandard2.0')).toBeGreaterThan(0);
        expect(compareFrameworks('net6.0', 'netcoreapp3.1')).toBeGreaterThan(0);
        expect(compareFrameworks('net7.0', 'net48')).toBeGreaterThan(0);
        expect(compareFrameworks('net5.0', '.NETFramework4.7.2')).toBeGreaterThan(0);
      });

      it('should sort modern .NET versions by version number', () => {
        expect(compareFrameworks('net8.0', 'net7.0')).toBeGreaterThan(0);
        expect(compareFrameworks('net7.0', 'net6.0')).toBeGreaterThan(0);
        expect(compareFrameworks('net6.0', 'net5.0')).toBeGreaterThan(0);
      });

      it('should handle minor version differences', () => {
        expect(compareFrameworks('net8.0', 'net8.0')).toBe(0);
        // Future-proofing for potential minor versions
        expect(compareFrameworks('net9.0', 'net8.0')).toBeGreaterThan(0);
      });
    });

    describe('.NET Core precedence', () => {
      it('should rank .NET Core above .NET Standard and .NET Framework', () => {
        expect(compareFrameworks('netcoreapp3.1', 'netstandard2.0')).toBeGreaterThan(0);
        expect(compareFrameworks('netcoreapp2.1', 'net48')).toBeGreaterThan(0);
      });

      it('should rank .NET Core below modern .NET', () => {
        expect(compareFrameworks('netcoreapp3.1', 'net5.0')).toBeLessThan(0);
        expect(compareFrameworks('netcoreapp2.1', 'net6.0')).toBeLessThan(0);
      });

      it('should sort .NET Core versions by version number', () => {
        expect(compareFrameworks('netcoreapp3.1', 'netcoreapp3.0')).toBeGreaterThan(0);
        expect(compareFrameworks('netcoreapp3.0', 'netcoreapp2.1')).toBeGreaterThan(0);
        expect(compareFrameworks('netcoreapp2.1', 'netcoreapp2.0')).toBeGreaterThan(0);
      });
    });

    describe('.NET Standard precedence', () => {
      it('should rank .NET Standard above .NET Framework', () => {
        expect(compareFrameworks('netstandard2.0', 'net48')).toBeGreaterThan(0);
        expect(compareFrameworks('netstandard2.1', '.NETFramework4.7.2')).toBeGreaterThan(0);
      });

      it('should rank .NET Standard below .NET Core and modern .NET', () => {
        expect(compareFrameworks('netstandard2.0', 'netcoreapp2.1')).toBeLessThan(0);
        expect(compareFrameworks('netstandard2.1', 'net5.0')).toBeLessThan(0);
      });

      it('should sort .NET Standard versions by version number', () => {
        expect(compareFrameworks('netstandard2.1', 'netstandard2.0')).toBeGreaterThan(0);
        expect(compareFrameworks('netstandard2.0', 'netstandard1.6')).toBeGreaterThan(0);
        expect(compareFrameworks('netstandard1.6', 'netstandard1.0')).toBeGreaterThan(0);
      });

      it('should handle verbose .NET Standard format', () => {
        expect(compareFrameworks('.NETStandard2.0', 'netstandard2.0')).toBe(0);
        expect(compareFrameworks('.NETStandard2.1', '.NETStandard2.0')).toBeGreaterThan(0);
      });
    });

    describe('.NET Framework precedence', () => {
      it('should rank .NET Framework lowest (except "Other")', () => {
        expect(compareFrameworks('net48', 'netstandard2.0')).toBeLessThan(0);
        expect(compareFrameworks('net472', 'netcoreapp2.1')).toBeLessThan(0);
        expect(compareFrameworks('.NETFramework4.8', 'net5.0')).toBeLessThan(0);
      });

      it('should sort .NET Framework versions by version number', () => {
        expect(compareFrameworks('net48', 'net472')).toBeGreaterThan(0);
        expect(compareFrameworks('net472', 'net462')).toBeGreaterThan(0);
        expect(compareFrameworks('net462', 'net461')).toBeGreaterThan(0);
      });

      it('should handle verbose .NET Framework format', () => {
        expect(compareFrameworks('.NETFramework4.8', 'net48')).toBe(0);
        expect(compareFrameworks('.NETFramework4.7.2', '.NETFramework4.6.2')).toBeGreaterThan(0);
      });

      it('should handle three-part .NET Framework versions', () => {
        expect(compareFrameworks('.NETFramework4.7.2', '.NETFramework4.7.1')).toBeGreaterThan(0);
        expect(compareFrameworks('.NETFramework4.6.2', '.NETFramework4.6.1')).toBeGreaterThan(0);
      });
    });

    describe('special cases', () => {
      it('should handle empty/Any framework', () => {
        expect(compareFrameworks('', 'net6.0')).toBeLessThan(0);
        expect(compareFrameworks('Any', 'net6.0')).toBeLessThan(0);
        expect(compareFrameworks('', 'Any')).toBe(0);
      });

      it('should handle unknown frameworks alphabetically', () => {
        expect(compareFrameworks('uap10.0', 'net6.0')).toBeLessThan(0);
        expect(compareFrameworks('xamarin.ios', 'net6.0')).toBeLessThan(0);
      });

      it('should handle case-insensitive comparison', () => {
        expect(compareFrameworks('NET8.0', 'net8.0')).toBe(0);
        expect(compareFrameworks('NetStandard2.0', 'NETSTANDARD2.0')).toBe(0);
      });
    });

    describe('real-world framework examples', () => {
      it('should correctly order Microsoft.Extensions.DependencyInjection.Abstractions frameworks', () => {
        // From the screenshot - newer frameworks should come first
        const frameworks = ['.NETFramework4.6.2', 'net8.0', 'netstandard2.0', 'net6.0', '.NETFramework4.7.1'];

        // net8.0 should rank highest
        expect(compareFrameworks('net8.0', 'net6.0')).toBeGreaterThan(0);
        expect(compareFrameworks('net8.0', 'netstandard2.0')).toBeGreaterThan(0);
        expect(compareFrameworks('net8.0', '.NETFramework4.6.2')).toBeGreaterThan(0);

        // net6.0 should rank above .NET Standard and .NET Framework
        expect(compareFrameworks('net6.0', 'netstandard2.0')).toBeGreaterThan(0);
        expect(compareFrameworks('net6.0', '.NETFramework4.7.1')).toBeGreaterThan(0);

        // .NET Standard should rank above .NET Framework
        expect(compareFrameworks('netstandard2.0', '.NETFramework4.6.2')).toBeGreaterThan(0);
        expect(compareFrameworks('netstandard2.0', '.NETFramework4.7.1')).toBeGreaterThan(0);

        // .NET Framework versions should be ordered
        expect(compareFrameworks('.NETFramework4.7.1', '.NETFramework4.6.2')).toBeGreaterThan(0);
      });
    });
  });

  describe('sortFrameworksDescending', () => {
    it('should sort frameworks by preference (newest/most modern first)', () => {
      const frameworks = [
        '.NETFramework4.6.2',
        'net8.0',
        'netstandard2.0',
        'net6.0',
        'netcoreapp3.1',
        '.NETFramework4.7.2',
      ];

      const sorted = sortFrameworksDescending(frameworks);

      expect(sorted).toEqual([
        'net8.0',
        'net6.0',
        'netcoreapp3.1',
        'netstandard2.0',
        '.NETFramework4.7.2',
        '.NETFramework4.6.2',
      ]);
    });

    it('should handle mixed framework types', () => {
      const frameworks = ['net48', 'netstandard2.1', 'net7.0', 'netcoreapp2.1', 'net5.0'];

      const sorted = sortFrameworksDescending(frameworks);

      expect(sorted).toEqual(['net7.0', 'net5.0', 'netcoreapp2.1', 'netstandard2.1', 'net48']);
    });

    it('should handle real-world NuGet package frameworks', () => {
      const frameworks = ['.NETFramework4.6.2', 'net8.0', 'netstandard2.0', 'net6.0', '.NETFramework4.7.1'];

      const sorted = sortFrameworksDescending(frameworks);

      expect(sorted).toEqual(['net8.0', 'net6.0', 'netstandard2.0', '.NETFramework4.7.1', '.NETFramework4.6.2']);
    });

    it('should not mutate original array', () => {
      const original = ['net48', 'net6.0', 'netstandard2.0'];
      const originalCopy = [...original];
      sortFrameworksDescending(original);
      expect(original).toEqual(originalCopy);
    });

    it('should handle empty array', () => {
      const sorted = sortFrameworksDescending([]);
      expect(sorted).toEqual([]);
    });

    it('should handle single framework', () => {
      const sorted = sortFrameworksDescending(['net6.0']);
      expect(sorted).toEqual(['net6.0']);
    });

    it('should sort same-type frameworks by version', () => {
      const frameworks = ['net5.0', 'net8.0', 'net6.0', 'net7.0'];
      const sorted = sortFrameworksDescending(frameworks);
      expect(sorted).toEqual(['net8.0', 'net7.0', 'net6.0', 'net5.0']);
    });
  });
});
