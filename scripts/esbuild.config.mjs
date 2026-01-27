import { build } from 'esbuild';

// Build 1: Extension Host (Node.js context)
await build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: ['node22'],
  external: ['vscode'],
  outfile: 'out/extension.js',
  sourcemap: true,
  // Node.js built-ins are automatically externalized by esbuild when platform: 'node'
  // This includes: https, http, fs, path, url, etc.
}).catch(() => process.exit(1));

// Build 2: Webview (Browser context)
await build({
  entryPoints: ['src/webviews/apps/packageBrowser/packageBrowser.ts'],
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: ['es2022'],
  outfile: 'out/webviews/packageBrowser.js',
  sourcemap: true,
  minify: false, // Keep readable for development
}).catch(() => process.exit(1));

// Build 3: E2E Test Entry (Node.js context for Extension Host)
// Automatically discover all .ts files in test/e2e/ so Mocha can load them
import { readdirSync } from 'fs';
import { join } from 'path';

const e2eDir = 'test/e2e';
const e2eFiles = readdirSync(e2eDir)
  .filter(file => file.endsWith('.ts'))
  .map(file => join(e2eDir, file));

await build({
  entryPoints: e2eFiles,
  bundle: false, // Don't bundle - keep files separate for Mocha to load
  platform: 'node',
  format: 'cjs',
  target: ['node22'],
  outdir: 'out/test/e2e',
  sourcemap: true,
}).catch(() => process.exit(1));
