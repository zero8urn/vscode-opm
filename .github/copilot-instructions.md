<!--
This file contains concise, repository-specific instructions for AI coding agents
to help them be productive in `vscode-opm` (Octothorpe Package Manager). Keep it
short and focused on the key workflows, conventions, and integration points.
-->

# copilot-instructions.md — OPM (vscode-opm)

This repository implements a small VS Code extension for .NET package management.
Focus on the provider-based domain layer, TypeScript + Bun build toolchain, and
minimal webview/tree view integration.

Key pointers (most actionable first):

- Big picture: The extension registers commands in `src/extension.ts`, uses a
  provider abstraction under `src/domain/` (`DomainProvider`, `DomainProviderService`)
  and exposes a tree view (`src/views/SimpleViewProvider.ts`) and a scaffold webview
  (`src/webviews/sampleWebview.ts`). The provider pattern decouples environment
  implementations (e.g., `src/env/node`) from domain logic.

- Build & dev: Use Bun (or node) — recommended in the Dev Container. Typical flow:
  `bun install` → `bun run build` (bundles with esbuild, output `out/extension.js`) →
  F5 for Extension Development Host. See `README.md` and `.vscode/tasks.json`.

- Tests: Three test types with distinct runners and locations:
  - **Unit tests** (`src/**/__tests__/*.test.ts`): Bun test runner, co-located with source.
    Run via `bun test src/` or `npm run test:unit`. Mock external dependencies.
  - **Integration tests** (`test/integration/*.integration.test.ts`): Bun test runner,
    test real API/network calls. Run via `bun test test/integration/` or `npm run test:integration`.
  - **E2E tests** (`test/e2e/*.e2e.ts`): Mocha in VS Code Extension Host via `@vscode/test-electron`.
    Run via `npm run test:e2e` or F5 "E2E Tests" launch config. Only place to test VS Code APIs
    (commands, webviews, tree views) in real Extension Host.

- Commands & contributions: Command ids follow the `opm.*` prefix: example
  `opm.hello` (see `src/commands/helloCommand.ts`) and `opm.openWebview` in `package.json`.
  Register commands in `extension.ts` and keep them minimal; delegate to domain
  services where possible.

- Domain & types: Domain contracts live in `src/domain/domainProvider.ts` using
  `DomainResult<T>` and `DomainError` types. Respect the `success/error` shape
  (don't throw raw errors from providers): return `{ success: false, error: { code: '...' } }`.

- Webviews & IPC: Use `acquireVsCodeApi()` on the client side and `postMessage()` to
  communicate. Follow `src/webviews/*` conventions: small typed requests, commands
  and notifications. Validate all incoming webview messages on the host.

- Bundling & externals: The extension build uses esbuild via `scripts/esbuild.config.mjs`.
  Keep `vscode` and `node:*` external in the bundle. Output is `out/extension.js`.

- Conventions & structure:
  - `src/` for all TypeScript source, `out/` for built artifacts
  - Commands are single-purpose objects in `src/commands/**` with an `id` static
    member (e.g., `HelloCommand.id = 'opm.hello'`).
  - Views are `TreeDataProvider` implementations (`src/views/`), and webview apps
    live under `src/webviews/apps/`.
  - Use service/provider layers: register implementations via the provider service
    (`DomainProviderService.register()`), avoid globals.
  - Services needing VS Code APIs: use `import type * as vscode` + constructor DI +
    a `createXxx(context)` factory. Example: `LoggerService` accepts injected
    `OutputChannel` for tests; `createLogger(context)` imports `vscode` at runtime
    and creates the real instance for `extension.ts` activation. Never use runtime
    `require('vscode')` in library code; keep it only in factories.

- CI & packaging:
  - Lint pre-PR: `bun run lint` (eslint rules configured for TypeScript). Auto-fix
    with `bun run lint:fix`.
  - Package with `bun run package` (uses `vsce` to bundle a VSIX).

- Debugging tips:
  - If debugging webviews, use VS Code's Webview developer tools (Open DevTools)
  - Use `console.log` in webviews and listen to `onDidReceiveMessage` in host
  - Use the dev container for consistent environment (Bun pre-installed)

- Core utilities & helpers (use these, don't reinvent):
  - **LoggerService** (`src/services/loggerService.ts`): Use `logger.info()`, `logger.warn()`, 
    `logger.error()`, `logger.debug()` instead of `console.*`. Inject `ILogger` into components
    that need logging. Never use `console.log/warn/error` in extension host code.
  - **HTML Sanitization** (`src/webviews/sanitizer.ts`): Always sanitize untrusted HTML 
    (package READMEs, descriptions, external content) using `sanitizeHtml()` before rendering 
    in webviews. Prevents XSS attacks.
  - **Webview Helpers** (`src/webviews/webviewHelpers.ts`): Use `createNonce()` for CSP nonces, 
    `getWebviewUri()` + `createUriUtils()` for resource URIs, `buildCspMeta()` for strict CSP 
    headers, `buildHtmlTemplate()` for complete HTML documents with sanitization + CSP, and 
    `isWebviewMessage()` to validate incoming webview messages. Never build webview HTML manually.
  - **ThemeService** (`src/services/themeService.ts`): Register webviews with 
    `ThemeService.instance.registerWebview(panel)` to receive automatic theme token updates.
    Unregister on disposal.

- Examples to reference in edits:
  - `src/extension.ts` — activation, command registration
  - `src/domain/domainProvider.ts` & `src/domain/domainProviderService.ts` — provider pattern
  - `src/views/SimpleViewProvider.ts` — tree view example & contextValue for menu
  - `src/webviews/sampleWebview.ts` — webview bootstrap and message handling
  - `scripts/esbuild.config.mjs` — bundle config for extension host

When in doubt: run the recommended quick start in `README.md` (Dev Container + `bun run build`).

If you need a deeper explanation or to add repository-specific coding styles
and rules, leave inline comments and ask to expand sections (e.g., provider
contracts or webview protocols) with specific examples and tests.


---
description: 'Guidelines for TypeScript Development targeting TypeScript 5.x and ES2022 output'
applyTo: '**/*.ts'
---

# TypeScript Development

> These instructions assume projects are built with TypeScript 5.x (or newer) compiling to an ES2022 JavaScript baseline. Adjust guidance if your runtime requires older language targets or down-level transpilation.

## Core Intent

- Respect the existing architecture and coding standards.
- Prefer readable, explicit solutions over clever shortcuts.
- Extend current abstractions before inventing new ones.
- Prioritize maintainability and clarity, short methods and classes, clean code.

## General Guardrails

- Target TypeScript 5.x / ES2022 and prefer native features over polyfills.
- Use pure ES modules; never emit `require`, `module.exports`, or CommonJS helpers.
- Rely on the project's build, lint, and test scripts unless asked otherwise.
- Note design trade-offs when intent is not obvious.

## Project Organization

- Follow the repository's folder and responsibility layout for new code.
- Use kebab-case filenames (e.g., `user-session.ts`, `data-service.ts`) unless told otherwise.
- Keep tests, types, and helpers near their implementation when it aids discovery.
- Reuse or extend shared utilities before adding new ones.

## Naming & Style

- Use PascalCase for classes, interfaces, enums, and type aliases; camelCase for everything else.
- Skip interface prefixes like `I`; rely on descriptive names.
- Name things for their behavior or domain meaning, not implementation.

## Formatting & Style

- Run the repository's lint/format scripts (e.g., `npm run lint`) before submitting.
- Match the project's indentation, quote style, and trailing comma rules.
- Keep functions focused; extract helpers when logic branches grow.
- Favor immutable data and pure functions when practical.

## Type System Expectations

- Avoid `any` (implicit or explicit); prefer `unknown` plus narrowing.
- Use discriminated unions for realtime events and state machines.
- Centralize shared contracts instead of duplicating shapes.
- Express intent with TypeScript utility types (e.g., `Readonly`, `Partial`, `Record`).

## Async, Events & Error Handling

- Use `async/await`; wrap awaits in try/catch with structured errors.
- Guard edge cases early to avoid deep nesting.
- Send errors through the project's logging/telemetry utilities.
- Surface user-facing errors via the repository's notification pattern.
- Debounce configuration-driven updates and dispose resources deterministically.

## Architecture & Patterns

- Follow the repository's dependency injection or composition pattern; keep modules single-purpose.
- Observe existing initialization and disposal sequences when wiring into lifecycles.
- Keep transport, domain, and presentation layers decoupled with clear interfaces.
- Supply lifecycle hooks (e.g., `initialize`, `dispose`) and targeted tests when adding services.

## External Integrations

- Instantiate clients outside hot paths and inject them for testability.
- Never hardcode secrets; load them from secure sources.
- Apply retries, backoff, and cancellation to network or IO calls.
- Normalize external responses and map errors to domain shapes.

## Security Practices

- Validate and sanitize external input with schema validators or type guards.
- Avoid dynamic code execution and untrusted template rendering.
- Encode untrusted content before rendering HTML; use framework escaping or trusted types.
- Use parameterized queries or prepared statements to block injection.
- Keep secrets in secure storage, rotate them regularly, and request least-privilege scopes.
- Favor immutable flows and defensive copies for sensitive data.
- Use vetted crypto libraries only.
- Patch dependencies promptly and monitor advisories.

## Configuration & Secrets

- Reach configuration through shared helpers and validate with schemas or dedicated validators.
- Handle secrets via the project's secure storage; guard `undefined` and error states.
- Document new configuration keys and update related tests.

## UI & UX Components

- Sanitize user or external content before rendering.
- Keep UI layers thin; push heavy logic to services or state managers.
- Use messaging or events to decouple UI from business logic.

## Testing Expectations

- Add or update unit tests with the project's framework and naming style.
- Expand integration or end-to-end suites when behavior crosses modules or platform APIs.
- Run targeted test scripts for quick feedback before submitting.
- Avoid brittle timing assertions; prefer fake timers or injected clocks.

## Performance & Reliability

- Lazy-load heavy dependencies and dispose them when done.
- Defer expensive work until users need it.
- Batch or debounce high-frequency events to reduce thrash.
- Track resource lifetimes to prevent leaks.

## Documentation & Comments

- Add JSDoc to public APIs; include `@remarks` or `@example` when helpful.
- Write comments that capture intent, and remove stale notes during refactors.
- Update architecture or design docs when introducing significant patterns.