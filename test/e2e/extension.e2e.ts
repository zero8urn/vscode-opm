import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
  test('extension loads', async function () {
    this.timeout(5000);
    const extension = vscode.extensions.getExtension('zero8urn.octothorpe-package-manager');
    // extension may not be activated yet; assert that metadata exists
    assert.ok(extension);
  });
});
