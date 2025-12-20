import { build } from 'esbuild';

// Build 1: Extension Host (Node.js context)
await build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: ['node22'],
  external: ['vscode', 'node:*'],
  outfile: 'out/extension.js',
  sourcemap: true,
}).catch(() => process.exit(1));

// Build 2: Webview (Browser context)
await build({
  entryPoints: ['src/webviews/apps/package-browser/packageBrowserApp.ts'],
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: ['es2022'],
  outfile: 'out/webviews/packageBrowserApp.js',
  sourcemap: true,
  minify: false, // Keep readable for development
}).catch(() => process.exit(1));

// Build 3: E2E Test Entry (Node.js context for Extension Host)
// Build index.ts and individual test files separately so Mocha can load them
await build({
  entryPoints: [
    'test/e2e/index.ts',
    'test/e2e/extension.e2e.ts',
    'test/e2e/packageBrowser.e2e.ts',
    'test/e2e/testHelpers.ts',
  ],
  bundle: false, // Don't bundle - keep files separate for Mocha to load
  platform: 'node',
  format: 'cjs',
  target: ['node22'],
  outdir: 'out/test/e2e',
  sourcemap: true,
}).catch(() => process.exit(1));
