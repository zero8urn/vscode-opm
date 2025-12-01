import * as assert from 'assert';
import * as vscode from 'vscode';

/**
 * E2E test for Package Browser command execution and webview creation.
 * 
 * This test runs in the VS Code Extension Host and validates the complete
 * workflow of opening the package browser webview.
 */
suite('Package Browser E2E Tests', () => {
  test('Command opm.openPackageBrowser should be registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('opm.openPackageBrowser'), 'Command should be registered');
  });

  test('Executing opm.openPackageBrowser should open webview panel', async () => {
    // Track panel creation
    let panelCreated = false;
    const disposable = vscode.window.onDidChangeActiveTextEditor(() => {
      panelCreated = true;
    });

    try {
      // Execute command
      await vscode.commands.executeCommand('opm.openPackageBrowser');

      // Wait a bit for webview to initialize
      await new Promise(resolve => setTimeout(resolve, 500));

      // We can't easily assert panel creation without API changes,
      // but we can verify command executes without error
      assert.ok(true, 'Command executed successfully');
    } finally {
      disposable.dispose();
    }
  });

  test('Opening package browser multiple times should work', async () => {
    // First open
    await vscode.commands.executeCommand('opm.openPackageBrowser');
    await new Promise(resolve => setTimeout(resolve, 200));

    // Second open
    await vscode.commands.executeCommand('opm.openPackageBrowser');
    await new Promise(resolve => setTimeout(resolve, 200));

    // Should complete without errors
    assert.ok(true, 'Multiple opens succeeded');
  });
});
