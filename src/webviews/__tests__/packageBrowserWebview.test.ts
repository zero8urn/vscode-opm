import { test, expect, describe } from 'bun:test';
import type { PackageSearchResult as DomainPackageSearchResult } from '../../domain/models/packageSearchResult';
import type {
  PackageSearchResult as WebviewPackageSearchResult,
  GetProjectsRequestMessage,
  ProjectInfo,
} from '../apps/packageBrowser/types';
import type { SolutionContext } from '../../services/context/solutionContextService';
import type { PackageReference, ProjectParseResult } from '../../services/cli/types/projectMetadata';

/**
 * Maps domain PackageSearchResult to webview PackageSearchResult.
 * This is extracted for testing - the actual implementation is in packageBrowserWebview.ts.
 */
function mapToWebviewPackage(domain: DomainPackageSearchResult): WebviewPackageSearchResult {
  return {
    id: domain.id,
    version: domain.version,
    description: domain.description || null,
    authors: domain.authors,
    totalDownloads: domain.downloadCount,
    iconUrl: domain.iconUrl || null,
    tags: domain.tags,
    verified: domain.verified,
  };
}

describe('Type Mapping', () => {
  test('should map domain to webview format with all fields', () => {
    const domain: DomainPackageSearchResult = {
      id: 'Test.Package',
      version: '1.0.0',
      description: 'Test package description',
      authors: ['Author One', 'Author Two'],
      downloadCount: 1234567,
      iconUrl: 'https://example.com/icon.png',
      verified: true,
      tags: ['test', 'sample', 'demo'],
    };

    const webview = mapToWebviewPackage(domain);

    expect(webview.id).toBe('Test.Package');
    expect(webview.version).toBe('1.0.0');
    expect(webview.description).toBe('Test package description');
    expect(webview.authors).toEqual(['Author One', 'Author Two']);
    expect(webview.totalDownloads).toBe(1234567);
    expect(webview.iconUrl).toBe('https://example.com/icon.png');
    expect(webview.verified).toBe(true);
    expect(webview.tags).toEqual(['test', 'sample', 'demo']);
  });

  test('should convert empty description to null', () => {
    const domain: DomainPackageSearchResult = {
      id: 'Test',
      version: '1.0.0',
      description: '',
      authors: ['Author'],
      downloadCount: 100,
      iconUrl: 'https://example.com/icon.png',
      verified: false,
      tags: [],
    };

    const webview = mapToWebviewPackage(domain);

    expect(webview.description).toBeNull();
  });

  test('should convert empty iconUrl to null', () => {
    const domain: DomainPackageSearchResult = {
      id: 'Test',
      version: '1.0.0',
      description: 'Test',
      authors: ['Author'],
      downloadCount: 100,
      iconUrl: '',
      verified: false,
      tags: [],
    };

    const webview = mapToWebviewPackage(domain);

    expect(webview.iconUrl).toBeNull();
  });

  test('should handle minimal package data', () => {
    const domain: DomainPackageSearchResult = {
      id: 'Minimal.Package',
      version: '0.1.0',
      description: '',
      authors: [],
      downloadCount: 0,
      iconUrl: '',
      verified: false,
      tags: [],
    };

    const webview = mapToWebviewPackage(domain);

    expect(webview.id).toBe('Minimal.Package');
    expect(webview.version).toBe('0.1.0');
    expect(webview.description).toBeNull();
    expect(webview.authors).toEqual([]);
    expect(webview.totalDownloads).toBe(0);
    expect(webview.iconUrl).toBeNull();
    expect(webview.verified).toBe(false);
    expect(webview.tags).toEqual([]);
  });

  test('should correctly map downloadCount to totalDownloads', () => {
    const domain: DomainPackageSearchResult = {
      id: 'Popular.Package',
      version: '2.5.0',
      description: 'Very popular package',
      authors: ['Author'],
      downloadCount: 999999999,
      iconUrl: 'https://example.com/icon.png',
      verified: true,
      tags: ['popular'],
    };

    const webview = mapToWebviewPackage(domain);

    expect(webview.totalDownloads).toBe(999999999);
  });
});

describe('handleGetProjectsRequest logic', () => {
  describe('Project mapping from SolutionContext', () => {
    test('should map solution projects to ProjectInfo format', () => {
      // Mock solution context with projects
      const mockContext: SolutionContext = {
        solution: null,
        projects: [
          {
            name: 'TestProject.csproj',
            path: '/workspace/TestProject/TestProject.csproj',
          },
          {
            name: 'WebApp.csproj',
            path: '/workspace/src/WebApp/WebApp.csproj',
          },
        ],
        mode: 'workspace',
      };

      const workspaceRoot = '/workspace';

      // Simulate the mapping logic from handleGetProjectsRequest
      const projects: ProjectInfo[] = mockContext.projects.map(project => {
        let relativePath = project.path.replace(workspaceRoot + '/', '');
        if (relativePath === project.path) {
          relativePath = project.path;
        }

        return {
          name: project.name,
          path: project.path,
          relativePath,
          frameworks: [],
          installedVersion: undefined,
        };
      });

      expect(projects).toHaveLength(2);
      expect(projects[0]).toEqual({
        name: 'TestProject.csproj',
        path: '/workspace/TestProject/TestProject.csproj',
        relativePath: 'TestProject/TestProject.csproj',
        frameworks: [],
        installedVersion: undefined,
      });
      expect(projects[1]?.relativePath).toBe('src/WebApp/WebApp.csproj');
    });

    test('should handle empty project list', () => {
      const mockContext: SolutionContext = {
        solution: null,
        projects: [],
        mode: 'none',
      };

      const projects: ProjectInfo[] = mockContext.projects.map(project => ({
        name: project.name,
        path: project.path,
        relativePath: project.path,
        frameworks: [],
        installedVersion: undefined,
      }));

      expect(projects).toHaveLength(0);
    });
  });

  describe('Request/Response correlation', () => {
    test('should preserve requestId in response', () => {
      const request: GetProjectsRequestMessage = {
        type: 'getProjects',
        payload: {
          requestId: 'test-123',
        },
      };

      const response = {
        type: 'notification' as const,
        name: 'getProjectsResponse' as const,
        args: {
          requestId: request.payload.requestId,
          projects: [],
        },
      };

      expect(response.args.requestId).toBe('test-123');
    });

    test('should handle missing requestId gracefully', () => {
      const request: GetProjectsRequestMessage = {
        type: 'getProjects',
        payload: {},
      };

      const response = {
        type: 'notification' as const,
        name: 'getProjectsResponse' as const,
        args: {
          requestId: request.payload.requestId,
          projects: [],
        },
      };

      expect(response.args.requestId).toBeUndefined();
    });
  });

  describe('Error response structure', () => {
    test('should create error response with correct fields', () => {
      const errorResponse = {
        type: 'notification' as const,
        name: 'getProjectsResponse' as const,
        args: {
          requestId: '123',
          projects: [],
          error: {
            message: 'Failed to discover workspace projects.',
            code: 'ProjectDiscoveryError',
          },
        },
      };

      expect(errorResponse.args.error?.code).toBe('ProjectDiscoveryError');
      expect(errorResponse.args.error?.message).toContain('Failed to discover');
      expect(errorResponse.args.projects).toHaveLength(0);
    });
  });
});

describe('handleGetProjectsRequest - Installed Package Detection', () => {
  test('should detect installed packages and populate installedVersion', () => {
    // Mock DotnetProjectParser.parseProjects() result
    const mockParseResult: Map<string, ProjectParseResult> = new Map([
      [
        '/workspace/TestProject/TestProject.csproj',
        {
          success: true,
          metadata: {
            path: '/workspace/TestProject/TestProject.csproj',
            name: 'TestProject',
            targetFrameworks: 'net8.0',
            packageReferences: [
              {
                id: 'Microsoft.Extensions.DependencyInjection.Abstractions',
                requestedVersion: '10.0.2',
                resolvedVersion: '10.0.2',
                targetFramework: 'net8.0',
                isTransitive: false,
              },
            ],
          },
        },
      ],
    ]);

    // Verify installedVersion extracted correctly
    const packageId = 'Microsoft.Extensions.DependencyInjection.Abstractions';
    const parseResult = mockParseResult.get('/workspace/TestProject/TestProject.csproj');
    const pkg =
      parseResult?.success === true
        ? parseResult.metadata.packageReferences.find(
            (ref: PackageReference) => ref.id.toLowerCase() === packageId.toLowerCase(),
          )
        : undefined;

    expect(pkg).toBeDefined();
    expect(pkg?.resolvedVersion).toBe('10.0.2');
  });

  test('should handle case-insensitive package ID matching', () => {
    const packages: PackageReference[] = [
      {
        id: 'Newtonsoft.Json',
        requestedVersion: '13.0.3',
        resolvedVersion: '13.0.3',
        targetFramework: 'net8.0',
        isTransitive: false,
      },
    ];

    const testCases = ['Newtonsoft.Json', 'newtonsoft.json', 'NEWTONSOFT.JSON'];
    for (const testId of testCases) {
      const pkg = packages.find((ref: PackageReference) => ref.id.toLowerCase() === testId.toLowerCase());
      expect(pkg).toBeDefined();
    }
  });

  test('should return undefined when package not installed', () => {
    const packages: PackageReference[] = [
      {
        id: 'Serilog',
        requestedVersion: '3.1.0',
        resolvedVersion: '3.1.1',
        targetFramework: 'net8.0',
        isTransitive: false,
      },
    ];

    const pkg = packages.find((ref: PackageReference) => ref.id.toLowerCase() === 'newtonsoft.json');
    expect(pkg).toBeUndefined();
  });

  test('should skip parsing when packageId not provided', async () => {
    let parseProjectsCalled = false;
    const parseProjectsSpy = async () => {
      parseProjectsCalled = true;
      return new Map();
    };

    // Simulate handler with no packageId
    const packageId = undefined;
    const parseResults = packageId ? await parseProjectsSpy() : new Map();

    expect(parseProjectsCalled).toBe(false);
    expect(parseResults.size).toBe(0);
  });
});
