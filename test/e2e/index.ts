import * as path from 'path';
import * as fs from 'fs';
import Mocha from 'mocha';

export function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
  });

  const testsRoot = path.resolve(__dirname);

  return new Promise((resolve, reject) => {
    try {
      // Find all .e2e.js files using native Node.js fs
      const files = fs
        .readdirSync(testsRoot)
        .filter(f => f.endsWith('.e2e.js'))
        .map(f => path.resolve(testsRoot, f));

      // Add files to the test suite
      files.forEach(f => mocha.addFile(f));

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
