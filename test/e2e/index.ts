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
    // Automatically discover and add all test files (*.e2e.js)
    const testFiles = fs
      .readdirSync(testsRoot)
      .filter(file => file.endsWith('.e2e.js'))
      .map(file => path.resolve(testsRoot, file));

    testFiles.forEach(file => mocha.addFile(file));

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
