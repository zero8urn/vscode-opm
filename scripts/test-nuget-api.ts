import { createNuGetApiClient } from '../src/env/node/nugetApiClient';

// Mock logger for script
const mockLogger = {
  debug: (msg: string, data?: any) => console.log(`[DEBUG] ${msg}`, data || ''),
  info: (msg: string, ...args: any[]) => console.log(`[INFO] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) => console.warn(`[WARN] ${msg}`, ...args),
  error: (msg: string | Error) => console.error(`[ERROR] ${msg}`),
  show: () => {},
  isDebugEnabled: () => true,
  dispose: () => {},
};

async function testNuGetApi() {
  const client = createNuGetApiClient(mockLogger as any);

  console.log('\n=== Testing NuGet API Client ===\n');

  // Test 1: Search for popular package
  console.log('Test 1: Searching for "Newtonsoft.Json"...');
  const result1 = await client.searchPackages({ query: 'Newtonsoft.Json' });
  if (result1.success) {
    console.log(`✓ Found ${result1.result.length} packages`);
    if (result1.result.length > 0) {
      const pkg = result1.result[0]!;
      console.log(`  - ${pkg.id} v${pkg.version}`);
      console.log(`  - Downloads: ${pkg.downloadCount}`);
      console.log(`  - Verified: ${pkg.verified}`);
    }
  } else {
    console.error(`✗ Error: ${result1.error.message}`);
  }

  // Test 2: Search with prerelease
  console.log('\nTest 2: Searching with prerelease=true...');
  const result2 = await client.searchPackages({ query: 'Serilog', prerelease: true });
  if (result2.success) {
    console.log(`✓ Found ${result2.result.length} packages`);
  } else {
    console.error(`✗ Error: ${result2.error.message}`);
  }

  // Test 3: Pagination
  console.log('\nTest 3: Testing pagination (skip=5, take=3)...');
  const result3 = await client.searchPackages({ query: 'Microsoft', skip: 5, take: 3 });
  if (result3.success) {
    console.log(`✓ Retrieved ${result3.result.length} packages`);
    result3.result.forEach((pkg: { id: any; version: any }, i: number) => {
      console.log(`  ${i + 6}. ${pkg.id} (${pkg.version})`);
    });
  } else {
    console.error(`✗ Error: ${result3.error.message}`);
  }

  // Test 4: Browse all packages (no query)
  console.log('\nTest 4: Browsing all packages (no query)...');
  const result4 = await client.searchPackages({ take: 5 });
  if (result4.success) {
    console.log(`✓ Retrieved ${result4.result.length} packages`);
  } else {
    console.error(`✗ Error: ${result4.error.message}`);
  }

  // Test 5: Non-existent package
  console.log('\nTest 5: Searching for non-existent package...');
  const result5 = await client.searchPackages({ query: 'ThisPackageDefinitelyDoesNotExist12345' });
  if (result5.success) {
    console.log(`✓ Search succeeded with ${result5.result.length} results (expected 0)`);
  } else {
    console.error(`✗ Unexpected error: ${result5.error.message}`);
  }

  // Test 6: Cancellation
  console.log('\nTest 6: Testing request cancellation...');
  const controller = new AbortController();
  const resultPromise = client.searchPackages({ query: 'test' }, controller.signal);
  controller.abort();
  const result6 = await resultPromise;
  if (!result6.success && result6.error.code === 'Network') {
    console.log('✓ Request successfully cancelled');
  } else {
    console.error('✗ Cancellation failed');
  }

  console.log('\n=== Tests Complete ===\n');
}

testNuGetApi().catch(console.error);
