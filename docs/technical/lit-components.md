# Lit Components Best Practices - One Page Guide

## When to Use Lit Components

**Use Lit for:**
- ✅ VS Code webview UIs (this repo uses Lit for webviews)
- ✅ Complex interactive interfaces with state management
- ✅ Reusable custom elements across multiple views
- ✅ Performance-critical lists (use with `@lit-labs/virtualizer`)

**Skip Lit for:**
- ❌ Simple HTML templates without interactivity
- ❌ Extension host code (commands, services, providers)
- ❌ Tree view providers (use VS Code's native `TreeDataProvider`)

## Architecture Pattern

```
Extension Host (Node.js/TypeScript)
    ↓ IPC Protocol
Webview Controller (manages lifecycle)
    ↓ postMessage
Lit App Component (root custom element)
    ↓ Lit Context Providers
Child Lit Components (reactive UI)
```

## Essential Lit Packages for Your NuGet Manager

```json
{
  "dependencies": {
    "lit": "^3.3.1",                           // Core framework
    "@lit/context": "^1.1.6",                  // Share state across components
    "@lit/task": "^1.0.3",                     // Async operations (NuGet API calls)
    "@lit-labs/virtualizer": "^2.1.1"          // Large package lists (CRITICAL)
  }
}
```

**Optional (add only if needed):**
- `@lit-labs/signals` + `signal-utils` - Extra reactivity (Lit's built-in may suffice)
- `@lit/react` - Only if mixing React components

## File Organization

```
src/
├── webviews/
│   ├── packageManager.ts                    # Webview controller (host)
│   ├── protocol.ts                          # IPC types
│   └── apps/
│       └── packageManager/
│           ├── packageManager.ts            # Root Lit component
│           ├── packageManager.html          # HTML template
│           ├── packageManager.scss          # Styles
│           └── components/
│               ├── packageSearch.ts         # Search component
│               ├── packageList.ts           # Virtualized list
│               ├── packageDetails.ts        # Detail view
│               └── shared/                  # Reusable components
```

## esbuild Bundling Strategy

### Dual Build Setup (Extension + Webviews)

Your current config builds the **extension host** (Node.js). You need to add a **separate webview build** (browser):

**build.mjs:**
```javascript
import { build } from 'esbuild';

// Build 1: Extension Host (your current config)
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

// Build 2: Webview (Lit components) - NEW
await build({
  entryPoints: ['src/webviews/apps/packageManager/packageManager.ts'],
  bundle: true,
  platform: 'browser',              // Browser context
  format: 'esm',                    // ES modules for webviews
  target: 'es2022',                 // Modern JS (VS Code webviews support it)
  outfile: 'out/webviews/packageManager.js',
  sourcemap: true,
  minify: false,                    // Enable for production
  // Don't externalize anything - webviews need everything bundled
}).catch(() => process.exit(1));
```

**Key Differences:**
- Extension: `platform: 'node'`, `format: 'cjs'`, externalizes `vscode`
- Webview: `platform: 'browser'`, `format: 'esm'`, bundles everything (including Lit)

### Advanced: Multiple Webviews with Code Splitting

```javascript
// Build 2 (Alternative): Multiple webviews with shared chunks
await build({
  entryPoints: {
    'packageManager': 'src/webviews/apps/packageManager/packageManager.ts',
    'packageDetails': 'src/webviews/apps/packageDetails/packageDetails.ts',
  },
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  outdir: 'out/webviews',
  sourcemap: true,
  splitting: true,                  // Share Lit + common code across webviews
  chunkNames: 'chunks/[name]-[hash]',
  minify: false,
}).catch(() => process.exit(1));
```

**What esbuild does:**
1. Bundles Lit + your components into single JS file
2. Tree-shakes unused Lit features
3. Inlines HTML templates (if using `loader: { '.html': 'text' }`)
4. Processes CSS/SCSS into JS imports
5. Creates source maps for debugging
6. Minifies for production

## esbuild Considerations (gotchas)

The project uses a feature-rich bundler for webviews, but you can use **esbuild** for simpler projects. Here are the gotchas to watch for when moving to esbuild:

### 1. SCSS/CSS Processing

**Alternative bundler behavior:**
- Many full-featured build setups use `sass-loader` + `css-loader` + CSS extract plugins.
- They can extract CSS to separate `.css` files and provide richer source maps and HMR.

**esbuild approach:**
- Needs external plugin: `esbuild-sass-plugin`
- OR just use plain CSS (Lit's `css` template literal)
- Simpler but less powerful

```javascript
// Option 1: Use esbuild-sass-plugin
import { sassPlugin } from 'esbuild-sass-plugin';

await build({
  // ...
  plugins: [sassPlugin()],
});

// Option 2: Use Lit's css`` template (RECOMMENDED for simplicity)
import { css } from 'lit';

static styles = css`
  :host { display: block; }
`;
```

### 2. HTML Template Loading

**Alternative bundler behavior:**
```typescript
// Can import HTML files directly
import template from './template.html';
```

**esbuild:**
```javascript
// Need to configure loader
loader: { '.html': 'text' }

// Or just use Lit's html`` template (RECOMMENDED)
import { html } from 'lit';

render() {
  return html`<div>Hello</div>`;
}
```

### 3. TypeScript Type Checking

**Alternative bundler behavior:**
- Many large build setups run type-checking in parallel using type-checker plugins (e.g. `fork-ts-checker`).
- Others pair fast transpilation (e.g. `esbuild-loader`) with a separate type-check step.

**esbuild:**
- **Does NOT type check** - only transpiles
- Must run `tsc --noEmit` separately for type checking

```json
{
  "scripts": {
    "build": "tsc --noEmit && node build.mjs",
    "watch": "tsc --noEmit --watch & node build.mjs --watch"
  }
}
```

### 4. Decorators

Both support TypeScript decorators, but ensure your `tsconfig.json` has:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "useDefineForClassFields": false  // Important for Lit decorators!
  }
}
```

### 5. Watch Mode & Dev Workflow

**Alternative bundler behavior:**
- Built-in watch mode with incremental rebuilds
- Some bundlers provide HMR (Hot Module Replacement) for faster iteration

**esbuild:**
- Fast initial builds, but watch mode is more basic
- No built-in HMR - need to manually refresh webview

```javascript
// esbuild watch mode
import * as esbuild from 'esbuild';

const ctx = await esbuild.context({
  entryPoints: ['src/webviews/apps/packageManager/packageManager.ts'],
  bundle: true,
  outfile: 'out/webviews/packageManager.js',
  // ... other options
});

await ctx.watch();
console.log('Watching for changes...');
```

### 6. VS Code Webview CSP (Content Security Policy)

**Alternative bundler behavior:**
- Some build setups inject CSP meta tags or support template injection to manage resources
- Others provide helper plugins for dynamic resource loading

**esbuild:**
- Must manually handle CSP in webview HTML
- Ensure all resources use `webview.asWebviewUri()`

```typescript
// In your webview controller
const scriptUri = webview.asWebviewUri(
  vscode.Uri.joinPath(context.extensionUri, 'out', 'webviews', 'packageManager.js')
);

const html = `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 script-src ${webview.cspSource};
                 style-src ${webview.cspSource} 'unsafe-inline';">
</head>
<body>
  <package-manager-app></package-manager-app>
  <script type="module" src="${scriptUri}"></script>
</body>
</html>`;
```

### 7. Node.js Polyfills

**Alternative bundler behavior:**
- Some bundlers automatically polyfill Node.js modules for browser targets.
- Many projects use `path-browserify`, `os-browserify` as shims.

**esbuild:**
- No automatic polyfills
- Must manually install and configure shims if needed
- Lit components usually don't need Node.js APIs

```javascript
// Only needed if you use Node.js APIs in webviews
import { resolve } from 'path-browserify';
```

## Recommendation for NuGet Manager

**Use esbuild if:**
- ✅ Your webviews are relatively simple
- ✅ You use Lit's `css`` and `html`` template literals (no separate .scss/.html files)
- ✅ You're okay running `tsc --noEmit` separately for type checking
- ✅ You prefer faster builds and simpler configuration

**Use a full-featured bundler if:**
- ❌ You need advanced CSS processing (SCSS modules, CSS extraction)
- ❌ You want integrated type checking during builds
- ❌ You need HMR for faster development
- ❌ You have complex build requirements like large, multi-target projects

**For your NuGet manager, esbuild is likely sufficient** - Lit's built-in `css`` and `html`` templates work great without external loaders.

## Lit Component Patterns

### 1. Root Webview Component

```typescript
import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

@customElement('package-manager-app')
export class PackageManagerApp extends LitElement {
  @state()
  private packages: Package[] = [];

  static styles = css`
    :host {
      display: block;
      color: var(--vscode-foreground);
    }
  `;

  render() {
    return html`
      <package-search @search=${this.onSearch}></package-search>
      <package-list .packages=${this.packages}></package-list>
    `;
  }

  private onSearch(e: CustomEvent): void {
    // Handle search
  }
}
```

### 2. Context Provider (Share State)

```typescript
import { createContext } from '@lit/context';
import type { NuGetConfig } from './types';

export const configContext = createContext<NuGetConfig>('nuget-config');

// In root component:
import { provide } from '@lit/context';

@customElement('package-manager-app')
export class PackageManagerApp extends LitElement {
  @provide({ context: configContext })
  config: NuGetConfig = { feeds: [...] };
}

// In child component:
import { consume } from '@lit/context';

@customElement('package-search')
export class PackageSearch extends LitElement {
  @consume({ context: configContext })
  config!: NuGetConfig;
}
```

### 3. Async Operations with @lit/task

```typescript
import { Task } from '@lit/task';

@customElement('package-details')
export class PackageDetails extends LitElement {
  @property()
  packageId: string = '';

  private fetchTask = new Task(this, {
    task: async ([packageId]) => {
      const response = await fetch(`/api/packages/${packageId}`);
      return response.json();
    },
    args: () => [this.packageId],
  });

  render() {
    return this.fetchTask.render({
      pending: () => html`<loading-spinner></loading-spinner>`,
      complete: (data) => html`<package-info .data=${data}></package-info>`,
      error: (e) => html`<error-message .error=${e}></error-message>`,
    });
  }
}
```

### 4. Virtualized Lists (CRITICAL for NuGet)

```typescript
import { LitVirtualizer } from '@lit-labs/virtualizer';
import '@lit-labs/virtualizer';

@customElement('package-list')
export class PackageList extends LitElement {
  @property()
  packages: Package[] = [];

  render() {
    return html`
      <lit-virtualizer
        .items=${this.packages}
        .renderItem=${(pkg: Package) => html`
          <package-item .package=${pkg}></package-item>
        `}
        scroller
      ></lit-virtualizer>
    `;
  }
}
```

## IPC Communication Pattern

### Extension Host (Controller)

```typescript
import type { WebviewShowingArgs } from './protocol';

export class PackageManagerWebview {
  async show(): Promise<void> {
    await this.panel.webview.postMessage({
      method: 'packages/list',
      data: { packages: [...] }
    });
  }
}
```

### Webview (Lit Component)

```typescript
// In root component
connectedCallback() {
  super.connectedCallback();
  window.addEventListener('message', this.onMessage);
}

private onMessage = (e: MessageEvent) => {
  const msg = e.data;
  if (msg.method === 'packages/list') {
    this.packages = msg.data.packages;
  }
};
```

## VS Code Theming Integration

```typescript
static styles = css`
  :host {
    --background: var(--vscode-editor-background);
    --foreground: var(--vscode-editor-foreground);
    --button-bg: var(--vscode-button-background);
    --button-fg: var(--vscode-button-foreground);
  }
`;
```

## Performance Tips

1. **Use `@lit-labs/virtualizer`** - Mandatory for 1000+ items
2. **Memoize expensive computations** - Use `@state` sparingly
3. **Debounce search inputs** - Avoid excessive API calls
4. **Lazy load details** - Use `@lit/task` for on-demand fetching
5. **Split bundles** - Use esbuild's `splitting: true` for multiple webviews

## Key Differences from Complex Build Setups

**Your NuGet Manager will be simpler:**
- Fewer webviews (1-2 vs larger projects' multiple webviews)
- Less complex state (no Git history visualization)
- Standard CRUD operations vs complex Git workflows

**But you still need:**
- `@lit/task` - For NuGet API calls
- `@lit-labs/virtualizer` - Package lists can be huge
- `@lit/context` - Share project/feed configuration
