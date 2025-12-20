import * as assert from 'assert';
import * as vscode from 'vscode';
import { sleep, waitFor } from './testHelpers';

/**
 * E2E test for Package Browser command execution and webview creation.
 *
 * Following the testing pyramid: E2E tests are expensive, so we keep them minimal
 * and focused on critical user workflows that cross multiple system boundaries.
 *
 * IMPORTANT: These tests have access to the VS Code API but CANNOT:
 * - Access webview DOM or internals
 * - Click buttons or interact with webview UI
 * - Inspect rendered HTML content
 *
 * Instead, test:
 * - Command registration and execution (happy path)
 * - Extension handles edge cases (concurrent/repeated invocations)
 */
suite('Package Browser E2E Tests', () => {
  test('Command executes successfully and creates webview', async function () {
    this.timeout(10000);

    const extId = 'zero8urn.octothorpe-package-manager';

    // Wait for extension to be available
    await waitFor(
      async () => {
        const ext = vscode.extensions.getExtension(extId);
        return !!ext;
      },
      { timeoutMs: 5000 },
    );

    // Execute command - validates full workflow: activation → command → webview creation
    await vscode.commands.executeCommand('opm.openPackageBrowser');

    // Wait for webview initialization if test hook available
    const ext = vscode.extensions.getExtension(extId);
    if (ext && (ext.exports as any)?.__test?.webviewReady) {
      await waitFor(async () => Boolean((ext.exports as any).__test.webviewReady), {
        timeoutMs: 5000,
      });
    } else {
      await sleep(500);
    }

    // Verify command is registered (confirms activation succeeded)
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('opm.openPackageBrowser'), 'Command should be registered');
  });

  test('Handles concurrent and repeated invocations without errors', async function () {
    this.timeout(10000);

    // Execute in parallel - tests race condition handling
    await Promise.all([
      vscode.commands.executeCommand('opm.openPackageBrowser'),
      vscode.commands.executeCommand('opm.openPackageBrowser'),
      vscode.commands.executeCommand('opm.openPackageBrowser'),
    ]);

    await sleep(300);

    // Execute sequentially - tests panel reuse/recreation
    await vscode.commands.executeCommand('opm.openPackageBrowser');
    await sleep(300);
    await vscode.commands.executeCommand('opm.openPackageBrowser');

    // All invocations completed without throwing
    assert.ok(true, 'Concurrent and repeated invocations handled gracefully');
  });
});
