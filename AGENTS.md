# AGENTS.md — OPM (vscode-opm)

**Agent Instructions for VS Code Extension Development**

This file provides coding guidelines and workflows for agentic assistants working in the **Octothorpe Package Manager (OPM)** repository — a VS Code extension for .NET dependency management built with TypeScript, Bun, and Lit.

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

- **PascalCase**: Classes, interfaces, types, enums (no `I` prefix on interfaces)
- **camelCase**: Functions, variables, properties
- **kebab-case**: File names (`install-package-command.ts`)
- **Commands**: `opm.*` prefix (`opm.openPackageBrowser`)
- **Constants**: UPPER_SNAKE_CASE or const assertions (`PACKAGE_CARD_TAG = 'package-card' as const`)

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

- **Line width**: 120 characters
- **Indentation**: 2 spaces (not tabs)
- **Quotes**: Single quotes
- **Trailing commas**: ES5 (objects, arrays)
- **Line endings**: LF (Unix)
- **Semicolons**: Always

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

### Domain Layer: Result Types (NO Exceptions)

```typescript
// Domain contracts return DomainResult<T>, NEVER throw
export type DomainResult<T> = { success: true; result: T } | { success: false; error: DomainError };

export type DomainError =
  | { code: 'RateLimit'; message: string; retryAfter?: number }
  | { code: 'Network'; message: string; details?: string }
  | { code: 'ApiError'; message: string; statusCode?: number }
  | { code: 'Validation'; message: string; field?: string };

// Usage
const result = await client.searchPackages(options);
if (!result.success) {
  logger.error('Search failed', result.error);
  return;
}
// Use result.result safely
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

### Service Design: Single-Class Cohesion

- Group all related operations in ONE class (e.g., `NuGetApiClient`, `LoggerService`)
- Use private methods for shared logic within the class
- Avoid splitting into utility files unless reused across multiple classes
- Keep services focused on a single responsibility

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

1. Create command class in `src/commands/my-command.ts`
2. Define `static id = 'opm.myCommand'`
3. Register in `src/extension.ts` activation
4. Add to `package.json` contributions
5. Write unit tests in `src/commands/__tests__/my-command.test.ts`
6. Add E2E test in `test/e2e/my-command.e2e.ts`

### Creating a Webview

1. Use `buildHtmlTemplate()` from `webviewHelpers.ts`
2. Sanitize all external content via `sanitizeHtml()`
3. Define typed IPC messages in `types.ts`
4. Use `onDidReceiveMessage` + `postMessage` for communication
5. Test command execution in E2E (NOT webview internals)

---

## 📚 Key References

**Comprehensive Guidelines**: `.github/copilot-instructions.md` (271 lines of detailed patterns)

**Technical Docs**:

- `docs/technical/code-layout.md` — Repository structure (382 lines)
- `docs/technical/e2e-quick-reference.md` — E2E testing patterns

**Example Files**:

- `src/extension.ts` — Activation & command registration
- `src/domain/domainProvider.ts` — Provider pattern & result types
- `src/webviews/webviewHelpers.ts` — CSP, sanitization, HTML templates
- `test/e2e/packageBrowser.e2e.ts` — E2E test patterns
- `scripts/esbuild.config.mjs` — Build configuration

---

## ⚡ TypeScript & Tooling

- **TypeScript**: 5.x, strict mode, ES2022 target
- **Build**: esbuild (extension + webviews)
- **Externals**: `vscode`, `node:*` (NOT bundled)
- **Module System**: ESM for source, CJS for extension output
- **Decorators**: Experimental decorators enabled (Lit components)

**Type System**:

- Avoid `any`; prefer `unknown` + narrowing
- Use discriminated unions for state machines & errors
- Leverage built-in utility types (`Readonly`, `Partial`, `Record`)

---

## ✨ Quick Tips

- **Start Here**: Dev Container + `bun run build` + F5
- **Debug Webviews**: "Developer: Open Webview Developer Tools"
- **Run Single Test**: `bun test path/to/file.test.ts`
- **Pre-commit**: `bun run lint:fix && bun run typecheck`
- **Focus**: Keep functions small, single-purpose, readable
- **Ask**: When in doubt, check `.github/copilot-instructions.md` or existing patterns

---

**This file synthesizes rules from `.github/copilot-instructions.md` and repository conventions. For deeper guidance, consult that file and the `docs/technical/` directory.**
