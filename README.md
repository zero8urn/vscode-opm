# OPM: Octothorpe Package Manager VS Code Extension

This repository contains a VS Code extension for streamlined .NET dependency management. The instructions below explain how to set up a development environment using the included Dev Container configuration or locally if you prefer.

Prerequisites:
- Docker (or Podman) — required for the recommended Dev Container workflow
- Visual Studio Code (latest stable)
- VS Code extension: Remote - Containers (or "Dev Containers") if using the dev container
- Node.js LTS (24+) and Bun (recommended); Bun is installed in the Dev Container image

Quick start (recommended: Dev Container)

1. Open the project in VS Code.
2. Reopen the project in the Dev Container: use the Command Palette (F1) → "Dev Containers: Reopen in Container".
3. When the container opens, open the integrated terminal and run:

```bash
# Install dependencies (inside container)
bun install

# Build the extension (uses esbuild via scripts/esbuild.config.mjs)
bun run build
```

4. Press F5 to launch the Extension Development Host and test the extension.

Alternative: Docker Compose (manual container boot)

If you prefer not to use the VS Code Dev Container integration, you can start the container manually with Docker Compose and run commands inside it:

```bash
# From the repository root
docker compose -f .devcontainer/docker-compose.yml build
docker compose -f .devcontainer/docker-compose.yml up -d

# Open a shell in the running container
docker exec -it opm-container bash

# Inside the container
bun install
bun run build
```

Alternative: Local (host machine) development

If you want to work locally without containers, install Bun (or Node) and run:

```bash
# On macOS / Linux / WSL:
curl -fsSL https://bun.sh/install | bash

# From the repository root
bun install
bun run build
```

Tasks, test, and packaging
- Build: `bun run build`
- Lint: `bun run lint` (and `bun run lint:fix` to auto-fix)
- Test: `bun test` (uses Bun's test runner for unit tests in this repo)
- Package: `bun run package` — runs build and packages the extension with `vsce`
- Run Build (VS Code Task): use the workspace task labeled **Run Build** in `Terminal → Run Task...` or press Ctrl+Shift+B and select the build task.

Development tips & troubleshooting
- If the container doesn't have `node_modules` or dependencies installed, run `bun install` inside the container.
- If `bun` isn't available locally, run the Bun installer or use Node/npm as a fallback with `npm install` and `npm run build`, although `bun` is the primary runner here and some scripts depend on it.
- If you run into permission or file sharing issues on Windows, ensure Docker Desktop is configured to use WSL2 and that file sharing is enabled for your workspace location.

Contributing
- Please follow branch naming conventions and run `bun run lint` and `bun run build` before opening PRs.
- For packaging and publishing, use `bun run package` (this bundles and produces a VSIX using `vsce`).

If you need any help setting up, open an issue or start a PR — and thanks for contributing! 

💡 Tip: the Dev Container image installs Bun for you, but `RUN bun install` is commented in `.devcontainer/Dockerfile` by default to avoid slowing image builds. If you want the image to include dependencies preinstalled (for CI or faster container startup), uncomment that line in `.devcontainer/Dockerfile`.