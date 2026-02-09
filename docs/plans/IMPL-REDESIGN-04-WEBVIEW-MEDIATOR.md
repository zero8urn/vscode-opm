# IMPL-REDESIGN-04: Webview Message Mediator

> **Phase 4 of 6** — Decompose 1034 LOC webview router using Mediator + Command patterns

**Status:** Planning  
**Priority:** P1  
**Estimated Effort:** 2 weeks  
**Risk Level:** Medium  
**Dependencies:** Phase 1, 2, 3

---

## Overview

### Problem
`PackageBrowserWebview` has 1034 LOC with:
- 9 different message handlers in one switch statement
- HTML generation mixed with business logic
- No testability (tightly coupled to VS Code API)

### Solution
Apply **Mediator** + **Command** patterns:

```
WebviewMessageMediator (~80 LOC)    // Mediator: routes messages
├── SearchPackagesHandler (~60 LOC)
├── InstallPackageHandler (~50 LOC)
├── UninstallPackageHandler (~50 LOC)
├── SelectProjectHandler (~40 LOC)
└── ... 5 more handlers (~50 LOC each)

WebviewBuilder (~100 LOC)            // Builder: HTML generation
└── buildPackageBrowserHtml()        // CSP + sanitization

PackageBrowserWebview (~120 LOC)     // Facade: lifecycle management
```

### Success Criteria
- ✅ 1034 LOC → 700 LOC across 12 files (32% reduction)
- ✅ Each handler ≤60 LOC
- ✅ 25 new handler unit tests
- ✅ Webview behavior unchanged

---

## Implementation Steps

### Step 1: Design Message Mediator

**File:** `src/webviews/mediator/webviewMessageMediator.ts` (~80 LOC)

```typescript
export interface IMessageHandler<TRequest = any, TResponse = any> {
  readonly messageType: string;
  handle(request: TRequest, context: MessageContext): Promise<TResponse>;
}

export interface MessageContext {
  readonly webview: vscode.Webview;
  readonly logger: ILogger;
  readonly services: any; // Injected dependencies
}

export class WebviewMessageMediator {
  private readonly handlers = new Map<string, IMessageHandler>();

  registerHandler(handler: IMessageHandler): void {
    if (this.handlers.has(handler.messageType)) {
      throw new Error(`Handler already registered: ${handler.messageType}`);
    }
    this.handlers.set(handler.messageType, handler);
  }

  async dispatch(message: unknown, context: MessageContext): Promise<void> {
    if (!isWebviewMessage(message)) {
      context.logger.warn('Invalid message format', message);
      return;
    }

    const handler = this.handlers.get(message.type);
    if (!handler) {
      context.logger.warn('No handler registered', { type: message.type });
      return;
    }

    try {
      const response = await handler.handle(message, context);
      context.webview.postMessage({ type: `${message.type}:response`, payload: response });
    } catch (error) {
      context.logger.error('Handler failed', { type: message.type, error });
      context.webview.postMessage({ type: `${message.type}:error`, error: String(error) });
    }
  }
}
```

**Tests:** 10 tests for registration, dispatch, error handling

---

### Step 2: Extract Message Handlers

**File:** `src/webviews/handlers/searchPackagesHandler.ts` (~60 LOC)

```typescript
export class SearchPackagesHandler implements IMessageHandler {
  readonly messageType = 'searchPackages';

  constructor(private readonly nugetClient: INuGetClient) {}

  async handle(request: { query: string; skip?: number; take?: number }, context: MessageContext): Promise<any> {
    context.logger.info('Searching packages', { query: request.query });

    const result = await this.nugetClient.searchPackages({
      query: request.query,
      skip: request.skip || 0,
      take: request.take || 20,
    });

    if (!result.success) {
      context.logger.error('Search failed', result.error);
      return { success: false, error: result.error };
    }

    return { success: true, packages: result.value.data, totalHits: result.value.totalHits };
  }
}
```

**Similarly extract:**
- `InstallPackageHandler` (~50 LOC)
- `UninstallPackageHandler` (~50 LOC)
- `SelectProjectHandler` (~40 LOC)
- `GetPackageDetailsHandler` (~60 LOC)
- ... 4 more handlers

**Tests:** 25 unit tests (one suite per handler)

---

### Step 3: Create WebviewBuilder

**File:** `src/webviews/builders/webviewBuilder.ts` (~100 LOC)

**Builder Pattern:** Separate HTML construction from webview logic

```typescript
export class WebviewBuilder {
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly webview: vscode.Webview,
  ) {}

  buildPackageBrowserHtml(): string {
    const scriptUri = this.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'out', 'webviews', 'packageBrowser', 'index.js'),
    );

    return buildHtmlTemplate({
      webview: this.webview,
      extensionUri: this.extensionUri,
      title: 'NuGet Package Browser',
      bodyHtml: '<package-browser-app></package-browser-app>',
      scripts: [scriptUri],
    });
  }

  buildErrorHtml(message: string): string {
    const safeMessage = sanitizeHtml(message);
    return buildHtmlTemplate({
      webview: this.webview,
      extensionUri: this.extensionUri,
      title: 'Error',
      bodyHtml: `<div class="error">${safeMessage}</div>`,
    });
  }
}
```

---

### Step 4: Refactor PackageBrowserWebview

**File:** `src/webviews/packageBrowserWebview.ts` (~120 LOC, down from 1034)

```typescript
export class PackageBrowserWebview {
  private panel?: vscode.WebviewPanel;
  private mediator: WebviewMessageMediator;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly services: any, // Dependencies
    private readonly logger: ILogger,
  ) {
    this.mediator = this.createMediator();
  }

  async show(): Promise<void> {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel('packageBrowser', 'Package Browser', vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
    });

    const builder = new WebviewBuilder(this.extensionUri, this.panel.webview);
    this.panel.webview.html = builder.buildPackageBrowserHtml();

    this.panel.webview.onDidReceiveMessage(msg =>
      this.mediator.dispatch(msg, {
        webview: this.panel!.webview,
        logger: this.logger,
        services: this.services,
      }),
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
  }

  private createMediator(): WebviewMessageMediator {
    const mediator = new WebviewMessageMediator();
    mediator.registerHandler(new SearchPackagesHandler(this.services.nugetClient));
    mediator.registerHandler(new InstallPackageHandler(this.services.installCommand));
    // ... register all 9 handlers
    return mediator;
  }
}
```

**Acceptance Criteria:**
- [ ] Webview ≤150 LOC
- [ ] All message handling delegated
- [ ] HTML generation delegated
- [ ] E2E tests pass

---

### Step 5: Update Tests

**Unit Tests:**
- 10 tests for mediator
- 25 tests for handlers (isolated)
- 5 tests for builder

**E2E Tests:**
- Update to verify mediator integration
- Test multi-message flows
- Verify error handling

---

## Rollback Plan

**Risk:** Medium — IPC changes could break webview communication

**Strategy:**
1. Keep old webview as `PackageBrowserWebview.legacy.ts`
2. Feature flag to toggle
3. Parallel smoke tests

---

## Next Steps

After Phase 4:
- ✅ Webview decomposed into 12 testable handlers
- 🚀 **Proceed to Phase 5:** Service Container

---

## Related Documents
- **Master Plan:** [IMPL-REDESIGN-00-MASTER-PLAN.md](IMPL-REDESIGN-00-MASTER-PLAN.md)
- **Previous:** [IMPL-REDESIGN-03-API-DECOMPOSITION.md](IMPL-REDESIGN-03-API-DECOMPOSITION.md)
- **Next:** [IMPL-REDESIGN-05-SERVICE-CONTAINER.md](IMPL-REDESIGN-05-SERVICE-CONTAINER.md)
