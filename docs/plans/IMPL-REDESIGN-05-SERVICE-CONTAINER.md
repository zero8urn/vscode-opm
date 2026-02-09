# IMPL-REDESIGN-05: Service Container & Factory

> **Phase 5 of 6** — Centralize DI with Abstract Factory pattern, reduce extension.ts to ~20 LOC

**Status:** Planning  
**Priority:** P2  
**Estimated Effort:** 1 week  
**Risk Level:** Low  
**Dependencies:** Phases 1-4

---

## Overview

### Problem
Current `extension.ts` has:
- Manual service instantiation (~150 LOC)
- Dependency order management
- No testability (can't swap implementations)

### Solution
Apply **Abstract Factory** + **Service Container** patterns:

```
IServiceFactory (~30 LOC interface)
├── NodeServiceFactory (~80 LOC)      // Production: real VS Code APIs
├── TestServiceFactory (~80 LOC)      // Testing: mocks + stubs
└── LocalFeedServiceFactory (~60 LOC) // Custom: local NuGet feeds

ServiceContainer (~100 LOC)           // DI container with lifecycle
├── register(factory)
├── getService<T>(id)
└── dispose()                         // Cleanup
```

### Success Criteria
- ✅ `extension.ts` reduced to ~20 LOC
- ✅ All services registered via factory
- ✅ 10 new container tests
- ✅ Testability improved (swap factories)

---

## Implementation Steps

### Step 1: Design Service Factory Interface

**File:** `src/infrastructure/serviceFactory.ts` (~30 LOC)

```typescript
export interface IServiceFactory {
  createLogger(): ILogger;
  createNuGetClient(): INuGetClient;
  createProjectDiscovery(): IProjectDiscovery;
  createPackageCliService(): IPackageCliService;
  createInstallCommand(): InstallPackageCommand;
  createUninstallCommand(): UninstallPackageCommand;
  // ... all services
}
```

---

### Step 2: Implement NodeServiceFactory

**File:** `src/env/node/nodeServiceFactory.ts` (~80 LOC)

```typescript
export class NodeServiceFactory implements IServiceFactory {
  constructor(private readonly context: vscode.ExtensionContext) {}

  createLogger(): ILogger {
    const channel = vscode.window.createOutputChannel('OPM');
    return new LoggerService(channel);
  }

  createNuGetClient(): INuGetClient {
    const httpClient = new HttpClient();
    const pipeline = new HttpPipeline(httpClient, [new RetryMiddleware(), new RateLimitMiddleware()]);
    const indexResolver = new ServiceIndexResolver(pipeline);
    const searchExecutor = new SearchExecutor(pipeline, indexResolver);
    const metadataFetcher = new MetadataFetcher(pipeline, indexResolver);
    const readmeFetcher = new ReadmeFetcher(pipeline, indexResolver);
    return new NuGetApiFacade(searchExecutor, metadataFetcher, readmeFetcher);
  }

  createInstallCommand(): InstallPackageCommand {
    const cli = this.createPackageCliService();
    const logger = this.createLogger();
    const parser = this.createProjectParser();
    const progress = new VsCodeProgressReporter();
    return new InstallPackageCommand(cli, logger, parser, progress);
  }

  // ... all service factories
}
```

---

### Step 3: Create ServiceContainer

**File:** `src/infrastructure/serviceContainer.ts` (~100 LOC)

```typescript
export class ServiceContainer {
  private readonly services = new Map<string, any>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly factory: IServiceFactory) {}

  getService<T>(id: string): T {
    if (!this.services.has(id)) {
      this.services.set(id, this.createService(id));
    }
    return this.services.get(id)!;
  }

  private createService(id: string): any {
    switch (id) {
      case 'logger':
        return this.factory.createLogger();
      case 'nugetClient':
        return this.factory.createNuGetClient();
      case 'installCommand':
        return this.factory.createInstallCommand();
      // ... all services
      default:
        throw new Error(`Unknown service: ${id}`);
    }
  }

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.services.clear();
  }
}
```

---

### Step 4: Refactor extension.ts

**Before:** ~150 LOC of manual instantiation  
**After:** ~20 LOC

```typescript
export function activate(context: vscode.ExtensionContext) {
  const factory = new NodeServiceFactory(context);
  const container = new ServiceContainer(factory);

  // Register commands
  const installCommand = container.getService<InstallPackageCommand>('installCommand');
  context.subscriptions.push(vscode.commands.registerCommand('opm.installPackage', installCommand.execute));

  // ... register all commands (5 lines each)

  context.subscriptions.push({ dispose: () => container.dispose() });
}
```

**Acceptance Criteria:**
- [ ] `extension.ts` ≤30 LOC
- [ ] All services from container
- [ ] No manual instantiation

---

### Step 5: Create TestServiceFactory

**File:** `src/infrastructure/testServiceFactory.ts` (~80 LOC)

```typescript
export class TestServiceFactory implements IServiceFactory {
  createLogger(): ILogger {
    return new MockLogger(); // In-memory logger for tests
  }

  createNuGetClient(): INuGetClient {
    return new StubNuGetClient(); // Stub with fake data
  }

  // ... all services return test doubles
}
```

**Usage in tests:**

```typescript
describe('InstallPackageCommand', () => {
  test('executes successfully', async () => {
    const factory = new TestServiceFactory();
    const container = new ServiceContainer(factory);
    const command = container.getService<InstallPackageCommand>('installCommand');

    const result = await command.execute({ packageId: 'Newtonsoft.Json', version: '13.0.1', projectPaths: ['test.csproj'] });
    expect(result.successCount).toBe(1);
  });
});
```

---

## Rollback Plan

**Risk:** Low — non-functional refactor (same runtime behavior)

**Strategy:**
1. Keep old extension.ts as extension.legacy.ts
2. Feature flag to toggle
3. Assert same service instances created

---

## Next Steps

After Phase 5:
- ✅ Centralized DI with Abstract Factory
- ✅ extension.ts reduced to ~20 LOC
- 🚀 **Proceed to Phase 6:** Final Polish

---

## Related Documents
- **Master Plan:** [IMPL-REDESIGN-00-MASTER-PLAN.md](IMPL-REDESIGN-00-MASTER-PLAN.md)
- **Previous:** [IMPL-REDESIGN-04-WEBVIEW-MEDIATOR.md](IMPL-REDESIGN-04-WEBVIEW-MEDIATOR.md)
- **Next:** [IMPL-REDESIGN-06-POLISH.md](IMPL-REDESIGN-06-POLISH.md)
