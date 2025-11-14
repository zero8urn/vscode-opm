import { build } from 'esbuild';

build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: ['node16'],
  external: ['vscode', 'node:*'],
  outfile: 'dist/extension.js',
  sourcemap: true,
}).catch(() => process.exit(1));
