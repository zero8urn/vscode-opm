import * as path from 'path';
import { runTests, downloadAndUnzipVSCode } from '@vscode/test-electron';

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '..');
    const workspacePath = extensionDevelopmentPath;

    // download a compatible VS Code for testing (optional cache)
    await downloadAndUnzipVSCode('stable');

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath: path.resolve(__dirname, 'suite'),
      launchArgs: [workspacePath, '--disable-extensions']
    });
  } catch (err) {
    console.error('Failed to run tests');
    process.exit(1);
  }
}

main();
