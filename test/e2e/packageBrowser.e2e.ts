import * as assert from 'assert';
import * as vscode from 'vscode';
import { sleep, waitFor } from './testHelpers';

/**
 * E2E test for Package Browser command execution and webview creation.
 *
 * This test runs in the VS Code Extension Host and validates the complete
 * workflow of opening the package browser webview.
 *
 * IMPORTANT: These tests have access to the VS Code API but CANNOT:
 * - Access webview DOM or internals
 * - Click buttons or interact with webview UI
 * - Inspect rendered HTML content
 *
 * Instead, test:
 * - Command registration and execution
 * - Extension lifecycle (activation, disposal)
 * - That commands complete without throwing errors
 */
suite('Package Browser E2E Tests', () => {
  test('Command opm.openPackageBrowser should be registered after activation', async function () {
    this.timeout(5000);

    // Trigger extension activation by executing any command from the extension
    await vscode.commands.executeCommand('opm.openPackageBrowser');

    // Now verify the command is registered
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('opm.openPackageBrowser'), 'Command should be registered');
  });

  test('Executing opm.openPackageBrowser should complete without errors', async function () {
    // E2E tests need longer timeouts than unit tests
    this.timeout(5000);

    // Ensure the extension is activated and the command exists before running
    const extId = 'zero8urn.octothorpe-package-manager';
    try {
      await waitFor(
        async () => {
          const ext = vscode.extensions.getExtension(extId);
          return !!ext;
        },
        {
          timeoutMs: 5000,
        },
      );
    } catch (err) {
      // extension not found within timeout - proceed and let subsequent asserts fail
    }

    try {
      await waitFor(
        async () => {
          const commands = await vscode.commands.getCommands(true);
          return commands.includes('opm.openPackageBrowser');
        },
        {
          timeoutMs: 3000,
          intervalMs: 150,
        },
      );
    } catch (err) {
      // command not present within timeout
    }

    // Execute command - if it throws, test fails
    await vscode.commands.executeCommand('opm.openPackageBrowser');

    // Prefer a deterministic signal: if the extension exports a testing API
    // (e.g. ext.exports.__test?.webviewReady), poll that. If not present,
    // fall back to a short sleep. Encouraging extensions to export a small
    // test hook makes E2E much more reliable.
    const ext = vscode.extensions.getExtension(extId);
    if (ext && (ext.exports as any)?.__test?.webviewReady) {
      try {
        await waitFor(async () => Boolean((ext.exports as any).__test.webviewReady), {
          timeoutMs: 5000,
        });
      } catch (err) {
        throw new Error('webview readiness signal not received');
      }
    } else {
      // No test hook available; fall back to a small, bounded wait
      await sleep(500);
    }

    // Success = command executed and (best-effort) webview initialization completed
    assert.ok(true, 'Command executed successfully');
  });

  test('Opening package browser multiple times should not throw', async function () {
    this.timeout(5000);

    // First open
    await vscode.commands.executeCommand('opm.openPackageBrowser');
    await sleep(300);

    // Second open - should either reuse panel or create new one
    await vscode.commands.executeCommand('opm.openPackageBrowser');
    await sleep(300);

    // Both invocations completed without throwing
    assert.ok(true, 'Multiple invocations handled correctly');
  });

  test('Extension should handle rapid command invocations', async function () {
    this.timeout(10000);

    // Simulate user rapidly clicking the command
    const promises = [
      vscode.commands.executeCommand('opm.openPackageBrowser'),
      vscode.commands.executeCommand('opm.openPackageBrowser'),
      vscode.commands.executeCommand('opm.openPackageBrowser'),
    ];

    // All should complete without race conditions or errors
    await Promise.all(promises);

    // Give time for any async cleanup
    await new Promise(resolve => setTimeout(resolve, 500));

    assert.ok(true, 'Rapid invocations handled gracefully');
  });
});
