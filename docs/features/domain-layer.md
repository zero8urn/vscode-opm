# Domain Layer (src/domain) — Layout & Usage

This document extracts the minimal, reusable architecture for the `src/domain` layer and explains how you can use it as the canonical domain abstraction when building a smaller VS Code extension.

## Purpose

The `src/domain` folder represents the domain abstraction layer — the stable, environment-agnostic API boundary between your extension's UI/commands and actual implementations (local executors via child_process, remote host APIs, etc.). It centralizes typed models, parsing/transform logic, provider interfaces, and shared operation modules so the rest of the extension consumes a simple, consistent API.

## Directory layout (recommended minimal)

```
src/domain/
├── domainProvider.ts          # Provider interface and types
├── domainProviderService.ts   # Provider discovery/selection/coordination
├── models/                    # Typed models for your domain (DomainItem, DomainCollection, etc.)
├── parsers/                   # Parsers/transformers that convert raw API / stdout -> models
├── sub-providers/             # Operation-specific modules (items, refs, diffs, status)
└── integrations/              # Host/integration helpers (URL parsing, host mapping)
```

> Place only environment-agnostic logic here. Concrete implementations belong under `src/env/*` (e.g., `src/env/node` or `src/env/browser`).

## Core responsibilities

-- Define the `DomainProvider` contract (inputs, outputs, error modes).
-- Provide a `DomainProviderService` to register and pick providers for a repository or workspace.
-- Keep immutable, strongly-typed models that callers use across the extension.
-- Transform raw command/API output into models via parsers/transformers.
-- Expose operation-specific helpers (sub-providers) that provider implementations can reuse.
-- Centralize host/integration logic so views/commands don't parse remote URLs directly.
-- Provide caching and request deduplication hooks (optional, but recommended).

## Minimal contract example

- Inputs: repository path/identifier and operation-specific args (e.g., revision range).
- Outputs: typed model(s) or a structured error object.
- Error modes: Not a Git repo, permission/auth failure, command/API error, parsing error.
- Success criteria: returns models that can be directly rendered by views or consumed by commands.

A tiny example TypeScript interface (conceptual):

```ts
export interface DomainProvider {
  getItems(repositoryPath: string, options?: { max?: number }): Promise<DomainItem[]>;
  getRefs(repositoryPath: string): Promise<DomainRef[]>;
  executePlatform?(repositoryPath: string, args: string[]): Promise<string>; // optional helper for Node provider
}

### Recommended minimal contract and error shapes

Provide a small, consistent error shape so callers can react based on error code rather than parsing messages. Example:

```ts
export type DomainError =
  | { code: 'NotARepo'; message: string }
  | { code: 'Auth'; message: string; details?: any }
  | { code: 'Exec'; message: string; details?: string };

export interface DomainResult<T> {
  success: true;
  result: T;
} | {
  success: false;
  error: DomainError;
}
```

Using `DomainResult<T>` as an alternate return type (or throwing the structured `DomainError`) makes it clearer for callers how to handle failures.

### Minimal local provider skeleton (Node)

Place concrete executors in `src/env/node` and keep the provider logic in `src/env/node/localDomainProvider.ts`:

```ts
// src/env/node/localDomainProvider.ts (concept)
import { exec } from './domain'; // small wrapper around child_process.exec
import type { DomainProvider, DomainResult } from '../../domain/domainProvider';

export class LocalDomainProvider implements DomainProvider {
  async getItems(repositoryPath: string, options?: { max?: number }) {
    try {
      const out = await exec(repositoryPath, ['git', 'log', '--pretty=%H|%s', `-n`, String(options?.max ?? 10)]);
      // parse output into DomainItem[] using domain/parsers
      return [] as any;
    } catch (ex: any) {
      // return or throw a structured error
      throw { code: 'Exec', message: ex.message } as any;
    }
  }
  async getRefs(repositoryPath: string) {
    // similar
    return [] as any;
  }
}
```

### Testing parsers & providers

- Unit test parsers as pure functions with sample stdout fixtures. Keep fixtures small and focused.
- For provider tests, mock the platform executor (child_process wrapper) to return controlled stdout and assert your provider transforms it into models.
- Integration tests that touch the real Git binary are useful but slow — prefer them as optional E2E tests.
```

## Typical call flow

1. UI/command asks the `DomainProviderService` for an operation (e.g., `getItems`).
2. `DomainProviderService` selects a `DomainProvider` for the repository or workspace (Local, Hosted API, etc.).
3. The provider delegates to a sub-provider (e.g., `items`) which performs the operation.
4. For local Node providers, the sub-provider may call `src/env/node/domain/domain.ts` to run platform-specific commands.
5. Parsers/transformers convert raw output into models; caches may be consulted.
6. Models are returned to callers for rendering or further processing.

## Sub-providers: organization and examples

Sub-providers group operation-specific logic. Examples:

- `items.ts` — fetch item lists, details, patches (domain-specific operations).
- `refs.ts` — list refs/labels, their upstreams or metadata.
- `diff.ts` / `patch.ts` — generate diffs or patches for domain objects.
- `status.ts` — working set status and item-level states.

Each sub-provider exposes a small focused API consumed by the provider implementations.

## Parsers

Parsers/transformers should be isolated, pure, and well-tested. They transform raw stdout/JSON responses into your typed models and are responsible for resilient parsing (e.g., tolerate missing fields).

## Models

Keep small, focused model types that include computed helpers where useful (for example, `DomainItem.idShort`, `DomainRef.isRemote`). Prefer `type` aliases for unions and explicit return types for public methods.

## Remotes

Centralize host/url parsing so callers can map a remote URL to a host provider (GitHub, GitLab, Bitbucket). Provide utilities to normalize remote URLs and extract owner/repo or other integration metadata.

## Testing & reuse

- Unit test parsers/transformers and sub-providers independently of the environment.
- Mock `DomainProvider` implementations in command/view tests to avoid running platform commands or remote APIs.
- Keep the `src/domain` layer free of side-effects (no direct child_process calls in this folder).

## Example: implementing a simple Local provider

1. Implement the `DomainProvider` interface in `src/env/node/localDomainProvider.ts`.
2. Use a small helper `src/env/node/domain/domain.ts` to execute platform commands or call native helpers and return stdout.
3. Delegate logic to `src/domain/sub-providers/` for items/refs/diff.
4. Parsers/transformers in `src/domain/parsers/` transform the raw stdout into models in `src/domain/models/`.
5. Register the provider with `DomainProviderService` at activation time.

## When to keep logic in `src/git` vs `src/env`

-- `src/domain`: provider-agnostic logic — models, parsers/transformers, sub-providers API, integrations/helpers.
-- `src/env/*`: environment-specific execution — running commands, interacting with web APIs, authentication flows, file system access.

## Small checklist to extract the Git layer for a new extension

- [ ] Create `src/domain` with interfaces, models, sub-providers, parsers/transformers, and integrations.
- [ ] Add `src/env/node` with a minimal platform executor and `localDomainProvider` implementation.
- [ ] Wire a simple `DomainProviderService` to register and select providers.
- [ ] Write unit tests for parsers/transformers and sub-providers.
- [ ] Keep commands/views depending only on `DomainProviderService`.

## Files / Symbols you will likely create

- - `src/domain/domainProvider.ts` — interface & types
- - `src/domain/domainProviderService.ts` — selection & registration
- - `src/domain/models/*` — domain models
- - `src/domain/parsers/*` — parse/transform functions
- - `src/domain/sub-providers/*` — items/refs/diff/status modules
- - `src/env/node/domain/domain.ts` — platform execution utility (child_process wrapper)
- - `src/env/node/localDomainProvider.ts` — local provider implementation

## Notes

Start small: implement only the operations you need (e.g., items + refs). Keep tests for parsing/transformers and provider selection and expand as your extension grows.

---
