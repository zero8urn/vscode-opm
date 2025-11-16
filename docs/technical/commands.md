# Commands — Patterns & Implementation

This document explains recommended patterns for implementing commands in a VS Code extension, based on the GitLens architecture. It covers contribution points, registration, small-command design, composition with the `Container` service locator, testing, telemetry, and best practices.

## Purpose

Commands are the primary way users interact with an extension via the Command Palette, menus, keybindings, or UI elements. Keep commands small, composable, and side-effect limited. Use them as thin orchestrators that validate inputs, delegate to services, and surface results or errors to the user.

## Where to place commands

- `src/commands/` — implement one command per file where practical. Each file should export a small class or function that encapsulates the command logic and a static `id` or `command` field matching the `contributes` command id.
- `src/commands.ts` or `src/commands/index.ts` — central registration helper called from `extension.ts` to register commands with VS Code using `commands.registerCommand`.

## Contributions (package.json / contributions.json)

- Define command IDs and titles in `contributions.json` (or `package.json` for tiny extensions). Keep IDs stable and names user-friendly.
- Use categories to group commands in the Command Palette (e.g., `GitLens`, `MyExtension`).
- Example contribution:

```json
{
  "command": "myext.openSomething",
  "title": "My Extension: Open Something",
  "category": "My Extension"
}
```

## Command structure and contract

A minimal command should:

- Validate inputs and early-return with helpful messages.
- Run quickly, or show progress via `window.withProgress` for long-running tasks.
- Delegate real work to services exposed by `Container` (e.g., `container.domainProviderService`, `container.telemetry`).
- Return a Promise that resolves when the command is complete.

Example TypeScript command class (conceptual):

```ts
export class OpenItemCommand {
  static id = 'myext.openItem';
  constructor(private container: Container) {}

  async execute(itemId: string) {
    if (!itemId) throw new Error('missing id');
    const item = await this.container.domainProviderService.getItem(itemId);
    // show or open item
  }
}
```

## Registration pattern

In `extension.ts` activation:

```ts
container.subscriptions.push(
  commands.registerCommand(OpenItemCommand.id, (arg) => new OpenItemCommand(container).execute(arg))
);
```

Or use a small helper that auto-registers classes with an `id` and `execute` method.

## Arguments & invocation sources

Commands can be invoked from:

- Command palette (no args)
- Context menus / tree items (VS Code passes the tree node as the arg)
- Keybindings (can pass args in `package.json`)
- Programmatic invocation (`commands.executeCommand`)

Design your command API to accept either a fully formed model (node) or a lightweight identifier, and handle both.

## Long-running tasks & progress

- Use `window.withProgress` and report progress for longer operations.
- For cancellable operations, integrate VS Code's `CancellationToken` pattern.
- Avoid blocking the activation path with heavy tasks — run them lazily.

## UI & user feedback

- Use `window.showInformationMessage` / `showErrorMessage` sparingly and with clear actions.
- For complex flows, use QuickPick or an input modal to collect user input.

## Telemetry & logging

- Log command usage and relevant metadata via a central telemetry service.
- Avoid logging sensitive data.
- Use consistent event names in `constants.telemetry.ts`.

## Testing commands

- Keep command logic small so it can be unit tested by instantiating the command class with a mocked `Container`.
- For integration tests, use `@vscode/test-cli` to run a real extension host and assert behavior.

## Best practices & anti-patterns

- Don't put heavy business logic directly inside commands; delegate.
- Avoid global mutable state across commands unless carefully synchronized.
- Prefer explicit argument shapes to `any`.
- Use feature flags or `when` contexts to hide commands unless they apply.

## Example: simple command with QuickPick

1. show QuickPick to select an item via `domainProviderService`.
2. execute the open command for the selected item.

## Quickstart: minimal command example

The following example is a minimal, copy‑pasteable command implementation and shows how to register it from `extension.ts`.

Minimal command file (`src/commands/helloCommand.ts`):

```ts
export class HelloCommand {
  static id = 'myext.hello';
  constructor(private container: any) {}

  async execute(name?: string) {
    const who = name ?? 'world';
    // Delegate to container services instead of doing heavy work here
    // For demo purposes we just return a string
    return `Hello, ${who}!`;
  }
}
```

Registering the command in `src/extension.ts`:

```ts
import { commands, ExtensionContext } from 'vscode';
import { HelloCommand } from './commands/helloCommand';
import { Container } from './container';

export function activate(ctx: ExtensionContext) {
  const container = new Container(ctx);
  ctx.subscriptions.push(
    commands.registerCommand(HelloCommand.id, (arg) => new HelloCommand(container).execute(arg))
  );
}
```

Quick test: open the Command Palette (Ctrl+Shift+P) and run the contributed `myext.hello` command (you must add the command to `package.json` `contributes.commands` or `contributions.json`).

## Testing commands

- Unit test: instantiate the command class with a mocked `Container` and assert the returned value. Keep command logic thin so unit tests can focus on orchestration.
- Integration test: use `@vscode/test-cli` to run the extension in an Extension Development Host and invoke the command with `vscode.commands.executeCommand`.

## Common pitfalls

- Mismatched command IDs: make sure the `command` ID declared in `package.json` (or `contributions.json`) exactly matches the `static id` in your command class.
- Long-running work in command constructor: avoid doing async or expensive work in constructors. Use `execute` and `window.withProgress` if needed.
- Passing unknown arg shapes from UI: validate inputs in `execute` (accept model or id) and show helpful errors when missing.

---

Created to provide clear guidance and a small set of conventions for commands in a VS Code extension.
