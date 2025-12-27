import { describe, test, expect } from 'bun:test';
import { mergePackageSources } from '../configurationService';
import type { PackageSource } from '../../domain/models/nugetApiOptions';

// Note: discoverNuGetSources() is tested in integration tests since it requires
// real file system access and calls the actual nugetConfigParser functions.
// Testing it in unit tests would require complex mocking that duplicates
// the implementation logic.

describe('mergePackageSources', () => {
  const nugetOrgSource: PackageSource = {
    id: 'nuget.org',
    name: 'nuget.org',
    indexUrl: 'https://api.nuget.org/v3/index.json',
    enabled: true,
    provider: 'nuget.org',
    auth: { type: 'none' },
  };

  const customSource: PackageSource = {
    id: 'custom-feed',
    name: 'Custom Feed',
    indexUrl: 'https://custom.example.com/v3/index.json',
    enabled: true,
    provider: 'custom',
    auth: { type: 'none' },
  };

  const nugetOrgOverride: PackageSource = {
    id: 'nuget.org',
    name: 'Custom NuGet',
    indexUrl: 'https://custom-nuget.org/v3/index.json',
    enabled: true,
    provider: 'nuget.org',
    auth: { type: 'none' },
  };

  test('returns settings sources when no discovered sources', () => {
    const settings = [nugetOrgSource];
    const result = mergePackageSources([], settings);

    expect(result).toEqual(settings);
  });

  test('discovered sources override settings sources by ID', () => {
    const discovered = [nugetOrgOverride];
    const settings = [nugetOrgSource];
    const result = mergePackageSources(discovered, settings);

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Custom NuGet');
    expect(result[0]?.indexUrl).toBe('https://custom-nuget.org/v3/index.json');
  });

  test('combines discovered and non-overridden settings sources', () => {
    const discovered = [customSource];
    const settings = [nugetOrgSource];
    const result = mergePackageSources(discovered, settings);

    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe('custom-feed');
    expect(result[1]?.id).toBe('nuget.org');
  });

  test('preserves order: discovered sources first, then non-overridden settings', () => {
    const discovered = [customSource, nugetOrgOverride];
    const settings = [nugetOrgSource, { ...customSource, id: 'another-feed' }];
    const result = mergePackageSources(discovered, settings);

    expect(result).toHaveLength(3);
    expect(result[0]?.id).toBe('custom-feed');
    expect(result[1]?.id).toBe('nuget.org');
    expect(result[2]?.id).toBe('another-feed');
  });

  test('handles empty settings array', () => {
    const discovered = [customSource];
    const result = mergePackageSources(discovered, []);

    expect(result).toEqual(discovered);
  });

  test('handles both arrays empty', () => {
    const result = mergePackageSources([], []);

    expect(result).toEqual([]);
  });
});
