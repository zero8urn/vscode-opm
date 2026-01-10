/**
 * E2E tests for solution discovery and context management.
 *
 * These tests run in the VS Code Extension Host and test the
 * solution discovery configuration.
 */

import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { suite, test } from 'mocha';

suite('Solution Discovery E2E Tests', () => {
  test('should read solution discovery configuration', async function () {
    this.timeout(5000);

    const config = vscode.workspace.getConfiguration('opm');

    // Check that configuration values are accessible
    const solutionScanDepth = config.get('discovery.solutionScanDepth');
    const projectScanDepth = config.get('discovery.projectScanDepth');
    const largeWorkspaceThreshold = config.get('discovery.largeWorkspaceThreshold');

    // Default values from package.json
    assert.strictEqual(solutionScanDepth, 'root-only', 'solutionScanDepth should default to root-only');
    assert.strictEqual(projectScanDepth, 3, 'projectScanDepth should default to 3');
    assert.strictEqual(largeWorkspaceThreshold, 50, 'largeWorkspaceThreshold should default to 50');
  });

  // Temp skip. Not sure if I need to support solutionScanDepth.
  // test('should update solution discovery configuration', async function () {
  //   this.timeout(5000);

  //   const config = vscode.workspace.getConfiguration('opm');

  //   // Update setting
  //   await config.update('discovery.solutionScanDepth', 'recursive', vscode.ConfigurationTarget.Workspace);

  //   // Verify update
  //   const updatedValue = config.get('discovery.solutionScanDepth');
  //   assert.strictEqual(updatedValue, 'recursive', 'solutionScanDepth should be updated to recursive');

  //   // Restore default
  //   await config.update('discovery.solutionScanDepth', 'root-only', vscode.ConfigurationTarget.Workspace);
  // });
});
