# Development Guide

This guide covers setting up the development environment, building, testing, and packaging the OPM VS Code extension.

## Prerequisites

- **Docker** (or Podman) — required for the recommended Dev Container workflow
- **Visual Studio Code** (latest stable)
- **VS Code extension**: Remote - Containers (or "Dev Containers") if using the dev container
- **Node.js LTS (24+)** and **Bun** (recommended); Bun is pre-installed in the Dev Container image

## Quick Start (Recommended: Dev Container)

1. Open the project in VS Code.
2. Reopen in Dev Container: use the Command Palette (F1) → **"Dev Containers: Reopen in Container"**.
3. When the container opens, run in the integrated terminal:

```bash
# Install dependencies (inside container)
bun install

# Build the extension (uses esbuild via scripts/esbuild.config.mjs)
bun run build
```

4. Press **F5** to launch the Extension Development Host and test the extension.

## Alternative: Docker Compose (Manual Container)

If you prefer not to use VS Code Dev Container integration:

```bash
# From repository root
docker compose -f .devcontainer/docker-compose.yml build
docker compose -f .devcontainer/docker-compose.yml up -d

# Open shell in running container
docker compose -f .devcontainer/docker-compose.yml exec opm-container bash

# Inside container
bun install
bun run build
```

## Alternative: Local Development (Host Machine)

Install Bun locally:

```bash
# macOS / Linux / WSL
curl -fsSL https://bun.sh/install | bash

# From repository root
bun install
bun run build
```

## Build & Package Scripts

- **Build**: `bun run build` — bundles extension + webviews with esbuild
- **Type-check**: `bun run typecheck` — validates TypeScript without emitting
- **Lint**: `bun run lint` — runs ESLint (`bun run lint:fix` to auto-fix)
- **Test**: 
  - `bun test` — all tests
  - `bun test src/` — unit tests only
  - `bun test test/integration/` — integration tests only
  - `bun run test:e2e` — E2E tests in Extension Host (Mocha)
- **Package**: `bun run package` — full pipeline: typecheck + lint + build + VSIX
- **VSIX only**: `bun run vsce-package` — creates VSIX from current build

## VS Code Tasks

Use **Terminal → Run Task...** or press **Ctrl+Shift+B**:

- **Run Build** — bundles extension and webviews
- **Prepare Fixtures** — copies test solutions to workspace root

## Testing Strategy

### Unit Tests (Bun)
- **Location**: `src/**/__tests__/*.test.ts` (co-located with source)
- **Runner**: Bun test (`describe`, `test`, `expect`)
- **Purpose**: Fast, isolated tests with mocked dependencies

### Integration Tests (Bun)
- **Location**: `test/integration/*.integration.test.ts`
- **Runner**: Bun test
- **Purpose**: Real API calls to NuGet.org, network validation

### E2E Tests (Mocha)
- **Location**: `test/e2e/*.e2e.ts`
- **Runner**: Mocha in VS Code Extension Host
- **Purpose**: Test VS Code integration (commands, webviews, tree views)
- **Note**: Use `suite()` and `test()` (NOT `describe()`/`it()`)

## Development Tips

### Container Issues
- If `node_modules` missing: run `bun install` inside container
- If `bun` not available locally: install via `curl -fsSL https://bun.sh/install | bash`
- Fallback to Node/npm: use `npm install` and `npm run build` (but Bun is primary)

### Windows Docker Issues
- Ensure Docker Desktop uses **WSL2**
- Enable file sharing for workspace location
- Consider using Dev Container for best experience

### Pre-installed Dependencies in Container
By default, `.devcontainer/Dockerfile` has `RUN bun install` commented to speed up image builds. 

To preinstall dependencies (useful for CI or faster startup):
1. Uncomment the line in `.devcontainer/Dockerfile`
2. Rebuild the container

## Contributing

1. **Branch naming**: Use descriptive names (`fix/search-timeout`, `feat/install-ui`)
2. **Pre-commit**: Run `bun run lint:fix` and `bun run typecheck`
3. **Testing**: Add/update tests for new features or bug fixes
4. **Pull Requests**: Ensure CI passes (lint, typecheck, build, tests)

## Publishing

1. Bump version in `package.json` (required for each publish)
2. Run `bun run package` to create VSIX
3. Test VSIX locally: Extensions → Install from VSIX
4. Publish via GitHub Actions workflow or manually:
   ```bash
   npx @vscode/vsce publish --pat YOUR_PAT
   ```

## Architecture Overview

- **`src/extension.ts`**: Extension activation & command registration
- **`src/commands/`**: Command implementations (`opm.*` namespace)
- **`src/domain/`**: Domain models, contracts, parsers (DomainResult pattern)
- **`src/env/node/`**: Node.js implementations (NuGet client, config parser)
- **`src/services/`**: Long-lived services (logger, discovery, CLI)
- **`src/webviews/`**: Webview infrastructure (CSP, sanitization, IPC)
- **`src/webviews/apps/`**: Lit-based webview applications
- **`scripts/esbuild.config.mjs`**: Build configuration

For detailed architecture and coding guidelines, see:
- `.github/copilot-instructions.md` — comprehensive patterns and conventions
- `AGENTS.md` — quick reference for AI assistants
- `docs/technical/` — technical design documentation

---

**Questions or Issues?** Open an issue or start a discussion on GitHub. Thanks for contributing! 🚀
