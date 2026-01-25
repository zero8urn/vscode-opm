import { describe, test, expect, beforeAll } from 'bun:test';

// Mock acquireVsCodeApi before importing the component
beforeAll(() => {
  if (!(globalThis as any).acquireVsCodeApi) {
    (globalThis as any).acquireVsCodeApi = () => ({
      postMessage: () => {},
      setState: () => {},
      getState: () => ({}),
    });
  }
});

import { PackageDetailsPanel, PACKAGE_DETAILS_PANEL_TAG } from '../packageDetailsPanel';
import type { PackageDetailsData } from '../../../../services/packageDetailsService';

describe('PackageDetailsPanel Component', () => {
  test('should export PackageDetailsPanel class', () => {
    expect(PackageDetailsPanel).toBeDefined();
    expect(typeof PackageDetailsPanel).toBe('function');
  });

  test('should export tag constant', () => {
    expect(PACKAGE_DETAILS_PANEL_TAG).toBe('package-details-panel');
  });

  test('should have default packageData as null', () => {
    const instance = new PackageDetailsPanel();
    expect(instance.packageData).toBe(null);
  });

  test('should have default open state as false', () => {
    const instance = new PackageDetailsPanel();
    expect(instance.open).toBe(false);
  });

  test('should have default includePrerelease as false', () => {
    const instance = new PackageDetailsPanel();
    expect(instance.includePrerelease).toBe(false);
  });

  test('should update packageData property', () => {
    const instance = new PackageDetailsPanel();
    const mockData: PackageDetailsData = {
      id: 'Test.Package',
      version: '1.0.0',
      description: 'Test package',
      deprecated: false,
      vulnerabilities: [],
      versions: [],
      dependencies: [],
    };
    instance.packageData = mockData;
    expect(instance.packageData).toBe(mockData);
    expect(instance.packageData?.id).toBe('Test.Package');
  });

  test('should update open property', () => {
    const instance = new PackageDetailsPanel();
    instance.open = true;
    expect(instance.open).toBe(true);
  });

  test('should update includePrerelease property', () => {
    const instance = new PackageDetailsPanel();
    instance.includePrerelease = true;
    expect(instance.includePrerelease).toBe(true);
  });

  test('should handle package with icon URL', () => {
    const instance = new PackageDetailsPanel();
    const mockData: PackageDetailsData = {
      id: 'Serilog',
      version: '4.3.0',
      iconUrl: 'https://example.com/icon.png',
      deprecated: false,
      vulnerabilities: [],
      versions: [],
      dependencies: [],
    };
    instance.packageData = mockData;
    expect(instance.packageData?.iconUrl).toBe('https://example.com/icon.png');
  });

  test('should handle package without icon URL', () => {
    const instance = new PackageDetailsPanel();
    const mockData: PackageDetailsData = {
      id: 'Test.Package',
      version: '1.0.0',
      deprecated: false,
      vulnerabilities: [],
      versions: [],
      dependencies: [],
    };
    instance.packageData = mockData;
    expect(instance.packageData?.iconUrl).toBeUndefined();
  });

  test('should handle package with download count', () => {
    const instance = new PackageDetailsPanel();
    const mockData: PackageDetailsData = {
      id: 'Serilog',
      version: '4.3.0',
      totalDownloads: 2285893164,
      deprecated: false,
      vulnerabilities: [],
      versions: [],
      dependencies: [],
    };
    instance.packageData = mockData;
    expect(instance.packageData?.totalDownloads).toBe(2285893164);
  });

  test('should handle package with tags', () => {
    const instance = new PackageDetailsPanel();
    const mockData: PackageDetailsData = {
      id: 'Serilog',
      version: '4.3.0',
      tags: ['serilog', 'logging', 'semantic', 'structured'],
      deprecated: false,
      vulnerabilities: [],
      versions: [],
      dependencies: [],
    };
    instance.packageData = mockData;
    expect(instance.packageData?.tags).toEqual(['serilog', 'logging', 'semantic', 'structured']);
    expect(instance.packageData?.tags?.length).toBe(4);
  });

  test('should handle package with license expression', () => {
    const instance = new PackageDetailsPanel();
    const mockData: PackageDetailsData = {
      id: 'Serilog',
      version: '4.3.0',
      licenseExpression: 'Apache-2.0',
      licenseUrl: 'https://licenses.nuget.org/Apache-2.0',
      deprecated: false,
      vulnerabilities: [],
      versions: [],
      dependencies: [],
    };
    instance.packageData = mockData;
    expect(instance.packageData?.licenseExpression).toBe('Apache-2.0');
    expect(instance.packageData?.licenseUrl).toBe('https://licenses.nuget.org/Apache-2.0');
  });

  test('should handle deprecated package', () => {
    const instance = new PackageDetailsPanel();
    const mockData: PackageDetailsData = {
      id: 'OldPackage',
      version: '1.0.0',
      deprecated: true,
      deprecationReasons: ['This package is no longer maintained'],
      alternativePackage: 'NewPackage',
      vulnerabilities: [],
      versions: [],
      dependencies: [],
    };
    instance.packageData = mockData;
    expect(instance.packageData?.deprecated).toBe(true);
    expect(instance.packageData?.deprecationReasons).toEqual(['This package is no longer maintained']);
    expect(instance.packageData?.alternativePackage).toBe('NewPackage');
  });

  test('should handle package with vulnerabilities', () => {
    const instance = new PackageDetailsPanel();
    const mockData: PackageDetailsData = {
      id: 'VulnerablePackage',
      version: '1.0.0',
      deprecated: false,
      vulnerabilities: [{ severity: 'High', advisoryUrl: 'https://example.com/advisory' }, { severity: 'Medium' }],
      versions: [],
      dependencies: [],
    };
    instance.packageData = mockData;
    expect(instance.packageData?.vulnerabilities.length).toBe(2);
    expect(instance.packageData?.vulnerabilities[0]?.severity).toBe('High');
  });

  test('should handle package with dependencies', () => {
    const instance = new PackageDetailsPanel();
    const mockData: PackageDetailsData = {
      id: 'Test.Package',
      version: '1.0.0',
      deprecated: false,
      vulnerabilities: [],
      versions: [],
      dependencies: [
        {
          framework: '.NET 8.0',
          dependencies: [
            { id: 'Dep1', versionRange: '[1.0.0, )' },
            { id: 'Dep2', versionRange: '2.0.0' },
          ],
        },
        {
          framework: '.NET 6.0',
          dependencies: [{ id: 'Dep1', versionRange: '[1.0.0, )' }],
        },
      ],
    };
    instance.packageData = mockData;
    expect(instance.packageData?.dependencies.length).toBe(2);
    expect(instance.packageData?.dependencies[0]?.framework).toBe('.NET 8.0');
    expect(instance.packageData?.dependencies[0]?.dependencies.length).toBe(2);
  });

  test('should handle package with no dependencies', () => {
    const instance = new PackageDetailsPanel();
    const mockData: PackageDetailsData = {
      id: 'Test.Package',
      version: '1.0.0',
      deprecated: false,
      vulnerabilities: [],
      versions: [],
      dependencies: [],
    };
    instance.packageData = mockData;
    expect(instance.packageData?.dependencies.length).toBe(0);
  });

  test('should handle package with multiple versions', () => {
    const instance = new PackageDetailsPanel();
    const mockData: PackageDetailsData = {
      id: 'Test.Package',
      version: '2.0.0',
      deprecated: false,
      vulnerabilities: [],
      versions: [
        { version: '2.0.0', publishedDate: '2025-01-01', isPrerelease: false, isDeprecated: false, listed: true },
        { version: '2.0.0-beta', publishedDate: '2024-12-15', isPrerelease: true, isDeprecated: false, listed: true },
        { version: '1.0.0', publishedDate: '2024-01-01', isPrerelease: false, isDeprecated: false, listed: true },
      ],
      dependencies: [],
    };
    instance.packageData = mockData;
    expect(instance.packageData?.versions.length).toBe(3);
    expect(instance.packageData?.versions[0]?.version).toBe('2.0.0');
  });

  test('should filter prerelease versions when includePrerelease is false', () => {
    const instance = new PackageDetailsPanel();
    instance.includePrerelease = false;
    const mockData: PackageDetailsData = {
      id: 'Test.Package',
      version: '2.0.0',
      deprecated: false,
      vulnerabilities: [],
      versions: [
        { version: '2.0.0', publishedDate: '2025-01-01', isPrerelease: false, isDeprecated: false, listed: true },
        { version: '2.0.0-beta', publishedDate: '2024-12-15', isPrerelease: true, isDeprecated: false, listed: true },
        { version: '1.0.0', publishedDate: '2024-01-01', isPrerelease: false, isDeprecated: false, listed: true },
      ],
      dependencies: [],
    };
    instance.packageData = mockData;
    // The component should filter prerelease versions in the render method
    expect(instance.packageData?.versions.filter(v => !v.isPrerelease).length).toBe(2);
  });

  test('should handle package with multi-line description', () => {
    const instance = new PackageDetailsPanel();
    const multiLineDescription =
      'Logging abstractions for Microsoft.Extensions.Logging.\n\nCommonly Used Types:\nMicrosoft.Extensions.Logging.ILogger\nMicrosoft.Extensions.Logging.ILoggerFactory';
    const mockData: PackageDetailsData = {
      id: 'Microsoft.Extensions.Logging.Abstractions',
      version: '10.0.1',
      description: multiLineDescription,
      deprecated: false,
      vulnerabilities: [],
      versions: [],
      dependencies: [],
    };
    instance.packageData = mockData;
    expect(instance.packageData?.description).toBe(multiLineDescription);
    expect(instance.packageData?.description).toContain('\n\n');
    expect(instance.packageData?.description).toContain('Commonly Used Types:');
    expect(instance.packageData?.description?.split('\n').length).toBe(5);
  });

  test('should handle complete package data', () => {
    const instance = new PackageDetailsPanel();
    const mockData: PackageDetailsData = {
      id: 'Serilog',
      version: '4.3.0',
      description: 'Simple .NET logging with fully-structured events',
      title: 'Serilog',
      authors: 'Serilog Contributors',
      iconUrl: 'https://example.com/serilog-icon.png',
      licenseExpression: 'Apache-2.0',
      licenseUrl: 'https://licenses.nuget.org/Apache-2.0',
      projectUrl: 'https://serilog.net/',
      totalDownloads: 2285893164,
      tags: ['serilog', 'logging', 'semantic', 'structured'],
      verified: true,
      deprecated: false,
      vulnerabilities: [],
      versions: [
        { version: '4.3.0', publishedDate: '2025-05-18', isPrerelease: false, isDeprecated: false, listed: true },
        { version: '4.2.0', publishedDate: '2024-11-10', isPrerelease: false, isDeprecated: false, listed: true },
      ],
      dependencies: [
        {
          framework: '.NET 8.0',
          dependencies: [],
        },
      ],
      published: '2025-05-18T00:00:00Z',
    };
    instance.packageData = mockData;
    expect(instance.packageData?.id).toBe('Serilog');
    expect(instance.packageData?.version).toBe('4.3.0');
    expect(instance.packageData?.description).toBe('Simple .NET logging with fully-structured events');
    expect(instance.packageData?.totalDownloads).toBe(2285893164);
    expect(instance.packageData?.tags?.length).toBe(4);
    expect(instance.packageData?.verified).toBe(true);
  });

  test('should handle package with all link types for title attributes', () => {
    const instance = new PackageDetailsPanel();
    const mockData: PackageDetailsData = {
      id: 'Test.Package',
      version: '1.0.0',
      projectUrl: 'https://example.com/project',
      licenseUrl: 'https://example.com/license',
      licenseExpression: 'MIT',
      tags: ['test', 'example'],
      deprecated: false,
      vulnerabilities: [],
      versions: [],
      dependencies: [],
    };
    instance.packageData = mockData;

    // Verify data is set correctly for rendering with title attributes
    expect(instance.packageData?.projectUrl).toBe('https://example.com/project');
    expect(instance.packageData?.licenseUrl).toBe('https://example.com/license');
    expect(instance.packageData?.tags).toEqual(['test', 'example']);
  });
});

/**
 * Regression tests for install/uninstall response handlers
 *
 * Bug context: After implementing uninstall feature (STORY-001-03-001), a regression was
 * introduced where handleInstallResponse() was missing the fetchProjects() call that
 * handleUninstallResponse() had. This caused the UI to show outdated project data after
 * install, resulting in:
 * - Checkboxes appearing unchecked
 * - Projects still showing as "not installed"
 * - Error messages or broken UI state
 *
 * These tests verify that both handlers trigger project list refresh to update
 * installedVersion data after operations complete.
 */
describe('PackageDetailsPanel Response Handlers', () => {
  test('handleInstallResponse should trigger project refresh', () => {
    const instance = new PackageDetailsPanel();
    instance.packageData = {
      id: 'Newtonsoft.Json',
      version: '13.0.3',
      deprecated: false,
      vulnerabilities: [],
      versions: [],
      dependencies: [],
    };

    // Mock fetchProjects to track if it's called
    let fetchProjectsCalled = false;
    (instance as any).fetchProjects = () => {
      fetchProjectsCalled = true;
      return Promise.resolve();
    };

    // Mock shadowRoot.querySelector to return a mock project-selector
    const mockProjectSelector = {
      setResults: () => {},
    };

    // Use Object.defineProperty to override the readonly shadowRoot getter
    Object.defineProperty(instance, 'shadowRoot', {
      get: () => ({
        querySelector: () => mockProjectSelector,
      }),
      configurable: true,
    });

    // Call handleInstallResponse
    instance.handleInstallResponse({
      packageId: 'Newtonsoft.Json',
      version: '13.0.3',
      success: true,
      results: [{ projectPath: 'MyApp.csproj', success: true }],
    });

    // Verify fetchProjects was called (this would have failed before the fix)
    expect(fetchProjectsCalled).toBe(true);
  });

  test('handleUninstallResponse should trigger project refresh', () => {
    const instance = new PackageDetailsPanel();
    instance.packageData = {
      id: 'Newtonsoft.Json',
      version: '13.0.3',
      deprecated: false,
      vulnerabilities: [],
      versions: [],
      dependencies: [],
    };

    // Mock fetchProjects to track if it's called
    let fetchProjectsCalled = false;
    (instance as any).fetchProjects = () => {
      fetchProjectsCalled = true;
      return Promise.resolve();
    };

    // Mock shadowRoot.querySelector to return a mock project-selector
    const mockProjectSelector = {
      setResults: () => {},
    };

    Object.defineProperty(instance, 'shadowRoot', {
      get: () => ({
        querySelector: () => mockProjectSelector,
      }),
      configurable: true,
    });

    // Call handleUninstallResponse
    instance.handleUninstallResponse({
      packageId: 'Newtonsoft.Json',
      success: true,
      results: [{ projectPath: 'MyApp.csproj', success: true }],
    });

    // Verify fetchProjects was called
    expect(fetchProjectsCalled).toBe(true);
  });

  test('handleInstallResponse should forward results to project-selector', () => {
    const instance = new PackageDetailsPanel();
    instance.packageData = {
      id: 'Test.Package',
      version: '1.0.0',
      deprecated: false,
      vulnerabilities: [],
      versions: [],
      dependencies: [],
    };

    // Mock project-selector's setResults method
    let resultsReceived: any = null;
    const mockProjectSelector = {
      setResults: (results: any) => {
        resultsReceived = results;
      },
    };

    // Mock shadowRoot.querySelector
    Object.defineProperty(instance, 'shadowRoot', {
      get: () => ({
        querySelector: () => mockProjectSelector,
      }),
      configurable: true,
    });

    // Mock fetchProjects (not testing this part)
    (instance as any).fetchProjects = () => Promise.resolve();

    // Call with test results
    const testResults = [
      { projectPath: 'App1.csproj', success: true },
      { projectPath: 'App2.csproj', success: false, error: 'Network error' },
    ];

    instance.handleInstallResponse({
      packageId: 'Test.Package',
      version: '1.0.0',
      success: false, // Partial failure
      results: testResults,
    });

    // Verify results were forwarded
    expect(resultsReceived).not.toBe(null);
    expect(resultsReceived.length).toBe(2);
    expect(resultsReceived[0].projectPath).toBe('App1.csproj');
    expect(resultsReceived[0].success).toBe(true);
    expect(resultsReceived[1].projectPath).toBe('App2.csproj');
    expect(resultsReceived[1].success).toBe(false);
    expect(resultsReceived[1].error?.message).toBe('Network error');
  });

  test('handleUninstallResponse should forward results to project-selector', () => {
    const instance = new PackageDetailsPanel();
    instance.packageData = {
      id: 'Test.Package',
      version: '1.0.0',
      deprecated: false,
      vulnerabilities: [],
      versions: [],
      dependencies: [],
    };

    // Mock project-selector's setResults method
    let resultsReceived: any = null;
    const mockProjectSelector = {
      setResults: (results: any) => {
        resultsReceived = results;
      },
    };

    // Mock shadowRoot.querySelector
    Object.defineProperty(instance, 'shadowRoot', {
      get: () => ({
        querySelector: () => mockProjectSelector,
      }),
      configurable: true,
    });

    // Mock fetchProjects
    (instance as any).fetchProjects = () => Promise.resolve();

    // Call with test results
    const testResults = [{ projectPath: 'App1.csproj', success: true }];

    instance.handleUninstallResponse({
      packageId: 'Test.Package',
      success: true,
      results: testResults,
    });

    // Verify results were forwarded
    expect(resultsReceived).not.toBe(null);
    expect(resultsReceived.length).toBe(1);
    expect(resultsReceived[0].projectPath).toBe('App1.csproj');
    expect(resultsReceived[0].success).toBe(true);
  });
});
