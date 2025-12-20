import * as path from 'path';
import Mocha from 'mocha';

export function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
  });

  const testsRoot = path.resolve(__dirname);

  return new Promise((resolve, reject) => {
    // Add test files to mocha - this will cause them to be loaded
    // and executed in the context where Mocha globals are available
    mocha.addFile(path.resolve(testsRoot, 'extension.e2e.js'));
    mocha.addFile(path.resolve(testsRoot, 'packageBrowser.e2e.js'));

    try {
      // Run the mocha test
      mocha.run((failures: number) => {
        if (failures > 0) {
          reject(new Error(`${failures} tests failed.`));
        } else {
          resolve();
        }
      });
    } catch (err) {
      console.error(err);
      reject(err);
    }
  });
}
