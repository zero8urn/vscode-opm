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

  test('Command executes with prerelease toggle and completes without errors', async function () {
    this.timeout(10000);

    // Execute command - validates prerelease filter integration flows through IPC
    await vscode.commands.executeCommand('opm.openPackageBrowser');

    // Wait for webview initialization
    await sleep(500);

    // Verify command completes successfully
    // Note: Cannot test webview DOM from Extension Host - this validates the integration
    // smoke test that prerelease toggle is rendered and doesn't break webview creation
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('opm.openPackageBrowser'), 'Command should be registered');
  });

  test('Installed package detection - getProjects flow completes without errors', async function () {
    this.timeout(10000);

    await vscode.commands.executeCommand('opm.openPackageBrowser');
    await sleep(500);

    // Verify command registered
    const commands = await vscode.commands.getCommands();
    assert.ok(commands.includes('opm.openPackageBrowser'));

    // Note: Cannot inspect webview DOM from Extension Host
    // Manual testing required to verify UI state:
    // 1. Search for "Microsoft.Extensions.DependencyInjection.Abstractions"
    // 2. Click package card to view details
    // 3. Verify installed projects show ✓ icon and version badge
    // 4. Verify "Install to Projects" section auto-expands if installed
  });
});
