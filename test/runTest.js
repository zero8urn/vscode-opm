import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runTests, downloadAndUnzipVSCode } from '@vscode/test-electron';

async function main() {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const extensionDevelopmentPath = resolve(__dirname, '..');
    const workspacePath = extensionDevelopmentPath;

    // Use pre-downloaded VS Code from Docker image if available, otherwise download
    let vscodeExecutablePath;
    if (process.env.VSCODE_TEST_PATH) {
      console.log(`[E2E] Using pre-downloaded VS Code: ${process.env.VSCODE_TEST_PATH}`);
      vscodeExecutablePath = process.env.VSCODE_TEST_PATH;
    } else {
      console.log('[E2E] Downloading VS Code...');
      vscodeExecutablePath = await downloadAndUnzipVSCode('stable');
    }

    // Add flags to make Electron run in CI / headless containers
    const launchArgs = [
      workspacePath,
      '--disable-extensions',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-software-rasterizer',
      '--disable-setuid-sandbox',
    ];

    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath,
      // point to the compiled JS test runner
      extensionTestsPath: resolve(__dirname, '..', 'out', 'test', 'e2e', 'index.js'),
      launchArgs,
    });
  } catch (err) {
    console.error('Failed to run tests');
    console.error(err);
    process.exit(1);
  }
}

main();
