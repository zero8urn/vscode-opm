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

- Tests: Unit tests use Bun's test runner (`bun:test`) and live under
  `src/**/__tests__`. E2E / integration tests use `@vscode/test-electron` in
  `test/`. Run `bun test` for unit tests and run `node test/runTest.ts` or use
  npm/bun wrapper commands when running VS Code tests under CI.

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

- CI & packaging:
  - Lint pre-PR: `bun run lint` (eslint rules configured for TypeScript). Auto-fix
    with `bun run lint:fix`.
  - Package with `bun run package` (uses `vsce` to bundle a VSIX).

- Debugging tips:
  - If debugging webviews, use VS Code's Webview developer tools (Open DevTools)
  - Use `console.log` in webviews and listen to `onDidReceiveMessage` in host
  - Use the dev container for consistent environment (Bun pre-installed)

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
