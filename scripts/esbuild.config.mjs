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
