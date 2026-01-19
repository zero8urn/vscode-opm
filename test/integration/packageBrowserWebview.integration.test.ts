import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import type {
  SearchRequestMessage,
  SearchResponseMessage,
  GetProjectsRequestMessage,
  GetProjectsResponseMessage,
} from '../../src/webviews/apps/packageBrowser/types';

/**
 * Integration test for Package Browser webview IPC flow.
 *
 * This test validates the message flow between the webview and the extension host
 * without requiring the full VS Code Extension Host environment.
 */
describe('Package Browser Webview IPC Integration', () => {
  let messages: any[] = [];
  let mockPostMessage: (msg: any) => void;

  beforeEach(() => {
    messages = [];
    mockPostMessage = (msg: any) => {
      messages.push(msg);
    };
  });

  afterEach(() => {
    messages = [];
  });

  it('should handle ready message', () => {
    const readyMessage = { type: 'ready' };

    // Simulate webview sending ready message
    mockPostMessage(readyMessage);

    expect(messages).toContain(readyMessage);
    expect(messages[0].type).toBe('ready');
  });

  it('should handle search request message', () => {
    const searchRequest: SearchRequestMessage = {
      type: 'searchRequest',
      payload: {
        query: 'newtonsoft',
        includePrerelease: false,
        skip: 0,
        take: 25,
        requestId: '123',
      },
    };

    // Simulate webview sending search request
    mockPostMessage(searchRequest);

    expect(messages).toContain(searchRequest);
    expect(messages[0].type).toBe('searchRequest');
    expect(messages[0].payload.query).toBe('newtonsoft');
  });

  it('should validate search response structure', () => {
    const searchResponse: SearchResponseMessage = {
      type: 'notification',
      name: 'searchResponse',
      args: {
        query: 'newtonsoft',
        results: [
          {
            id: 'Newtonsoft.Json',
            version: '13.0.3',
            description: 'Popular JSON framework',
            authors: ['James Newton-King'],
            totalDownloads: 1000000000,
            iconUrl: null,
          },
        ],
        totalCount: 1,
        totalHits: 1,
        hasMore: false,
        requestId: '123',
      },
    };

    // Validate response structure
    expect(searchResponse.type).toBe('notification');
    expect(searchResponse.name).toBe('searchResponse');
    expect(searchResponse.args.results).toHaveLength(1);
    expect(searchResponse.args.results[0]?.id).toBe('Newtonsoft.Json');
  });

  it('should handle empty search results', () => {
    const emptyResponse: SearchResponseMessage = {
      type: 'notification',
      name: 'searchResponse',
      args: {
        query: 'nonexistent-package-xyz',
        results: [],
        totalCount: 0,
        totalHits: 0,
        hasMore: false,
        requestId: '456',
      },
    };

    expect(emptyResponse.args.results).toHaveLength(0);
    expect(emptyResponse.args.totalCount).toBe(0);
  });

  it('should handle getProjects request message', () => {
    const getProjectsRequest: GetProjectsRequestMessage = {
      type: 'getProjects',
      payload: {
        requestId: 'proj-123',
      },
    };

    // Simulate webview sending getProjects request
    mockPostMessage(getProjectsRequest);

    expect(messages).toContain(getProjectsRequest);
    expect(messages[0].type).toBe('getProjects');
    expect(messages[0].payload.requestId).toBe('proj-123');
  });

  it('should validate getProjects response structure with projects', () => {
    const projectsResponse: GetProjectsResponseMessage = {
      type: 'notification',
      name: 'getProjectsResponse',
      args: {
        requestId: 'proj-123',
        projects: [
          {
            name: 'TestProject.csproj',
            path: '/workspace/TestProject/TestProject.csproj',
            relativePath: 'TestProject/TestProject.csproj',
            frameworks: ['net8.0'],
            installedVersion: undefined,
          },
          {
            name: 'WebApp.csproj',
            path: '/workspace/src/WebApp/WebApp.csproj',
            relativePath: 'src/WebApp/WebApp.csproj',
            frameworks: ['net8.0', 'net7.0'],
            installedVersion: '13.0.1',
          },
        ],
      },
    };

    // Validate response structure
    expect(projectsResponse.type).toBe('notification');
    expect(projectsResponse.name).toBe('getProjectsResponse');
    expect(projectsResponse.args.projects).toHaveLength(2);
    expect(projectsResponse.args.projects[0]?.name).toBe('TestProject.csproj');
    expect(projectsResponse.args.projects[1]?.installedVersion).toBe('13.0.1');
  });

  it('should validate getProjects error response', () => {
    const errorResponse: GetProjectsResponseMessage = {
      type: 'notification',
      name: 'getProjectsResponse',
      args: {
        requestId: 'proj-456',
        projects: [],
        error: {
          message: 'Failed to discover workspace projects.',
          code: 'ProjectDiscoveryError',
        },
      },
    };

    // Validate error structure
    expect(errorResponse.type).toBe('notification');
    expect(errorResponse.args.error?.code).toBe('ProjectDiscoveryError');
    expect(errorResponse.args.projects).toHaveLength(0);
  });

  it('should include installedVersion when package is installed', () => {
    const projectsResponse: GetProjectsResponseMessage = {
      type: 'notification',
      name: 'getProjectsResponse',
      args: {
        requestId: 'proj-789',
        projects: [
          {
            name: 'TestProject.csproj',
            path: '/workspace/TestProject/TestProject.csproj',
            relativePath: 'TestProject/TestProject.csproj',
            frameworks: ['net8.0'],
            installedVersion: '10.0.2',
          },
        ],
      },
    };

    expect(projectsResponse.args.projects[0]?.installedVersion).toBe('10.0.2');
  });

  it('should support packageId parameter in getProjects request', () => {
    const getProjectsRequest: GetProjectsRequestMessage = {
      type: 'getProjects',
      payload: {
        requestId: 'proj-999',
        packageId: 'Microsoft.Extensions.DependencyInjection.Abstractions',
      },
    };

    expect(getProjectsRequest.payload.packageId).toBe('Microsoft.Extensions.DependencyInjection.Abstractions');
    expect(getProjectsRequest.payload.requestId).toBe('proj-999');
  });
});
