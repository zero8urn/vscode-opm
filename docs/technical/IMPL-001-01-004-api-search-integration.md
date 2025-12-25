# IMPL-001-01-004-api-search-integration

**Story**: Integration placeholder (follows STORY-001-01-003-search-results-list)  
**Feature**: [FEAT-001-01-browse-search](../features/FEAT-001-01-browse-search.md)  
**Created**: 2025-12-25  
**Last Updated**: 2025-12-25

## Summary

Integrate the NuGet API client (`src/env/node/nugetApiClient.ts`) with the Package Browser webview controller (`src/webviews/packageBrowserWebview.ts`) to provide real search functionality. This story connects the Lit-based UI components (completed in STORY-001-01-003) with the backend API client (completed in STORY-001-01-001), implementing the full request → API call → response flow with comprehensive error handling and logging.

## Implementation Checklist

- [ ] Add NuGetApiClient instantiation to webview controller → See [Client Instantiation](#client-instantiation)
- [ ] Implement handleSearchRequest() with API integration → See [Request Handler](#request-handler)
- [ ] Map domain models to webview message types → See [Type Mapping](#type-mapping)
- [ ] Handle all NuGetError types with user-friendly messages → See [Error Handling](#error-handling)
- [ ] Add request ID tracking for concurrent requests → See [Request Tracking](#request-tracking)
- [ ] Integrate logger service for debugging → See [Logging Integration](#logging-integration)
- [ ] Write unit tests for type mapping and error handling → See [Testing](#testing)
- [ ] Write integration tests for end-to-end flow → See [Integration Tests](#integration-tests)
- [ ] Add E2E tests for webview command execution → See [E2E Tests](#e2e-tests)

---

## <a name="client-instantiation"></a>Client Instantiation

### Update Webview Factory Function

The NuGet API client needs to be instantiated once and passed to message handlers. Modify `createPackageBrowserWebview()` to accept an injected client instance.

**File:** `src/webviews/packageBrowserWebview.ts`

```typescript
import * as vscode from 'vscode';
import type { ILogger } from '../services/loggerService';
import type { INuGetApiClient } from '../domain/nugetApiClient';
import { createNonce, buildHtmlTemplate, isWebviewMessage } from './webviewHelpers';
import type { SearchRequestMessage, WebviewReadyMessage, SearchResponseMessage } from './apps/package-browser/types';
import { isSearchRequestMessage, isWebviewReadyMessage } from './apps/package-browser/types';

/**
 * Creates and configures the Package Browser webview panel.
 *
 * @param context - Extension context for resource URIs and lifecycle management
 * @param logger - Logger instance for debug and error logging
 * @param nugetClient - NuGet API client instance for search operations
 * @returns The configured webview panel
 */
export function createPackageBrowserWebview(
  context: vscode.ExtensionContext,
  logger: ILogger,
  nugetClient: INuGetApiClient,
): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    'opmPackageBrowser',
    'NuGet Package Browser',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'out')],
    }
  );

  // Clean up on disposal
  panel.onDidDispose(() => {
    logger.debug('Package Browser webview disposed');
  });

  // Build and set HTML content
  panel.webview.html = buildPackageBrowserHtml(context, panel.webview, logger);

  // Handle messages from webview - pass client to handlers
  panel.webview.onDidReceiveMessage(message => {
    if (!isWebviewMessage(message)) {
      logger.warn('Invalid webview message received', message);
      return;
    }
    handleWebviewMessage(message, panel, logger, nugetClient);
  });

  logger.debug('Package Browser webview initialized');

  return panel;
}
```

### Update Command Registration

Modify the command registration to create and pass the client instance.

**File:** `src/commands/packageBrowserCommand.ts`

```typescript
import * as vscode from 'vscode';
import { createPackageBrowserWebview } from '../webviews/packageBrowserWebview';
import { createNuGetApiClient } from '../env/node/nugetApiClient';
import type { ILogger } from '../services/loggerService';

export class PackageBrowserCommand {
  static readonly id = 'opm.openPackageBrowser';

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly logger: ILogger,
  ) {}

  async execute(): Promise<void> {
    // Create NuGet API client with default options
    const nugetClient = createNuGetApiClient(this.logger);
    
    // Create webview with injected dependencies
    createPackageBrowserWebview(this.context, this.logger, nugetClient);
    
    this.logger.info('Package Browser opened');
  }

  register(): vscode.Disposable {
    return vscode.commands.registerCommand(PackageBrowserCommand.id, () => this.execute());
  }
}
```

**Why inject client instead of creating in handler:**
- Testability: can inject mock client in tests
- Single instance: avoid creating multiple clients per message
- Lifecycle management: dispose client when panel closes (future enhancement)

---

## <a name="request-handler"></a>Request Handler Implementation

### Replace Mock Handler with Real API Integration

**File:** `src/webviews/packageBrowserWebview.ts`

```typescript
/**
 * Handle typed messages from the webview client.
 */
function handleWebviewMessage(
  message: unknown,
  panel: vscode.WebviewPanel,
  logger: ILogger,
  nugetClient: INuGetApiClient,
): void {
  const msg = message as { type: string; [key: string]: unknown };

  if (isWebviewReadyMessage(msg)) {
    handleWebviewReady(msg, panel, logger);
  } else if (isSearchRequestMessage(msg)) {
    void handleSearchRequest(msg, panel, logger, nugetClient);
  } else {
    logger.warn('Unknown webview message type', msg);
  }
}

function handleWebviewReady(
  message: WebviewReadyMessage,
  panel: vscode.WebviewPanel,
  logger: ILogger,
): void {
  logger.debug('Webview ready - sending initial state if needed');
  // Future: send initial configuration (default source, prerelease preference, etc.)
}

/**
 * Handle search request from webview.
 * Calls NuGet API, transforms results, and sends response message.
 */
async function handleSearchRequest(
  message: SearchRequestMessage,
  panel: vscode.WebviewPanel,
  logger: ILogger,
  nugetClient: INuGetApiClient,
): Promise<void> {
  const { query, includePrerelease, skip, take, requestId } = message.payload;

  logger.info('Search request received', {
    query,
    includePrerelease,
    skip,
    take,
    requestId,
  });

  // Create AbortController for timeout (webview can't cancel via IPC currently)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s total timeout

  try {
    // Call NuGet API client
    const result = await nugetClient.searchPackages(
      {
        query,
        prerelease: includePrerelease ?? false,
        skip: skip ?? 0,
        take: take ?? 20,
      },
      controller.signal,
    );

    clearTimeout(timeoutId);

    if (result.success) {
      // Transform domain models to webview types
      const webviewResults = result.result.map(mapToWebviewPackage);

      logger.debug('Search completed successfully', {
        packageCount: webviewResults.length,
        requestId,
      });

      // Send success response
      const response: SearchResponseMessage = {
        type: 'notification',
        name: 'searchResponse',
        args: {
          query,
          results: webviewResults,
          totalCount: webviewResults.length,
          requestId,
        },
      };

      await panel.webview.postMessage(response);
    } else {
      // Handle API errors
      await handleSearchError(result.error, panel, logger, query, requestId);
    }
  } catch (error) {
    clearTimeout(timeoutId);

    logger.error('Unexpected error in search handler', error);

    // Send generic error response
    const response: SearchResponseMessage = {
      type: 'notification',
      name: 'searchResponse',
      args: {
        query,
        results: [],
        totalCount: 0,
        requestId,
        error: {
          message: 'An unexpected error occurred. Please try again.',
          code: 'Unknown',
        },
      },
    };

    await panel.webview.postMessage(response);
  }
}
```

---

## <a name="type-mapping"></a>Type Mapping

### Domain Model to Webview Type Transformation

The NuGet API client returns domain models, but the webview expects a slightly different shape.

**File:** `src/webviews/packageBrowserWebview.ts`

```typescript
import type { PackageSearchResult as DomainPackageSearchResult } from '../domain/models/packageSearchResult';
import type { PackageSearchResult as WebviewPackageSearchResult } from './apps/package-browser/types';

/**
 * Maps domain PackageSearchResult to webview PackageSearchResult.
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
```

---

## <a name="error-handling"></a>Error Handling

### Handle All NuGetError Types

**File:** `src/webviews/packageBrowserWebview.ts`

```typescript
import type { NuGetError } from '../domain/models/nugetError';

async function handleSearchError(
  error: NuGetError,
  panel: vscode.WebviewPanel,
  logger: ILogger,
  query: string,
  requestId?: string,
): Promise<void> {
  let userMessage: string;
  let errorCode: string;

  switch (error.code) {
    case 'Network':
      logger.warn('Network error during search', { message: error.message });
      userMessage = 'Unable to connect to NuGet. Please check your internet connection.';
      errorCode = 'Network';
      break;

    case 'ApiError':
      logger.error('NuGet API error', { message: error.message, statusCode: error.statusCode });
      userMessage = error.statusCode === 503
        ? 'NuGet service is temporarily unavailable. Please try again later.'
        : `NuGet API error. Please try again later.`;
      errorCode = 'ApiError';
      break;

    case 'RateLimit':
      logger.warn('Rate limit exceeded', { retryAfter: error.retryAfter });
      userMessage = `Too many requests. Please wait ${error.retryAfter || 60} seconds.`;
      errorCode = 'RateLimit';
      break;

    case 'ParseError':
      logger.error('Failed to parse NuGet response', { message: error.message });
      userMessage = 'Unable to process NuGet response. Please try again later.';
      errorCode = 'ParseError';
      break;

    case 'AuthRequired':
      logger.warn('Authentication required', { message: error.message });
      userMessage = 'This NuGet source requires authentication.';
      errorCode = 'AuthRequired';
      break;

    default:
      const _exhaustive: never = error;
      logger.error('Unknown error type', _exhaustive);
      userMessage = 'An unexpected error occurred.';
      errorCode = 'Unknown';
  }

  const response: SearchResponseMessage = {
    type: 'notification',
    name: 'searchResponse',
    args: {
      query,
      results: [],
      totalCount: 0,
      requestId,
      error: {
        message: userMessage,
        code: errorCode,
      },
    },
  };

  await panel.webview.postMessage(response);
}
```

---

## <a name="request-tracking"></a>Request Tracking

The webview app already handles request tracking via `requestId` - no additional work needed in the controller. Each request is independent and stateless.

---

## <a name="logging-integration"></a>Logging Integration

All logging already uses the injected `ILogger` instance. Follow existing patterns:

```typescript
logger.debug('Search request received', { query, requestId });
logger.info('Search completed successfully', { packageCount });
logger.warn('Rate limit exceeded', { retryAfter });
logger.error('Failed to parse response', { message });
```

---

## <a name="testing"></a>Unit Testing

**File:** `src/webviews/__tests__/packageBrowserWebview.test.ts`

```typescript
import { describe, it, expect } from 'bun:test';
import type { PackageSearchResult as DomainPackageSearchResult } from '../../domain/models/packageSearchResult';

describe('Type Mapping', () => {
  it('should map domain to webview format', () => {
    const domain: DomainPackageSearchResult = {
      id: 'Test.Package',
      version: '1.0.0',
      description: 'Test package',
      authors: ['Author'],
      downloadCount: 1000,
      iconUrl: 'https://example.com/icon.png',
      verified: true,
      tags: ['test'],
    };

    const webview = mapToWebviewPackage(domain);

    expect(webview.totalDownloads).toBe(1000);
    expect(webview.iconUrl).toBe('https://example.com/icon.png');
  });

  it('should convert empty strings to null', () => {
    const domain: DomainPackageSearchResult = {
      id: 'Test',
      version: '1.0.0',
      description: '',
      authors: [],
      downloadCount: 0,
      iconUrl: '',
      verified: false,
      tags: [],
    };

    const webview = mapToWebviewPackage(domain);

    expect(webview.description).toBeNull();
    expect(webview.iconUrl).toBeNull();
  });
});
```

---

## <a name="integration-tests"></a>Integration Testing

**File:** `test/integration/packageBrowserSearch.integration.test.ts`

```typescript
import { describe, it, expect } from 'bun:test';
import { createNuGetApiClient } from '../../src/env/node/nugetApiClient';
import { createLogger } from '../../src/services/loggerService';

describe('Search Integration', () => {
  it('should search real NuGet API', async () => {
    const logger = createLogger();
    const client = createNuGetApiClient(logger);

    const result = await client.searchPackages({
      query: 'Newtonsoft.Json',
      prerelease: false,
      skip: 0,
      take: 10,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result.length).toBeGreaterThan(0);
    }

    logger.dispose();
  });
});
```

---

## <a name="e2e-tests"></a>E2E Testing

**File:** `test/e2e/packageBrowserSearch.e2e.ts`

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Package Browser E2E', function () {
  this.timeout(10000);

  test('should open Package Browser', async () => {
    await vscode.commands.executeCommand('opm.openPackageBrowser');
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.ok(true, 'Webview opened successfully');
  });
});
```

---

## References

- [NuGet Search API](https://learn.microsoft.com/en-us/nuget/api/search-query-service-resource)
- [IMPL-001-01-003: Search Results List](./IMPL-001-01-003-search-results-list.md)
- [STORY-001-01-001: NuGet Search API](../stories/STORY-001-01-001-nuget-search-api.md)

---

**Document ID**: IMPL-001-01-004-api-search-integration  
**Feature**: [FEAT-001-01-browse-search](../features/FEAT-001-01-browse-search.md)
