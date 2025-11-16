# Repository Layout — vscode-gitlens (reference)

This document summarizes the high-level code layout and architecture of the `vscode-gitlens` repository so you can extract a compact, production-ready layout for a new VS Code extension. It focuses on responsibilities, key files, and where to place new extension code.

## Top-level layout

```
/ (repo root)
├── src/                       # Primary TypeScript source for extension and shared libs
├── docs/                      # Documentation (this and related docs)
├── tests/                     # Unit and E2E tests (co-located and top-level)
├── images/                    # Assets and icon sources
├── scripts/                   # Build & generation helper scripts
├── resources/                 # Binary resources and design files
├── package.json               # npm/pnpm scripts and dependencies
├── pnpm-lock.yaml
├── tsconfig*.json             # Multiple tsconfig targets (node/browser/test)
├── webpack.config.mjs         # Webpack build for webviews & extension bundles
├── README.md
└── LICENSE                    # license files
```

## `src/` overview (minimal starter layout)

```
src/
├── extension.ts              # Extension activation and registration
├── container.ts              # Simple service locator / dependency container (optional)
├── commands/                 # Command implementations (start with 1-3 commands)
│   └── helloCommand.ts
├── config.ts                 # Configuration schema & helpers (keep this)
├── system/                   # Small utilities (logging, helpers)
├── domain/                   # Domain abstraction layer (models/parsers/providers)
│   ├── domainProvider.ts
│   ├── domainProviderService.ts
│   ├── models/
│   └── sub-providers/
├── env/                      # Environment-specific implementations (node)
│   └── node/
│       └── executor.ts       # child_process / API wrapper
├── views/                    # Optional: single tree view provider
└── webviews/                 # Keep webviews for richer UIs (Lit apps & protocol)
```

### Important src subfolders explained

- `extension.ts` — Activation: create container, register commands, views, and cleanup.
- `container.ts` — Service locator with lazy singletons used across the extension. Keep it small and well-typed.
- `commands/` — Each user action is a small command handler; register them via `commands.ts`.
- `env/` — Implement environment-specific bits here:
  - `src/env/node/` — Node/desktop implementations (runs `git` via child_process, FS access).
  - `src/env/browser/` — Browser/webworker implementations (use hosting APIs, limited FS).
- `domain/` — Central domain abstraction layer (see `docs/git-layer.md`): models, parsers, provider interface, sub-providers, integrations/helpers.
- `webviews/` — Web UIs built with Lit; includes `protocol.ts` for strongly-typed IPC.

## Built artifacts & bundling

- Webviews are bundled separately from the extension host. Webview apps live under `src/webviews/apps/*` and are built into `dist/webviews`.
- The extension host bundle is compiled for Node and for browser/webworker targets (webpack entries in `webpack.config.mjs`).
- Build scripts in `package.json` include `build`, `watch`, `bundle`, `build:extension`, `build:webviews`, and test build scripts.

## Scripts & automation

`/scripts` contains helpers used in the build process and for generating artifacts (icons, contributions, telemetry docs). Typical tasks:

- Generate contribution points from `contributions.json`.
- Build icon font assets and copy updated font URLs into webviews.
- Compile webview templates and pre-render small parts for performance.

## Tests

- Unit tests are co-located in `__tests__` folders or `tests/` top-level for E2E.
- Extension tests use `@vscode/test-cli`. E2E tests use Playwright.
- There are specialized watch/test tasks in `package.json` (e.g., `watch:tests`, `test:e2e`).

## Documentation & design assets

- `docs/` contains architecture guides (including `git-layer.md`), telemetry docs, and onboarding guides.
- `images/` contains design source files used to produce icon fonts and webview assets.

## Patterns & architecture decisions you can reuse

- Service Locator (`container.ts`) — central place to access services with lazy init and proper disposal.
- Provider Pattern for runtime abstraction — `domain/` layer defines interfaces; `env/*` provides concrete implementations.
- Sub-providers — break domain operations into focused modules (commits, branches, diff, refs) feature examples to encourage reuse.
- Webview IPC protocol — typed request/response and events, defined in `src/webviews/protocol.ts`.
- Caching & dedupe — provide `DomainCache` and `PromiseCache` utilities to reduce duplicate work and improve responsiveness.
  - promiseCache: Intended for deduplicating in-flight requests and optionally caching results for a time window.
  - domainCache never implements TTL logic itself; it relies on the PromiseCache when TTL/expiry semantics are required.
- Strict typing & tests — prefer small pure functions (parsers) with unit tests; keep side-effects limited to `env/*`.

## Minimal extraction guide: make a compact starter extension

1. Create a new repo scaffold with the following minimal layout:

```
my-ext/
├── src/
│   ├── extension.ts
│   ├── container.ts
│   ├── commands/
│   ├── domain/
│   │   ├── domainProvider.ts
│   │   ├── domainProviderService.ts
│   │   ├── models/
│   │   └── sub-providers/
│   └── env/
│       └── node/
│           └── git.ts
├── package.json
├── tsconfig.json
└── README.md
```

2. Implement a tiny `DomainProvider` interface (the minimal operations your domain needs) and `localDomainProvider` which calls platform-specific executors using a small child_process or API wrapper.
3. Use a `container` to register `DomainProviderService` and the local provider during activation.
4. Add a simple command and view that calls `container.domainProviderService.getItems(...)` (or the equivalent) and renders results.
5. Add unit tests for parsers and a mock `GitProvider` for UI tests.

### Quickstart (copy/paste)

If you want to create a minimal starter extension quickly, follow these steps after creating the files listed above.

Prerequisites:
- Node.js (LTS recommended)
- pnpm (or enable corepack)

Commands to run:

```bash
# install deps
pnpm install

# build once
pnpm run build

# run watch (background) during development
pnpm run watch

# run unit tests
pnpm run test
```

Minimal `package.json` (starter only — adapt as needed):

```json
{
  "name": "my-ext",
  "version": "0.0.1",
  "private": true,
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/vscode": "^1.74.0",
    "pnpm": "^8.0.0"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "watch": "tsc -w -p tsconfig.json",
    "test": "echo \"No tests configured\" && exit 0"
  }
}
```

Minimal `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "lib": ["ES2020"],
    "outDir": "out",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true
  },
  "exclude": ["node_modules", ".vscode-test"]
}
```

From zero → working extension checklist

- [ ] Create the minimal files under `src/` (`extension.ts`, `container.ts`, `commands/helloCommand.ts`).
- [ ] Add a `contributes.commands` entry to `package.json` for your Hello command.
- [ ] Run `pnpm install` then `pnpm run build` and press F5 in VS Code to run the Extension Development Host.
- [ ] Add a unit test for any parser or small helper and add a CI job that runs `pnpm install && pnpm run build && pnpm run test`.


## Quick reference: key files to inspect in this repository

- `src/extension.ts` — entry point and activation flow
- `src/container.ts` — service registration & singletons
-- `src/domain/domainProvider.ts` — domain provider interface
-- `src/domain/domainProviderService.ts` — provider coordination
-- `src/env/node/domain/domain.ts` — node domain executor utility
- `src/webviews/protocol.ts` — webview IPC types
- `scripts/generateCommandTypes.mts` — command generation tooling

## Notes and next steps

- Start by copying the minimal `src/` skeleton above and implement the smallest Git operations you need.
-- Keep the `domain/` layer provider-agnostic and test it independently from `env/*` implementations.
- If you'd like, I can generate the TypeScript skeleton files for the minimal starter layout (interfaces, container, simple local provider, and one sample command + test). Tell me whether you prefer a single-file demo or a small multi-file starter and I'll scaffold it.

---

Created as a compact, actionable summary of the `vscode-gitlens` repository structure to help you extract and reuse the architecture for a smaller extension.

## Project configuration — files to scaffold a new VS Code extension

When creating a new, compact VS Code extension from this repository's architecture, include the following configuration and metadata files. Each entry below lists the filename (or pattern), why it's needed, and a short note about typical contents or choices.

- `package.json`
  - Why: central npm/pnpm manifest. Defines scripts, dependencies, devDependencies, VS Code `engines` and the `contributes` section (or a build step that injects it from `contributions.json`).
  - Note: include scripts for `build`, `watch`, `test`, `package`, and any codegen (e.g., `generate:contributions`).

- `pnpm-workspace.yaml` (optional for monorepos) and `pnpm-lock.yaml`
  - Why: reproducible installs and workspace boundaries when using pnpm; omit for single-package repos if you prefer npm/yarn.

- `tsconfig.json` (and optional targets `tsconfig.node.json`, `tsconfig.browser.json`, `tsconfig.test.json`)
  - Why: TypeScript compilation targets for extension host (Node) and webviews (browser) and tests.
  - Note: keep a minimal `tsconfig.json` with `target`, `module`, `lib`, `outDir`, and `strict` options. Add separate configs only if you support both node and web bundles.

- `webpack.config.mjs` (or rollup/esbuild alternative)
  - Why: bundle the extension host code and webviews separately. Webview code typically needs a browser target and separate entry points.
  - Note: for tiny starters you can avoid bundling and use `tsc` + `node` targets, but bundling is required for published VSIX webviews.

- `contributions.json` (and `contributions.schema.json`) or direct `package.json` contributions
  - Why: maintain a single source of truth for commands, menus, and views; use a generator to inject into `package.json` to avoid duplication.
  - Note: you can keep contributions in `package.json` for very small extensions.

- `.vscodeignore`
  - Why: exclude dev files and node_modules from the VSIX package.

- `.vscode-test.mjs` (test bootstrap) and test scripts
  - Why: provides a reproducible test harness for `@vscode/test-cli` integration tests.

- `scripts/` (small helper scripts)
  - Why: codegen (commands, contributions), icon/font builds, and utility tasks. Start with a minimal `scripts/generateContributions` if using `contributions.json`.

- `eslint.config.mjs`, `.prettierrc`, `.prettierignore`
  - Why: consistent linting and formatting. Use TypeScript-aware ESLint rules and Prettier for style.

- `svgo.config.js`, `.fantasticonrc.js` and an `images/` folder (optional)
  - Why: standard tooling for optimizing SVGs and producing icon fonts used by webviews and UI components.

- `custom-elements-manifest.config.mjs` / `custom-elements.json` (if using web components/Lit)
  - Why: generate web component metadata consumed by documentation or bundlers.

- `README.md`, `LICENSE`, and `CHANGELOG.md` (recommended)
  - Why: documentation for consumers and license obligations. Keep a simple license (MIT or similar) and a short README that explains development and build steps.

- `.gitignore` and optionally `.gitattributes` / `.git-blame-ignore-revs`
  - Why: ignore build artifacts and large files; manage attribution and blame for mass formatting commits.

- `tsserver`, `prettier` and editor config (optional)
  - Why: improve DX; consider adding `.editorconfig` and recommended VS Code extensions in `.vscode/extensions.json`.

Minimal `package.json` script suggestions

```
{
  "scripts": {
    "build": "pnpm run build:extension && pnpm run build:webviews",
    "build:extension": "webpack --config webpack.config.mjs --env target=extension",
    "build:webviews": "webpack --config webpack.config.mjs --env target=webviews",
    "watch": "pnpm run watch:extension & pnpm run watch:webviews",
    "test": "pnpm run build && pnpm run test:unit",
    "package": "vsce package"
  }
}
```

Where to place the files

- `src/` — TypeScript sources for extension host and shared code (follow the minimal starter layout earlier in this document).
- `src/webviews/` — webview apps and `protocol.ts` for IPC if you use webviews.
- `scripts/` — small Node scripts or mts modules used during build.
- `images/` — SVG and raster assets; optimize and generate fonts during CI or local builds.

Quality gates and CI notes

- Include a CI job that runs `pnpm install --frozen-lockfile`, `pnpm run lint`, `pnpm run build`, and `pnpm run test`.
- If you support web targets, run both the Node and web builds in CI and verify webview bundles are generated.
- Cache `pnpm-store` and node modules for faster CI runs.

Quick starter checklist

1. `package.json`, `tsconfig.json`, `webpack.config.mjs` (or `esbuild` alternative)
2. basic `src/extension.ts`, `src/commands/`, `src/container.ts`
3. `.vscodeignore`, `README.md`, `LICENSE`
4. linting config (`eslint`, `prettier`) and `pnpm-lock.yaml`

If you want, I can scaffold these files in this repo as a tiny starter under `scaffold/` or generate a downloadable template. Tell me which option you prefer and I will implement it.

## Webview IPC — how it works (simple terms)

Webviews run in an isolated browser-like environment and communicate with the extension host via a small, typed IPC protocol defined in `src/webviews/protocol.ts`. The protocol is intentionally small and uses three message types with clear responsibilities:

- Commands (fire-and-forget): extension or webview sends an instruction; no response expected. Use for actions like "close panel", "open file", or UI-only updates where the sender doesn't need confirmation.
- Requests (request/response): sender expects a single response or an error. Use for operations that return data (e.g., "get repository state", "fetch commit details"). Requests are Promise-based on the sender side.
- Notifications (host → webview state updates): extension sends state updates to keep webviews in sync; webviews typically handle these to update UI.

Message shape (example)

```
{
  type: 'request' | 'command' | 'notification',
  id?: string,           // present for requests to correlate response
  name: string,          // action or API name e.g. 'getCommit'
  args?: any             // optional payload
}
```

Host-side responsibilities

- Expose handler functions mapped to `name` values and validate incoming payloads.
- For `request` messages: return a Promise and send back either a success response with the same `id` or an error response. Implement a timeout for slow handlers and return an error if exceeded.
- For `command` messages: execute and log errors; do not block the sender.
- For `notification` messages: push state updates to active webviews when underlying data changes.
- Validate the origin and use VS Code-provided messaging APIs (postMessage / onDidReceiveMessage) rather than window-global hacks.

Webview-side responsibilities

- Call `acquireVsCodeApi()` once and use `postMessage()` to send messages to the host.
- For `request` messages: create a unique `id` and await the response; implement a client-side timeout and retry policy if appropriate.
- For `notification` messages: listen for updates and update local state/UI reactively.
- Keep message payloads small and serializable (JSON-friendly). Avoid sending functions or complex class instances.

Error handling & timeouts

- Use structured response objects: { success: true, result: ... } or { success: false, error: { code, message, details? } }.
- Host handlers should catch errors and return a structured error rather than letting exceptions bubble to the runtime.
- Both sides should implement configurable timeouts for requests (default ~10s) and provide a useful error message to the user if a critical request fails.

Security & best practices

- Treat webview messages as untrusted input — validate shapes and types before using any values.
- Only expose the minimum set of handlers required by a webview; use feature flags if handlers are sensitive.
- Sanitize any HTML or data rendered inside webviews to avoid XSS; prefer rendering frameworks (Lit) that handle sanitization for you.
- Avoid embedding secrets into webview HTML. If you must provide tokens, keep them short-lived and scope-limited.

Tiny usage example (webview → host request)

1) Webview sends a request:

```
const id = generateUniqueId();
vscode.postMessage({ type: 'request', id, name: 'getCommit', args: { sha: 'abc123' } });
// wait for response and resolve promise or timeout
```

2) Host handles and replies:

```
// on host
onIpcMessage(msg) {
  if (msg.type === 'request' && msg.name === 'getCommit') {
    getCommit(msg.args.sha).then(commit => {
      webview.postMessage({ type: 'response', id: msg.id, success: true, result: commit });
    }).catch(err => {
      webview.postMessage({ type: 'response', id: msg.id, success: false, error: { message: err.message } });
    });
  }
}
```

Where `onIpcMessage` and `webview.postMessage` are thin wrappers around VS Code's webview messaging APIs. The repository's `src/webviews/protocol.ts` provides types and helpers to standardize these shapes across webviews.
