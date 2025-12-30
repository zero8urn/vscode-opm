/**
 * Unit tests for package details parser.
 */

import { describe, it, expect } from 'bun:test';
import { parsePackageVersionDetails, parseVersionSummary } from '../packageDetailsParser';

describe('parsePackageVersionDetails', () => {
  it('should parse complete registration leaf response', () => {
    const response = {
      '@id': 'https://api.nuget.org/v3/registration5-semver1/newtonsoft.json/12.0.1.json',
      catalogEntry: {
        id: 'Newtonsoft.Json',
        version: '12.0.1',
        description: 'Json.NET is a popular high-performance JSON framework for .NET',
        summary: 'JSON framework',
        title: 'Json.NET',
        authors: 'James Newton-King',
        owners: 'james.newton-king',
        iconUrl: 'https://www.nuget.org/Content/gallery/img/default-package-icon.svg',
        licenseExpression: 'MIT',
        projectUrl: 'https://www.newtonsoft.com/json',
        tags: 'json serialization',
        totalDownloads: 1000000000,
        listed: true,
        published: '2019-11-09T01:17:00+00:00',
        dependencyGroups: [
          {
            targetFramework: '.NETStandard2.0',
            dependencies: [
              {
                id: 'System.Runtime.Serialization.Primitives',
                range: '[4.3.0, )',
              },
            ],
          },
        ],
        deprecation: {
          reasons: ['Legacy'],
          message: 'This package is deprecated',
          alternatePackage: {
            id: 'System.Text.Json',
            range: '[6.0.0, )',
          },
        },
        vulnerabilities: [
          {
            advisoryUrl: 'https://github.com/advisories/GHSA-1234',
            severity: 2,
          },
        ],
        readmeUrl: 'https://api.nuget.org/v3-flatcontainer/newtonsoft.json/12.0.1/readme',
      },
      packageContent: 'https://api.nuget.org/v3-flatcontainer/newtonsoft.json/12.0.1/newtonsoft.json.12.0.1.nupkg',
    };

    const result = parsePackageVersionDetails(response);

    expect(result.id).toBe('Newtonsoft.Json');
    expect(result.version).toBe('12.0.1');
    expect(result.description).toBe('Json.NET is a popular high-performance JSON framework for .NET');
    expect(result.summary).toBe('JSON framework');
    expect(result.title).toBe('Json.NET');
    expect(result.authors).toBe('James Newton-King');
    expect(result.owners).toBe('james.newton-king');
    expect(result.iconUrl).toBe('https://www.nuget.org/Content/gallery/img/default-package-icon.svg');
    expect(result.licenseExpression).toBe('MIT');
    expect(result.projectUrl).toBe('https://www.newtonsoft.com/json');
    expect(result.tags).toEqual(['json', 'serialization']);
    expect(result.totalDownloads).toBe(1000000000);
    expect(result.listed).toBe(true);
    expect(result.published).toBe('2019-11-09T01:17:00+00:00');
    expect(result.packageContentUrl).toBe(
      'https://api.nuget.org/v3-flatcontainer/newtonsoft.json/12.0.1/newtonsoft.json.12.0.1.nupkg',
    );
    expect(result.registrationUrl).toBe('https://api.nuget.org/v3/registration5-semver1/newtonsoft.json/12.0.1.json');

    // Check dependency groups
    expect(result.dependencyGroups).toHaveLength(1);
    expect(result.dependencyGroups![0]!.targetFramework).toBe('.NETStandard2.0');
    expect(result.dependencyGroups![0]!.dependencies).toHaveLength(1);
    expect(result.dependencyGroups![0]!.dependencies[0]!.id).toBe('System.Runtime.Serialization.Primitives');
    expect(result.dependencyGroups![0]!.dependencies[0]!.range).toBe('[4.3.0, )');

    // Check deprecation
    expect(result.deprecation).toBeDefined();
    expect(result.deprecation!.reasons).toEqual(['Legacy']);
    expect(result.deprecation!.message).toBe('This package is deprecated');
    expect(result.deprecation!.alternatePackage).toBeDefined();
    expect(result.deprecation!.alternatePackage!.id).toBe('System.Text.Json');
    expect(result.deprecation!.alternatePackage!.range).toBe('[6.0.0, )');

    // Check vulnerabilities
    expect(result.vulnerabilities).toHaveLength(1);
    expect(result.vulnerabilities![0]!.advisoryUrl).toBe('https://github.com/advisories/GHSA-1234');
    expect(result.vulnerabilities![0]!.severity).toBe('High');

    expect(result.readmeUrl).toBe('https://api.nuget.org/v3-flatcontainer/newtonsoft.json/12.0.1/readme');
  });

  it('should parse response with minimal fields', () => {
    const response = {
      '@id': 'https://api.nuget.org/v3/registration5-semver1/testpkg/1.0.0.json',
      catalogEntry: {
        id: 'TestPkg',
        version: '1.0.0',
        listed: false,
      },
      packageContent: 'https://api.nuget.org/v3-flatcontainer/testpkg/1.0.0/testpkg.1.0.0.nupkg',
    };

    const result = parsePackageVersionDetails(response);

    expect(result.id).toBe('TestPkg');
    expect(result.version).toBe('1.0.0');
    expect(result.listed).toBe(false);
    expect(result.dependencyGroups).toEqual([]);
    expect(result.deprecation).toBeUndefined();
    expect(result.vulnerabilities).toBeUndefined();
    expect(result.tags).toEqual([]);
  });

  it('should parse tags as array', () => {
    const response = {
      '@id': 'https://api.nuget.org/v3/registration5-semver1/pkg/1.0.0.json',
      catalogEntry: {
        id: 'Pkg',
        version: '1.0.0',
        tags: ['json', 'serialization', 'test'],
        listed: true,
      },
      packageContent: 'https://api.nuget.org/v3-flatcontainer/pkg/1.0.0/pkg.1.0.0.nupkg',
    };

    const result = parsePackageVersionDetails(response);

    expect(result.tags).toEqual(['json', 'serialization', 'test']);
  });

  it('should handle empty dependency groups', () => {
    const response = {
      '@id': 'https://api.nuget.org/v3/registration5-semver1/pkg/1.0.0.json',
      catalogEntry: {
        id: 'Pkg',
        version: '1.0.0',
        listed: true,
        dependencyGroups: [],
      },
      packageContent: 'https://api.nuget.org/v3-flatcontainer/pkg/1.0.0/pkg.1.0.0.nupkg',
    };

    const result = parsePackageVersionDetails(response);

    expect(result.dependencyGroups).toEqual([]);
  });

  it('should handle framework-agnostic dependencies (empty targetFramework)', () => {
    const response = {
      '@id': 'https://api.nuget.org/v3/registration5-semver1/pkg/1.0.0.json',
      catalogEntry: {
        id: 'Pkg',
        version: '1.0.0',
        listed: true,
        dependencyGroups: [
          {
            targetFramework: '',
            dependencies: [{ id: 'SomeDep', range: '1.0.0' }],
          },
        ],
      },
      packageContent: 'https://api.nuget.org/v3-flatcontainer/pkg/1.0.0/pkg.1.0.0.nupkg',
    };

    const result = parsePackageVersionDetails(response);

    expect(result.dependencyGroups![0]!.targetFramework).toBe('');
    expect(result.dependencyGroups![0]!.dependencies).toHaveLength(1);
  });

  it('should throw error if missing required fields', () => {
    expect(() => {
      parsePackageVersionDetails({});
    }).toThrow('Invalid registration leaf');

    expect(() => {
      parsePackageVersionDetails({ '@id': 'test' });
    }).toThrow('missing catalogEntry');

    expect(() => {
      parsePackageVersionDetails({ '@id': 'test', catalogEntry: { id: 'Test', version: '1.0.0' } });
    }).toThrow('missing packageContent');
  });
});

describe('parseVersionSummary', () => {
  it('should parse version summary from page item', () => {
    const item = {
      '@id': 'https://api.nuget.org/v3/registration5-semver1/newtonsoft.json/12.0.1.json',
      catalogEntry: {
        version: '12.0.1',
        downloads: 500000,
        listed: true,
      },
      packageContent: 'https://api.nuget.org/v3-flatcontainer/newtonsoft.json/12.0.1/newtonsoft.json.12.0.1.nupkg',
    };

    const result = parseVersionSummary(item);

    expect(result.version).toBe('12.0.1');
    expect(result.downloads).toBe(500000);
    expect(result.listed).toBe(true);
    expect(result.registrationUrl).toBe('https://api.nuget.org/v3/registration5-semver1/newtonsoft.json/12.0.1.json');
    expect(result.packageContentUrl).toBe(
      'https://api.nuget.org/v3-flatcontainer/newtonsoft.json/12.0.1/newtonsoft.json.12.0.1.nupkg',
    );
  });

  it('should handle missing optional fields', () => {
    const item = {
      '@id': 'https://api.nuget.org/v3/registration5-semver1/pkg/1.0.0.json',
      catalogEntry: {
        version: '1.0.0',
        listed: false,
      },
      packageContent: 'https://api.nuget.org/v3-flatcontainer/pkg/1.0.0/pkg.1.0.0.nupkg',
    };

    const result = parseVersionSummary(item);

    expect(result.version).toBe('1.0.0');
    expect(result.downloads).toBeUndefined();
    expect(result.listed).toBe(false);
  });

  it('should throw error if missing required fields', () => {
    expect(() => {
      parseVersionSummary({});
    }).toThrow('Invalid page item');

    expect(() => {
      parseVersionSummary({ '@id': 'test', catalogEntry: {} });
    }).toThrow('missing catalogEntry.version');
  });
});
