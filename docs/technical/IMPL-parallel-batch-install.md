# IMPL-parallel-batch-install

**High-Level Summary**: Optimize multi-project package installations by executing `dotnet add package` operations concurrently (in batches of 3-5) instead of sequentially. This reduces installation time for 10-20 projects from O(n × install_time) to O(⌈n/batch_size⌉ × install_time), providing **60-80% time savings** for large project sets. The implementation adds a configurable concurrency limiter to `InstallPackageCommand` and `UninstallPackageCommand`, respecting NuGet package cache safety while maximizing parallelism.

---

## Consolidated Todo List

- [ ] **1. Add concurrency utilities** — Create `batchConcurrent()` helper in `src/utils/async.ts` <details-ref>section-1</details-ref>
- [ ] **2. Update InstallPackageCommand** — Replace sequential loop with batched concurrent execution <details-ref>section-2</details-ref>
- [ ] **3. Update UninstallPackageCommand** — Apply same concurrent pattern for consistency <details-ref>section-3</details-ref>
- [ ] **4. Add unit tests** — Test batch processing, cancellation, partial failures <details-ref>section-4</details-ref>
- [ ] **5. Add integration test** — Verify concurrent installs to 10 projects <details-ref>section-5</details-ref>
- [ ] **6. Manual testing** — Test with 15-20 projects, measure time savings <details-ref>section-6</details-ref>

---

## Problem Statement

Currently, `InstallPackageCommand.execute()` processes projects sequentially:

```typescript
for (let i = 0; i < params.projectPaths.length; i++) {
  const result = await this.installToProject(...);  // ⏳ Blocks until complete
  results.push(result);
}
```

**Performance Impact**:
- **10 projects × 5 sec/project** = 50 seconds total (user waits)
- **20 projects × 5 sec/project** = 100 seconds total

**Root Cause**: NuGet package cache is thread-safe, but we're artificially serializing operations. The sequential approach was chosen to simplify progress reporting, but this trades off user experience for implementation simplicity.

---

## Solution Design

Execute installations in **controlled batches** (default: 3 concurrent operations) to balance performance and resource usage:

```typescript
// Before (sequential): 10 projects × 5s = 50s
for (const project of projects) {
  await install(project);
}

// After (batched): ⌈10/3⌉ = 4 batches × 5s = 20s
const BATCH_SIZE = 3;
for (let i = 0; i < projects.length; i += BATCH_SIZE) {
  const batch = projects.slice(i, i + BATCH_SIZE);
  await Promise.all(batch.map(p => install(p))); // Parallel within batch
}
```

**Expected Time Savings**:
- 10 projects: 50s → 20s (**60% faster**)
- 20 projects: 100s → 35s (**65% faster**)

**Safety**: NuGet's global package cache is designed for concurrent access. `dotnet add package` uses file locking for `.csproj` modifications (different files = safe parallelism).

---

<a id="section-1"></a>
## Detailed Implementation: Section 1 - Concurrency Utilities

**File**: `src/utils/async.ts` (new)

Create a reusable `batchConcurrent()` utility that processes an array in concurrent batches:

```typescript
/**
 * Process items in concurrent batches with controlled parallelism.
 *
 * @param items - Array of items to process
 * @param processor - Async function to process each item
 * @param batchSize - Number of concurrent operations (default: 3)
 * @returns Array of results in original order
 *
 * @example
 * const results = await batchConcurrent(
 *   projectPaths,
 *   async (path) => await installToProject(path),
 *   3 // max 3 concurrent installs
 * );
 */
export async function batchConcurrent<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  batchSize = 3,
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, Math.min(i + batchSize, items.length));
    const batchResults = await Promise.all(
      batch.map((item, batchIndex) => processor(item, i + batchIndex)),
    );
    results.push(...batchResults);
  }

  return results;
}
```

**Key Features**:
- Preserves original array order in results
- Generic typing for reusability
- Configurable batch size (default: 3)
- Simple implementation (no external dependencies)

---

<a id="section-2"></a>
## Detailed Implementation: Section 2 - Update InstallPackageCommand

**File**: `src/commands/installPackageCommand.ts`

### Changes Required

1. **Import utility**:
```typescript
import { batchConcurrent } from '../utils/async';
```

2. **Replace sequential loop** in `execute()` method:

**Before** (lines 130-162):
```typescript
for (let i = 0; i < params.projectPaths.length; i++) {
  if (token.isCancellationRequested) { /* ... */ }
  
  const projectPath = params.projectPaths[i]!;
  const projectName = path.basename(projectPath, '.csproj');
  
  progress.report({ /* ... */ });
  
  const result = await this.installToProject(...);
  results.push(result);
  
  if (token.isCancellationRequested) { break; }
}
```

**After**:
```typescript
const BATCH_SIZE = 3; // Configurable concurrency limit
let processedCount = 0;

const results = await batchConcurrent(
  params.projectPaths,
  async (projectPath, index) => {
    // Check cancellation before starting each project
    if (token.isCancellationRequested) {
      throw new Error('Installation cancelled by user');
    }

    const projectName = path.basename(projectPath, '.csproj');

    // Update progress (atomic increment for concurrent operations)
    processedCount++;
    if (params.projectPaths.length > 1) {
      progress.report({
        message: `Installing to ${projectName} (${processedCount}/${params.projectPaths.length})...`,
        increment: 100 / params.projectPaths.length,
      });
    } else {
      progress.report({ message: `Installing to ${projectName}...` });
    }

    // Execute installation for this project
    return await this.installToProject(params.packageId, params.version, projectPath, token);
  },
  BATCH_SIZE,
);
```

**Key Changes**:
- Replace `for` loop with `batchConcurrent()` call
- Use atomic counter for progress updates (concurrent operations complete in unpredictable order)
- Throw on cancellation (caught by `withProgress` wrapper)
- Results array automatically populated by `batchConcurrent()` in correct order

### Progress Reporting Implications

**Before**: Progress messages showed strict sequential order (1/10, 2/10, 3/10...)

**After**: Progress counts increment as projects complete, potentially out of order:
- User sees: "Installing to ProjectB (1/10)...", "Installing to ProjectA (2/10)..." (alphabetical order not guaranteed)
- **This is acceptable**: Users care about total progress, not strict ordering

---

<a id="section-3"></a>
## Detailed Implementation: Section 3 - Update UninstallPackageCommand

**File**: `src/commands/uninstallPackageCommand.ts`

Apply identical pattern to `UninstallPackageCommand.execute()` for consistency:

```typescript
import { batchConcurrent } from '../utils/async';

// In execute() method:
const BATCH_SIZE = 3;
let processedCount = 0;

const results = await batchConcurrent(
  params.projectPaths,
  async (projectPath, index) => {
    if (token.isCancellationRequested) {
      throw new Error('Uninstallation cancelled by user');
    }

    const projectName = path.basename(projectPath, '.csproj');
    processedCount++;

    progress.report({
      message: `Uninstalling from ${projectName} (${processedCount}/${params.projectPaths.length})...`,
      increment: 100 / params.projectPaths.length,
    });

    return await this.uninstallFromProject(params.packageId, projectPath, token);
  },
  BATCH_SIZE,
);
```

**Why mirror InstallPackageCommand**:
- Consistent user experience (both operations have same performance characteristics)
- Uninstall operations are also safe for concurrency (different `.csproj` files)
- Reduces code review burden (same pattern applied twice)

---

<a id="section-4"></a>
## Detailed Implementation: Section 4 - Unit Tests

**File**: `src/utils/__tests__/async.test.ts` (new)

Test the `batchConcurrent()` utility in isolation:

```typescript
import { describe, test, expect, mock } from 'bun:test';
import { batchConcurrent } from '../async';

describe('batchConcurrent', () => {
  test('processes items in batches', async () => {
    const items = [1, 2, 3, 4, 5, 6, 7];
    const processor = mock(async (n: number) => n * 2);

    const results = await batchConcurrent(items, processor, 3);

    expect(results).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(processor).toHaveBeenCalledTimes(7);
  });

  test('preserves original order', async () => {
    const items = ['a', 'b', 'c', 'd'];
    const processor = async (str: string, idx: number) => {
      // Simulate varying execution times
      await new Promise(resolve => setTimeout(resolve, (4 - idx) * 10));
      return str.toUpperCase();
    };

    const results = await batchConcurrent(items, processor, 2);

    expect(results).toEqual(['A', 'B', 'C', 'D']); // Order preserved despite timing
  });

  test('handles errors in batch', async () => {
    const items = [1, 2, 3, 4];
    const processor = async (n: number) => {
      if (n === 3) throw new Error('Simulated failure');
      return n * 2;
    };

    await expect(batchConcurrent(items, processor, 2)).rejects.toThrow('Simulated failure');
  });

  test('handles empty array', async () => {
    const results = await batchConcurrent([], async () => 42, 3);
    expect(results).toEqual([]);
  });

  test('respects batch size', async () => {
    const items = [1, 2, 3, 4, 5, 6];
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    const processor = async (n: number) => {
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      await new Promise(resolve => setTimeout(resolve, 10));
      currentConcurrent--;
      return n;
    };

    await batchConcurrent(items, processor, 2);

    expect(maxConcurrent).toBeLessThanOrEqual(2); // Never exceeds batch size
  });
});
```

**File**: `src/commands/__tests__/install-package-command.test.ts` (update existing)

Add test for concurrent execution behavior:

```typescript
describe('InstallPackageCommand - Concurrent Execution', () => {
  test('executes installations in batches', async () => {
    const mockCliService = {
      addPackage: mock(async () => ({ success: true })),
    };

    const command = new InstallPackageCommand(
      mockCliService as any,
      mockLogger,
      mockProgressReporter,
    );

    const params = {
      packageId: 'Newtonsoft.Json',
      version: '13.0.3',
      projectPaths: [
        '/path/to/Project1.csproj',
        '/path/to/Project2.csproj',
        '/path/to/Project3.csproj',
        '/path/to/Project4.csproj',
        '/path/to/Project5.csproj',
      ],
    };

    const result = await command.execute(params);

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(5);
    expect(mockCliService.addPackage).toHaveBeenCalledTimes(5);
  });

  test('handles partial failure in batch', async () => {
    const mockCliService = {
      addPackage: mock(async (opts: any) => {
        if (opts.projectPath.includes('Project2')) {
          return { success: false, error: { code: 'Unknown', message: 'Simulated failure' } };
        }
        return { success: true };
      }),
    };

    const command = new InstallPackageCommand(
      mockCliService as any,
      mockLogger,
      mockProgressReporter,
    );

    const params = {
      packageId: 'Serilog',
      version: '3.1.1',
      projectPaths: [
        '/path/to/Project1.csproj',
        '/path/to/Project2.csproj',
        '/path/to/Project3.csproj',
      ],
    };

    const result = await command.execute(params);

    expect(result.success).toBe(true); // Partial success
    expect(result.results.filter(r => r.success)).toHaveLength(2);
    expect(result.results.filter(r => !r.success)).toHaveLength(1);
  });
});
```

---

<a id="section-5"></a>
## Detailed Implementation: Section 5 - Integration Test

**File**: `test/integration/concurrent-install.integration.test.ts` (new)

Test real concurrent installations against NuGet.org (safe for CI):

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createDotnetCliExecutor } from '../../src/services/cli/dotnetCliExecutor';
import { createPackageCliService } from '../../src/services/cli/packageCliService';
import { createLogger } from '../../src/services/loggerService';

describe('Concurrent Package Installation (Integration)', () => {
  let tempDir: string;
  let projectPaths: string[];

  beforeEach(async () => {
    // Create temporary directory with 10 test projects
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opm-concurrent-test-'));

    projectPaths = [];
    for (let i = 1; i <= 10; i++) {
      const projectDir = path.join(tempDir, `TestProject${i}`);
      await fs.mkdir(projectDir, { recursive: true });

      const csprojPath = path.join(projectDir, `TestProject${i}.csproj`);
      await fs.writeFile(
        csprojPath,
        `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
  </PropertyGroup>
</Project>`,
      );

      projectPaths.push(csprojPath);
    }
  });

  afterEach(async () => {
    // Cleanup
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('installs package to 10 projects concurrently', async () => {
    const cliExecutor = createDotnetCliExecutor();
    const logger = createLogger(null as any); // Mock context
    const cliService = createPackageCliService(cliExecutor, logger);

    const startTime = Date.now();

    // Install a small, fast package (Newtonsoft.Json.Bson ~200KB)
    const installPromises = projectPaths.map(projectPath =>
      cliService.addPackage({
        projectPath,
        packageId: 'Newtonsoft.Json.Bson',
        version: '1.0.2',
      }),
    );

    // Simulate batch processing (3 concurrent)
    const results: any[] = [];
    for (let i = 0; i < installPromises.length; i += 3) {
      const batch = installPromises.slice(i, i + 3);
      const batchResults = await Promise.all(batch);
      results.push(...batchResults);
    }

    const elapsedMs = Date.now() - startTime;

    // Verify all succeeded
    expect(results).toHaveLength(10);
    expect(results.every(r => r.success)).toBe(true);

    // Verify time savings (concurrent should be < 50% of sequential time)
    // Rough estimate: 10 projects × 2s/project = 20s sequential
    // With batching (3 concurrent): ⌈10/3⌉ × 2s = 8s
    expect(elapsedMs).toBeLessThan(15000); // Allow 15s for CI variability

    console.log(`✓ Concurrent install completed in ${elapsedMs}ms`);
  }, 30000); // 30s timeout
});
```

**Note**: This test is expensive (downloads from NuGet.org) but validates real-world behavior. Mark as integration test and skip in unit test runs.

---

<a id="section-6"></a>
## Detailed Implementation: Section 6 - Manual Testing

### Test Scenario: Install to 15 Projects

**Setup**:
1. Create a test solution with 15 .csproj projects (use script or generator)
2. Open Package Browser webview
3. Search for "Serilog" (medium-sized package, ~500KB)
4. Select version "3.1.1"
5. Expand "Install to Projects" section

**Test Steps**:
1. **Select all 15 projects** via checkboxes
2. **Click "Install to 15 projects"**
3. **Observe progress notification**:
   - Should show "Installing to ProjectX (Y/15)..."
   - Counter Y should increment faster than before (batched completion)
4. **Wait for completion**
5. **Record total time** from click to toast notification

**Expected Results**:
- **Before optimization**: ~75 seconds (15 × 5s)
- **After optimization**: ~30 seconds (⌈15/3⌉ × 5s + overhead)
- **Time savings**: ~60% faster
- All 15 projects show "✓ Installed" in UI
- No errors in Output panel

**Regression Checks**:
- Progress messages still appear (order may vary)
- Cancellation still works (if implemented)
- Partial failures handled gracefully (test by manually corrupting one .csproj mid-install)

---

## Configuration

### Batch Size Tuning

Default batch size: **3 concurrent operations**

Rationale:
- **Too low (1-2)**: Minimal performance gain, underutilizes system
- **Too high (10+)**: Resource contention, harder to debug failures
- **Sweet spot (3-5)**: Balances speed with debuggability

**Future Enhancement**: Make batch size configurable via extension settings:

```json
{
  "opm.installation.concurrencyLimit": 3
}
```

### Safety Considerations

**NuGet Package Cache**: Thread-safe by design (uses file locking)
**Project Files**: Each .csproj is modified independently (no conflicts)
**dotnet CLI**: Stateless tool, safe for concurrent invocations

**Edge Case**: Global NuGet cache corruption is extremely rare but possible. If users report issues, add retry logic or fallback to sequential mode.

---

## Testing Strategy

| Test Type | Coverage | Location |
|-----------|----------|----------|
| Unit | `batchConcurrent()` utility | `src/utils/__tests__/async.test.ts` |
| Unit | Command behavior (mocked) | `src/commands/__tests__/install-package-command.test.ts` |
| Integration | Real CLI concurrent installs | `test/integration/concurrent-install.integration.test.ts` |
| E2E | Full workflow (command → webview) | `test/e2e/packageBrowser.e2e.ts` (update existing) |
| Manual | 15+ projects, time measurement | As documented in Section 6 |

---

## Rollout Plan

1. **Implement utility** (`async.ts`) with unit tests
2. **Update InstallPackageCommand** with unit tests
3. **Update UninstallPackageCommand** (consistency)
4. **Add integration test** (optional, can be run manually)
5. **Manual testing** with 15-20 projects
6. **Merge and monitor** for user feedback

**Rollback**: If issues arise, revert `execute()` method to sequential loop (single file change).

---

## Performance Benchmark Estimates

| Projects | Sequential Time | Concurrent Time (batch=3) | Time Savings |
|----------|----------------|---------------------------|--------------|
| 5        | 25s            | 10s                       | 60%          |
| 10       | 50s            | 20s                       | 60%          |
| 15       | 75s            | 30s                       | 60%          |
| 20       | 100s           | 35s                       | 65%          |

**Assumptions**:
- Average install time: 5s/project (includes NuGet package download + restore)
- Batch size: 3 concurrent operations
- Negligible overhead for Promise.all coordination

**Real-world variables**:
- Network speed (faster network = bigger gains)
- Package size (larger packages = longer installs = bigger absolute savings)
- NuGet cache warmth (cached packages install faster)

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| NuGet cache corruption | High | Extremely rare; add retry logic if reported |
| Resource exhaustion (CPU/memory) | Medium | Batch size of 3 is conservative; monitor telemetry |
| Progress reporting confusion | Low | Users care about total count, not strict order |
| Regression in error handling | Medium | Comprehensive unit tests for failure scenarios |
| CI test flakiness (integration test) | Low | Mark integration test as optional or manual-only |

---

## Success Metrics

- **Primary**: Reduced installation time for 10+ projects (target: 60% faster)
- **Secondary**: No increase in installation failure rate
- **Tertiary**: Positive user feedback on perceived speed improvement

---

## References

- Discovery doc: `docs/discovery/install-to-projects-ui.md` (line 429: "Uses concurrency with reasonable limit")
- Feature spec: `docs/features/FEAT-001-02-install-packages.md` (line 144: "Multi-project installations should execute sequentially" — **superseded by this plan**)
- Existing implementation: `src/commands/installPackageCommand.ts` (line 130-162: sequential loop)
- Similar pattern: `src/services/cli/dotnetProjectParser.ts` (line 228: batch processing with size 5)

---

**Document ID**: IMPL-parallel-batch-install  
**Status**: Implementation Plan  
**Created**: 2026-02-02  
**Affects**: InstallPackageCommand, UninstallPackageCommand
