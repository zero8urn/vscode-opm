# AGENTS.md — OPM (vscode-opm)

**Agent Instructions for Elegant TypeScript Architecture**

This repository is a VS Code extension for .NET package management, guided by Gang of Four patterns, SOLID principles, and modern TypeScript idioms. 

**Core Philosophy:**
- **Single Responsibility**: No file exceeds 300 LOC; one reason to change per class
- **Open/Closed**: Extend via interfaces (new sources, commands, handlers) without modifying existing code
- **Dependency Inversion**: Services depend on abstractions; VS Code API accessed through facades
- **Composition over Inheritance**: Except where Template Method genuinely eliminates duplication
- **Result Types Everywhere**: Unified `Result<T, E>` — no exception-based control flow

---

## 🔧 Build, Lint, Test Commands

### Build & Package

```bash
bun install                          # Install dependencies
bun run build                        # Bundle with esbuild → out/extension.js
bun run typecheck                    # Type-check without emitting
bun run lint                         # Run ESLint
bun run lint:fix                     # Auto-fix linting issues
bun run package                      # Full pipeline: typecheck + lint + build + VSIX
```

### Testing (Three-Tier Strategy)

```bash
# Unit tests (Bun, co-located in src/**/__tests__/)
bun test                             # Run all tests
bun test src/                        # Unit tests only
bun test src/commands/               # Specific directory
bun test src/commands/__tests__/install-package-command.test.ts  # Single test file

# Integration tests (Bun, real APIs in test/integration/)
bun test test/integration/           # All integration tests
bun test test/integration/nuget-api-client.integration.test.ts   # Single integration test

# E2E tests (Mocha, VS Code Extension Host in test/e2e/)
bun run test:e2e                     # All E2E tests (auto-builds first)
node test/runTest.js                 # E2E runner directly
```

**Quick Single Test Examples:**

```bash
# Unit test for specific command
bun test src/commands/__tests__/install-package-command.test.ts

# Integration test for API client
bun test test/integration/nuget-api-client.integration.test.ts
```

---

## 📁 Project Structure

```
src/
├── extension.ts              # Entry point: activation, command registration
├── commands/                 # Command implementations (opm.* namespace)
│   └── __tests__/           # Co-located unit tests
├── domain/                   # Domain layer: abstractions, models, contracts
│   ├── domainProvider.ts    # Provider interface (DomainResult<T>, DomainError)
│   ├── nugetApiClient.ts    # NuGet API client interface
│   ├── models/              # Domain models (Package, Version, etc.)
│   └── parsers/             # Response parsers
├── env/                      # Environment-specific implementations
│   └── node/                # Node.js: NuGet client, config parser
├── services/                 # Long-lived services (logger, config, CLI)
│   ├── loggerService.ts     # Logging abstraction (NEVER use console.log in host)
│   ├── cli/                 # dotnet CLI integration
│   └── discovery/           # Solution/project discovery
├── utils/                    # Pure utilities (version comparison, etc.)
└── webviews/                 # Webview infrastructure
    ├── webviewHelpers.ts    # CSP, URI utils, buildHtmlTemplate()
    ├── sanitizer.ts         # HTML sanitization (ALWAYS sanitize external content)
    └── apps/                # Lit-based webview apps
        └── packageBrowser/  # Main package browser UI
            ├── components/  # Lit web components
            ├── state/       # State management
            └── types.ts     # IPC message types

test/
├── e2e/                     # Extension Host E2E tests (Mocha)
├── integration/             # Real API integration tests (Bun)
└── fixtures/                # Test fixtures
```

---

## 🎨 Code Style Guidelines

### Naming Conventions

- **PascalCase**: Classes, interfaces, types, enums
  - **No `I` prefix on interfaces** (use descriptive names: `Logger` interface, `ConsoleLogger` implementation)
- **camelCase**: Functions, variables, properties, parameters
- **kebab-case**: File names (`install-package-command.ts`, `nuget-facade.ts`)
- **Commands**: `opm.*` prefix (`opm.openPackageBrowser`, `opm.installPackage`)
- **Constants**: `UPPER_SNAKE_CASE` or `as const` assertions
  - Env vars, config keys: `API_BASE_URL`, `MAX_RETRY_COUNT`
  - Lit tag constants: `PACKAGE_CARD_TAG = 'package-card' as const`
- **Avoid Abbreviations**: `configuration` not `config`, `message` not `msg` (except in very local scope)

### Imports & Exports

```typescript
// Type-only imports for VS Code API (avoid bundling issues)
import type * as vscode from 'vscode';
import type { ILogger } from '../services/loggerService';

// Node built-ins use node: prefix
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

// Lit components
import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

// Export co-located tag constants for Lit components
export const PACKAGE_CARD_TAG = 'package-card' as const;

@customElement(PACKAGE_CARD_TAG)
export class PackageCard extends LitElement {
  /* ... */
}
```

### Formatting (Prettier + EditorConfig)

- **Line width**: 120 characters (enforced by Prettier)
- **Indentation**: 2 spaces (not tabs)
- **Quotes**: Single quotes (`'string'` not `"string"`)
- **Trailing commas**: ES5 style (objects, arrays, parameters)
- **Line endings**: LF (Unix), enforced by `.editorconfig`
- **Semicolons**: Always (avoid ASI ambiguity)
- **No Prettier Ignore**: Format all code; extract complex regex/strings to variables if needed

---

## 🧪 Testing Patterns

### Unit Tests (Bun, `src/**/__tests__/*.test.ts`)

- **Runner**: Bun test (`describe`, `test`, `expect` from `bun:test`)
- **Location**: Co-located with source code
- **Purpose**: Fast, isolated, mock external dependencies
- **Example**:

```typescript
import { describe, test, expect, mock } from 'bun:test';

describe('InstallPackageCommand', () => {
  test('rejects empty packageId', async () => {
    const result = await command.execute({ packageId: '' });
    expect(result.success).toBe(false);
  });
});
```

### Integration Tests (Bun, `test/integration/*.integration.test.ts`)

- **Runner**: Bun test
- **Purpose**: Test real APIs, network calls (NuGet.org)
- **Example**:

```typescript
import { describe, test, expect } from 'bun:test';

describe('NuGetApiClient Integration', () => {
  test('searches for popular package', async () => {
    const result = await client.searchPackages({ query: 'Newtonsoft.Json' });
    expect(result.success).toBe(true);
  });
});
```

### E2E Tests (Mocha, `test/e2e/*.e2e.ts`)

- **Runner**: Mocha in Extension Host via `@vscode/test-electron`
- **Style**: Use `suite()` and `test()` (NOT `describe()`/`it()`)
- **Purpose**: Test VS Code integration (commands, webviews, tree views)
- **Key Rules**:
  - ✅ Test command registration, execution, lifecycle
  - ✅ Mock external APIs (don't hit real NuGet.org)
  - ✅ Always await async operations + add 300-500ms delays after webview init
  - ✅ Set explicit timeouts: `this.timeout(5000)` or `this.timeout(10000)`
  - ❌ DON'T test webview DOM/UI (no access from Extension Host)
  - ❌ DON'T test business logic (use unit tests instead)

**Example**:

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Package Browser E2E', () => {
  test('Command executes successfully', async function () {
    this.timeout(10000);
    await vscode.commands.executeCommand('opm.openPackageBrowser');
    await sleep(500); // Allow webview to initialize
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('opm.openPackageBrowser'));
  });
});
```

---

## 🏗️ Architecture Patterns

### Unified Result Type (Post-Refactor)

The redesign consolidates all result types into one generic discriminated union:

```typescript
// src/core/result.ts (new)
export type Result<T, E = AppError> =
  | { readonly success: true; readonly value: T }
  | { readonly success: false; readonly error: E };

export type AppError =
  | { readonly code: 'Network'; readonly message: string; readonly cause?: unknown }
  | { readonly code: 'ApiError'; readonly message: string; readonly statusCode?: number }
  | { readonly code: 'Validation'; readonly message: string; readonly field?: string }
  | { readonly code: 'NotFound'; readonly message: string; readonly resource?: string }
  | { readonly code: 'RateLimit'; readonly message: string; readonly retryAfter?: number };

// Helpers
export const ok = <T>(value: T): Result<T, never> => ({ success: true, value });
export const fail = <E>(error: E): Result<never, E> => ({ success: false, error });

// Combinators
export const mapResult = <T, U, E>(result: Result<T, E>, fn: (v: T) => U): Result<U, E> =>
  result.success ? ok(fn(result.value)) : result;

export const flatMapResult = <T, U, E>(result: Result<T, E>, fn: (v: T) => Result<U, E>): Result<U, E> =>
  result.success ? fn(result.value) : result;
```

**Pre-Refactor (Current):** Use existing `NuGetResult<T>` and `DomainResult<T>` types. Post-refactor, migrate to unified `Result<T, E>`.

```typescript
// Current usage
const result = await client.searchPackages(options);
if (!result.success) {
  logger.error('Search failed', result.error);
  return;
}
// Use result.result (note: property name will change to 'value' post-refactor)
```

### Dependency Injection: Factory Pattern

```typescript
// Services needing VS Code APIs
import type * as vscode from 'vscode'; // type-only import

export interface ILogger {
  info(message: string, ...args: unknown[]): void;
  error(message: string, error?: unknown): void;
}

// Factory imports vscode at runtime
export function createLogger(context: vscode.ExtensionContext): ILogger {
  const vscodeApi: typeof import('vscode') = require('vscode');
  const channel = vscodeApi.window.createOutputChannel('OPM');
  return new LoggerService(channel);
}

// Constructor injection for testability
class LoggerService implements ILogger {
  constructor(private readonly channel: vscode.OutputChannel) {}
  // ...
}
```

### Service Design: Cohesion & Size Limits

**Rules:**
- **300 LOC Maximum**: If a class exceeds 300 lines, decompose using Facade + Strategy patterns
- **Single Responsibility**: One reason to change; one axis of variation
- **Private Methods**: Share logic within a class; extract to separate class only when reused externally
- **No God Objects**: Current `NuGetApiClient` (1376 LOC) and webview host (1034 LOC) violate this — see ELEGANT-REDESIGN.md for decomposition strategy

**Refactor Targets (see `docs/technical/ELEGANT-REDESIGN.md`):**
- `NuGetApiClient` → `NuGetFacade` delegating to 4 focused services (150-200 LOC each)
- `packageBrowserWebview.ts` → `WebviewMessageMediator` + per-message handlers (~50 LOC each)
- `InstallPackageCommand` + `UninstallPackageCommand` → `PackageOperationCommand` base class (Template Method)

---

## 🌐 Webview Patterns

### Security: ALWAYS Sanitize & Use CSP

```typescript
import { buildHtmlTemplate, sanitizeHtml, createNonce } from '../webviewHelpers';

// ✅ CORRECT: Use buildHtmlTemplate with scripts array
const html = buildHtmlTemplate({
  webview,
  extensionUri,
  title: 'Package Browser',
  bodyHtml: '<package-browser-app></package-browser-app>', // Sanitized automatically
  scripts: [webview.asWebviewUri(scriptPath)], // Added after sanitization
});

// ❌ WRONG: Inline scripts are stripped by sanitizer
const html = buildHtmlTemplate({
  bodyHtml: '<div><script src="..."></script></div>', // Script stripped!
});

// Always sanitize external content (README, descriptions)
const safeHtml = sanitizeHtml(packageReadme);
```

### Webview IPC: Typed Messages

```typescript
// Define message types with discriminated unions
export type WebviewMessage =
  | { type: 'searchPackages'; query: string }
  | { type: 'installPackage'; packageId: string; version: string };

// Validate incoming messages
import { isWebviewMessage } from '../webviewHelpers';

webview.onDidReceiveMessage(async (msg: unknown) => {
  if (!isWebviewMessage(msg)) {
    logger.warn('Invalid webview message', msg);
    return;
  }

  switch (msg.type) {
    case 'searchPackages':
      // Handle search
      break;
  }
});
```

### Lit Components: Tag Constants

```typescript
// Export co-located tag constant
export const PACKAGE_CARD_TAG = 'package-card' as const;

@customElement(PACKAGE_CARD_TAG)
export class PackageCard extends LitElement {
  @property() packageId!: string;
  @state() private expanded = false;

  // Use string literals in templates (Lit doesn't support tag interpolation)
  render() {
    return html`<div class="card">${this.packageId}</div>`;
  }
}

// Import to show dependencies
import { PACKAGE_LIST_TAG } from './package-list';
```

### Webview Theming

- Use VS Code CSS variables directly: `--vscode-editor-background`, `--vscode-button-background`
- Variables auto-update when users change themes (NO custom theme service needed)
- See [VS Code Theme Color Reference](https://code.visualstudio.com/api/references/theme-color)

---

## 🔒 Security & Logging

### Logging

```typescript
// Extension Host: ALWAYS use LoggerService (NEVER console.*)
logger.info('Package installed', { packageId, version });
logger.error('Installation failed', error);
logger.debug('API response', response); // Only shown when debug mode enabled

// Webviews: Use console.* (browser context, visible in Webview DevTools)
console.log('Webview initialized'); // ✅ OK in webview code
console.error('IPC failed', error); // ✅ OK in webview code

// For production logging from webviews, send IPC to host
postMessage({ type: 'logError', message: 'Something broke' });
```

### Security Checklist

- ✅ Sanitize all external HTML (package READMEs, descriptions) via `sanitizeHtml()`
- ✅ Use `buildCspMeta()` for strict Content Security Policy
- ✅ Pass scripts via `scripts: [uri]` array (NEVER inline in bodyHtml)
- ✅ Validate all webview messages with type guards
- ✅ Never hardcode secrets; use secure storage
- ✅ Use parameterized queries (avoid injection)

---

## 🚀 Common Workflows

### Adding a New Command

**Pre-Refactor (Current):**
1. Create command class in `src/commands/my-command.ts` with `static id = 'opm.myCommand'`
2. Register in `src/extension.ts` activation function
3. Add command contribution to `package.json`
4. Write unit tests in `src/commands/__tests__/my-command.test.ts`
5. Add E2E test in `test/e2e/my-command.e2e.ts`

**Post-Refactor (Planned):**
1. If package operation (install/update/uninstall), extend `PackageOperationCommand` base class (~40 LOC)
2. Otherwise, implement `ICommand` interface directly
3. Auto-discovered by `ServiceContainer` (no manual registration in `extension.ts`)

### Creating a Webview

1. Use `buildHtmlTemplate()` from `webviewHelpers.ts` (preserves CSP + sanitization)
2. Sanitize external content (READMEs, descriptions) via `sanitizeHtml()`
3. Define typed IPC messages in `types.ts` (discriminated union)
4. Create per-message handlers implementing `IMessageHandler<TMessage, TResponse>`
5. Register handlers with `WebviewMessageMediator`
6. Test command execution in E2E (NOT webview DOM—use unit tests with JSDOM if needed)

---

## 📚 Key References

**Architecture & Refactoring**:
- `docs/technical/ELEGANT-REDESIGN.md` — Comprehensive GoF pattern-based refactor strategy (eliminates god files, 70% command duplication, adds extensibility)
- `docs/technical/code-layout.md` — Current repository structure

**Testing**:
- `docs/technical/e2e-quick-reference.md` — Extension Host E2E patterns
- `test/e2e/packageBrowser.e2e.ts` — E2E examples

**Implementation Examples**:
- `src/extension.ts` — Activation & command registration
- `src/webviews/webviewHelpers.ts` — CSP, sanitization, HTML templates (✅ keep these patterns)
- `src/utils/batchProcessor.ts` — Clean bounded-concurrency abstraction (✅ preserve)
- `scripts/esbuild.config.mjs` — esbuild configuration

---

## ⚡ TypeScript & Tooling

- **TypeScript**: 5.x, strict mode, ES2022 target, `noUncheckedIndexedAccess: true`
- **Build**: esbuild (extension + webviews), separate bundles for extension host and webview contexts
- **Externals**: `vscode`, `node:*` (NOT bundled), `@vscode/*` packages
- **Module System**: ESM for source, CJS for extension output (VS Code requirement)
- **Decorators**: Experimental decorators enabled (Lit components only)

**Type System Best Practices**:
- **Zero `any`**: Use `unknown` + type guards; leverage TypeScript's control flow analysis
- **Discriminated Unions**: Required for state machines, errors, and IPC messages
- **Utility Types**: Prefer `Readonly<T>`, `Partial<T>`, `Record<K, V>` over manual repetition
- **Const Assertions**: Use `as const` for literal types (tag constants, config objects)
- **Branded Types**: For IDs and opaque values (`type PackageId = string & { __brand: 'PackageId' }`)
- **Generic Constraints**: Narrow with `extends` to enforce contracts at compile time

---

## 🎯 GoF Patterns in Use (Post-Refactor)

When implementing new features, prefer these proven patterns from the redesign:

| Pattern | Use Case | Example |
|---------|----------|---------|
| **Template Method** | Shared workflows with variation points | `PackageOperationCommand` base class for install/uninstall/update |
| **Facade + Strategy** | Decompose complex services | `NuGetFacade` → 4 focused collaborators + pluggable source adapters |
| **Mediator + Command** | Message routing | `WebviewMessageMediator` + per-message `IMessageHandler` classes |
| **Chain of Responsibility** | Composable pipelines | HTTP middleware: auth → retry → cache → timeout → log |
| **Abstract Factory** | Environment-specific services | `NodeServiceFactory` vs `TestServiceFactory` |
| **Observer** | Decoupled events | `EventBus` for cache invalidation, config changes, project updates |
| **Builder** | Fluent construction | `WebviewBuilder`, `HttpPipelineBuilder` |

## ✨ Quick Tips

- **Start Here**: Dev Container → `bun run build` → F5 for Extension Development Host
- **Debug Webviews**: Command Palette → "Developer: Open Webview Developer Tools"
- **Run Single Test**: `bun test path/to/file.test.ts`
- **Pre-commit Checklist**: `bun run lint:fix && bun run typecheck && bun test`
- **File Size Alert**: If a class approaches 300 LOC, apply Facade/Strategy decomposition
- **New Command**: Extend `PackageOperationCommand` if it fits the workflow; otherwise implement fresh
- **New Source Type**: Implement `ISourceAdapter` interface; register with adapter registry

---

**This file is the single source of truth for agent instructions. For architectural decisions, consult `docs/technical/ELEGANT-REDESIGN.md`.**
