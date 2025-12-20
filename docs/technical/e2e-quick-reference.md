# E2E Testing Quick Reference

Quick patterns and examples for writing E2E tests in this VS Code extension.

## Test Template

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Feature Name E2E Tests', () => {
  test('should do something', async function() {
    this.timeout(5000); // Always set timeout for E2E tests
    
    // Your test code here
    await vscode.commands.executeCommand('opm.someCommand');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    assert.ok(true, 'Test passed');
  });
});
```

## Common Patterns

### Check Command Registration
```typescript
test('should register command', async () => {
  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes('opm.openPackageBrowser'));
});
```

### Execute Command
```typescript
test('should execute without errors', async function() {
  this.timeout(5000);
  await vscode.commands.executeCommand('opm.openPackageBrowser');
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.ok(true);
});
```

### Test Multiple Invocations
```typescript
test('should handle multiple calls', async function() {
  this.timeout(10000);
  
  await vscode.commands.executeCommand('opm.openPackageBrowser');
  await new Promise(resolve => setTimeout(resolve, 300));
  
  await vscode.commands.executeCommand('opm.openPackageBrowser');
  await new Promise(resolve => setTimeout(resolve, 300));
  
  assert.ok(true);
});
```

### Test Race Conditions
```typescript
test('should handle concurrent calls', async function() {
  this.timeout(10000);
  
  const promises = [
    vscode.commands.executeCommand('opm.openPackageBrowser'),
    vscode.commands.executeCommand('opm.openPackageBrowser'),
    vscode.commands.executeCommand('opm.openPackageBrowser'),
  ];
  
  await Promise.all(promises);
  assert.ok(true);
});
```

### Test Extension Activation
```typescript
test('extension should activate', async () => {
  const ext = vscode.extensions.getExtension('zero8urn.octothorpe-package-manager');
  assert.ok(ext, 'Extension should be available');
  
  await ext.activate();
  assert.ok(ext.isActive, 'Extension should be active');
});
```

### Test Configuration
```typescript
test('should read configuration', async () => {
  const config = vscode.workspace.getConfiguration('nugetPackageManager');
  const debugMode = config.get<boolean>('logging.debug');
  
  assert.strictEqual(typeof debugMode, 'boolean');
});
```

## Timeouts

| Operation | Timeout |
|-----------|---------|
| Simple command | 5000ms |
| Webview operations | 5000-7000ms |
| Multiple invocations | 10000ms |
| Complex workflows | 15000ms |
| Debugging | 30000ms+ |

## Delays

| After | Delay |
|-------|-------|
| Command execution | 500ms |
| Webview open | 500-1000ms |
| Multiple operations | 300ms between |
| IPC setup | 500ms |

## What You CAN Test

- ✅ Command registration
- ✅ Command execution (doesn't throw)
- ✅ Extension activation
- ✅ Configuration access
- ✅ Multiple invocations
- ✅ Race conditions

## What You CANNOT Test

- ❌ Webview DOM/HTML
- ❌ Webview button clicks
- ❌ Webview form inputs
- ❌ Direct IPC messages
- ❌ Visual appearance
- ❌ Webview rendering

## Common Mistakes

### ❌ Missing Timeout
```typescript
test('should do something', async () => {
  await slowOperation(); // Will timeout!
});
```

### ✅ Correct
```typescript
test('should do something', async function() {
  this.timeout(5000);
  await slowOperation();
});
```

### ❌ Missing Await
```typescript
test('should execute', async () => {
  vscode.commands.executeCommand('opm.someCommand'); // No await!
});
```

### ✅ Correct
```typescript
test('should execute', async () => {
  await vscode.commands.executeCommand('opm.someCommand');
});
```

### ❌ No Initialization Delay
```typescript
test('should open webview', async () => {
  await vscode.commands.executeCommand('opm.openPackageBrowser');
  // Immediately test something - webview not ready!
});
```

### ✅ Correct
```typescript
test('should open webview', async () => {
  await vscode.commands.executeCommand('opm.openPackageBrowser');
  await new Promise(resolve => setTimeout(resolve, 500)); // Wait for init
});
```

### ❌ Testing Webview DOM
```typescript
test('search box should exist', async () => {
  await vscode.commands.executeCommand('opm.openPackageBrowser');
  const searchBox = document.querySelector('#search'); // Can't do this!
});
```

### ✅ Correct (test in unit tests instead)
```typescript
// In a separate unit test file using JSDOM
test('search box should render', () => {
  const container = render(PackageBrowserApp);
  const searchBox = container.querySelector('#search');
  assert.ok(searchBox);
});
```

## Running Tests

```bash
# Command line
npm run test:e2e

# VS Code debugger
# Press F5 → Select "E2E Tests"

# Build first
bun run build && npm run test:e2e
```

## Debugging

```typescript
test('debugging test', async function() {
  this.timeout(30000); // Long timeout for debugging
  
  console.log('Step 1: Starting...');
  await vscode.commands.executeCommand('opm.openPackageBrowser');
  console.log('Step 2: Command executed');
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  console.log('Step 3: Complete');
});
```

## Test Organization

```
test/e2e/
├── index.ts                    # Test runner
├── extension.e2e.ts            # Basic extension tests
├── packageBrowser.e2e.ts       # Package browser feature
└── commands.e2e.ts             # Command tests
```

## Suite Organization

```typescript
suite('Package Browser', () => {
  suite('Command Registration', () => {
    test('should register openPackageBrowser', async () => {
      // ...
    });
  });
  
  suite('Command Execution', () => {
    test('should execute without errors', async () => {
      // ...
    });
    
    test('should handle multiple calls', async () => {
      // ...
    });
  });
  
  suite('Error Handling', () => {
    test('should handle rapid invocations', async () => {
      // ...
    });
  });
});
```

## See Also

- **Full Guide:** `docs/technical/e2e-testing-guide.md`
- **Example Tests:** `test/e2e/packageBrowser.e2e.ts`
- **Copilot Instructions:** `.github/copilot-instructions.md` (Testing Expectations section)
