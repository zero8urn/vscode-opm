Plan: Try Bun for Dev & Build

TL;DR: Add Bun to the dev container and use it for fast installs and running build/watch scripts while keeping Node/Electron for integration tests and publishing. Keep the TypeScript `tsc` compile output Node-compatible (CommonJS). Start incrementally: install Bun, switch `install`/`build`/`watch` scripts to `bun`/`bunx`, and document remaining Node-only steps.

Steps
1. Update `docs/features/try-bun-plan.md` with this plan (this file).
2. Edit `package.json`: replace `install` with `bun install`, use `bunx` for `build`/`watch` scripts, and explicitly keep integration/publish scripts Node-based.
3. Edit `.devcontainer/devcontainer.json`: add `postCreateCommand` to install Bun and run `bun install`.
4. Add minimal docs to `README.md` describing the Bun workflow and Node-only commands (integration tests, publishing).
5. Add an `esbuild` script/config and make bundling part of the build pipeline. Use `esbuild` to produce a Node-targeted, CommonJS bundle that externalizes `vscode` and Node builtins. Run `esbuild` via Bun (`bunx esbuild`) so Bun handles CLI tooling and installs.

Example `esbuild` CLI (run with Bun):

```bash
bunx esbuild src/extension.ts \
  --bundle \
  --platform=node \
  --format=cjs \
  --target=node16 \
  --external:vscode \
  --external:node:* \
  --outfile=dist/extension.js
```

Example `esbuild` watch command:

```bash
bunx esbuild src/extension.ts --bundle --platform=node --format=cjs --target=node16 --external:vscode --external:node:* --outfile=dist/extension.js --watch
```

Recommended small `esbuild` config file (`scripts/esbuild.config.mjs`) if you prefer a JS config (example):

```js
import { build } from 'esbuild';

build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: ['node16'],
  external: ['vscode', 'node:*'],
  outfile: 'dist/extension.js',
  sourcemap: true
}).catch(() => process.exit(1));
```

Notes: keep a separate `typecheck` script using `tsc --noEmit` so you still get full TypeScript checking even if `esbuild` performs the fast transpile/bundle step.

Further Considerations
1. Tests: Run unit tests and integration tests with Node/Electron for reliability. Option: evaluate `vitest` under Bun later (compatibility check).
2. Publishing: Use Node-based publishing tooling (`vsce`) in CI or run via Node locally to avoid runtime mismatches.
3. Devcontainer PATH: Ensure Bun's `$HOME/.bun/bin` is added to the shell profile so new terminals see `bun` without re-exporting.

Recommended `postCreateCommand` for devcontainer

```bash
curl -fsSL https://bun.sh/install | bash && export PATH="$HOME/.bun/bin:$PATH" && bun --version && bun install
```

Minimal `package.json` scripts (suggested)

```json
{
  "scripts": {
    "install": "bun install",
    "typecheck": "bunx tsc -p . --noEmit",
    "build": "bunx esbuild src/extension.ts --bundle --platform=node --format=cjs --target=node16 --external:vscode --external:node:* --outfile=dist/extension.js",
    "watch": "bunx esbuild src/extension.ts --bundle --platform=node --format=cjs --target=node16 --external:vscode --external:node:* --outfile=dist/extension.js --watch",
    "dev": "bunx esbuild src/extension.ts --bundle --platform=node --format=cjs --target=node16 --external:vscode --external:node:* --outfile=dist/extension.js --watch",
    "test:unit": "node ./node_modules/.bin/vitest run",
    "test:integration": "node ./out/test/runTest.js",
    "vscode:prepublish": "node -r source-map-support/register ./out/extension.js"
  }
}
```

Notes
- Keep Node available in the devcontainer: the VS Code extension host and `@vscode/test-electron` require the Node/Electron runtime. Installing Bun in the container preserves Node while providing Bun for dev tooling.
- Since the current build uses `tsc` to emit CommonJS output, the path of least resistance is to run `tsc` via Bun (`bunx tsc`) and keep the produced artifacts node-compatible.
- If you later introduce bundling (esbuild/rollup/tsup), explicitly externalize `vscode` to avoid bundling it into the distributed artifact.
- Add `bun.lockb` to the repository if you want to lock installs, or add it to `.gitignore` if you prefer not to commit it; decide per your team's policy.

Next steps I can take for you
- Apply the `package.json` script edits and `.devcontainer/devcontainer.json` change.
- Add a small `esbuild` script to produce a Node-targeted bundle that externalizes `vscode`.
- Add a short README section showing the Bun-based workflow and commands.

Would you like me to apply these edits now? (I can commit them or leave them as working changes.)