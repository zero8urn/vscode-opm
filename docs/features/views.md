# Views — Tree Views & Provider Patterns

This document explains how to implement Tree Views and related view patterns in a VS Code extension. It covers `TreeDataProvider` implementation, node models, refresh/reveal strategies, view registration, and performance considerations.

## Purpose

Views (tree views) provide hierarchical, navigable UI in the VS Code sidebar and are ideal for representing repository structures, branches, commits, or other nested data.

## Where to place view code

- `src/views/` — implement one view per file or small group files for complex views. Each view should expose a `View` class that implements `TreeDataProvider<T>` and handles registration and disposal.
- `src/views/nodes/` or inline model files — define node types and shared helper utilities.

## Core concepts

- `TreeDataProvider<T>` — the interface implementing `getChildren`, `getTreeItem`, and optionally `getParent`.
- Nodes — small typed objects representing a row in the tree. Prefer POJOs with computed helpers rather than classes with heavy state.
- `EventEmitter` — use `onDidChangeTreeData` to trigger refreshes.

## Minimal provider example

```ts
class MyViewProvider implements TreeDataProvider<MyNode> {
  private _onDidChangeTreeData = new EventEmitter<MyNode | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private container: Container) {}

  getTreeItem(node: MyNode): TreeItem {
    return new TreeItem(node.label, node.collapsible ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None);
  }

  async getChildren(node?: MyNode) {
    if (!node) return this.container.domainProviderService.getRootNodes();
    return this.container.domainProviderService.getChildren(node.id);
  }

  refresh(node?: MyNode) {
    this._onDidChangeTreeData.fire(node);
  }
}

### Full minimal TreeDataProvider (copy/paste)

This single-file example can be used as a starting point for a simple tree that shows a list of items.

```ts
import { EventEmitter, TreeDataProvider, TreeItem, TreeItemCollapsibleState, window } from 'vscode';

type SimpleNode = { id: string; label: string; collapsible?: boolean };

export class SimpleViewProvider implements TreeDataProvider<SimpleNode> {
  private _onDidChangeTreeData = new EventEmitter<SimpleNode | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private items: SimpleNode[] = [
    { id: '1', label: 'One' },
    { id: '2', label: 'Two' },
  ];

  getTreeItem(node: SimpleNode): TreeItem {
    const item = new TreeItem(node.label, node.collapsible ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None);
    item.id = node.id;
    item.command = { command: 'myext.openItem', title: 'Open Item', arguments: [node.id] };
    item.contextValue = 'myext.item';
    return item;
  }

  async getChildren(node?: SimpleNode) {
    if (!node) return this.items;
    return [];
  }

  getParent?(node: SimpleNode) {
    // Optional: implement if you want `reveal` to work reliably
    return undefined;
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }
}

// register in extension activation:
// window.registerTreeDataProvider('myext.simpleView', new SimpleViewProvider());
```

### `package.json` view contribution snippet

Add a view entry so VS Code shows your tree in the Activity Bar or Explorer:

```json
"contributes": {
  "views": {
    "explorer": [
      {
        "id": "myext.simpleView",
        "name": "My Simple View"
      }
    ]
  }
}
```

### Reveal & `getParent` note

`TreeView.reveal(node)` requires stable `id`s and will work best when `getParent` is implemented for nodes. If you don't implement `getParent`, VS Code will attempt a best-effort reveal but it can fail for nested nodes.

### Small debounce pattern for frequent refreshes

When underlying data updates frequently, debounce refreshes to avoid UI thrashing. A lightweight pattern:

```ts
let refreshTimeout: NodeJS.Timeout | undefined;
function scheduleRefresh(provider: { refresh(): void }, delay = 150) {
  if (refreshTimeout) clearTimeout(refreshTimeout);
  refreshTimeout = setTimeout(() => provider.refresh(), delay);
}
```

```

## Registration & contributions

- Register view in `package.json` contributions under `views`.
- Register the provider in `extension.ts` activation and add disposables to the container.

```ts
container.subscriptions.push(
  window.registerTreeDataProvider('myext.myView', new MyViewProvider(container))
);
```

## Reveal, selection, and commands

- Use `reveal` to reveal and select nodes programmatically (e.g., when opening a file related to a tree node).
- Ensure nodes have stable `id` values for reveal and caching to work reliably.
- Bind item-specific commands in `getTreeItem` via `TreeItem.command`.

## Performance & batching

- Avoid large synchronous work in `getChildren` — prefer async calls and caching.
- Batch expensive operations; use debouncing for frequent refresh triggers.
- For very large trees, implement paging or lazy-loading nodes.

## Node types & model design

- Use a small union of node types (e.g., `RootNode | FolderNode | ItemNode`) and discriminated unions for type narrowing.
- Include `id`, `label`, and `collapsible` flags in node shapes.

## Context values & menus

- Use `contextValue` on `TreeItem` to enable context menu items in `contributes.menus`.
- Keep context values stable and descriptive (e.g., `myext.item.commit`, `myext.item.branch`).

## Refresh strategies

- Fine-grained refresh: fire `onDidChangeTreeData` with the specific node that changed.
- Full refresh: pass `undefined` to `fire()` to refresh the entire tree (use sparingly).

## Testing views

- Unit test `getChildren` and `getTreeItem` with a mocked `Container` and `DomainProviderService`.
- For integration tests, use `@vscode/test-cli` to run the extension and verify the view appears and responds.

## Example: TreeItem with a command

```ts
const treeItem = new TreeItem('Open file');
treeItem.command = { command: 'myext.openFile', title: 'Open', arguments: [filePath] };
```

## Best practices & anti-patterns

- Keep `getTreeItem` synchronous and side-effect free.
- Avoid storing ephemeral UI state in node models; keep UI state in view instance where necessary.
- Use `Disposable` patterns for event listeners and long-lived resources.

---

Created to provide a concise, practical reference for building performant Tree Views and related UI in a VS Code extension.
