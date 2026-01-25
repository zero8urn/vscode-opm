/**
 * E2E tests for Uninstall Package Command
 *
 * Tests command registration and execution within VS Code Extension Host.
 * Note: E2E tests in Extension Host context CANNOT test webview DOM or UI logic.
 * They focus on command registration, parameter validation, and execution flow.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Uninstall Package E2E', () => {
  test('Command is registered', async function () {
    this.timeout(5000);

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('opm.uninstallPackage'), 'opm.uninstallPackage command should be registered');
  });

  test('Command validates parameters - empty packageId', async function () {
    this.timeout(5000);

    try {
      await vscode.commands.executeCommand('opm.uninstallPackage', {
        packageId: '',
        projectPaths: ['test.csproj'],
      });
      assert.fail('Should have thrown validation error');
    } catch (error) {
      assert.ok(
        error instanceof Error && error.message.includes('Package ID is required'),
        'Should validate packageId',
      );
    }
  });

  test('Command validates parameters - empty projectPaths', async function () {
    this.timeout(5000);

    try {
      await vscode.commands.executeCommand('opm.uninstallPackage', {
        packageId: 'Newtonsoft.Json',
        projectPaths: [],
      });
      assert.fail('Should have thrown validation error');
    } catch (error) {
      assert.ok(
        error instanceof Error && error.message.toLowerCase().includes('at least one project'),
        'Should validate projectPaths',
      );
    }
  });

  test('Command validates parameters - invalid file extension', async function () {
    this.timeout(5000);

    try {
      await vscode.commands.executeCommand('opm.uninstallPackage', {
        packageId: 'Newtonsoft.Json',
        projectPaths: ['invalid.txt'],
      });
      assert.fail('Should have thrown validation error');
    } catch (error) {
      assert.ok(error instanceof Error && error.message.includes('.csproj'), 'Should validate file extension');
    }
  });
});
