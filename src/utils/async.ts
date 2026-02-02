/**
 * Async utility functions for controlled concurrency and batch processing.
 *
 * @module utils/async
 */

/**
 * Process items in concurrent batches with controlled parallelism.
 *
 * Executes async operations on array items with a maximum concurrency limit,
 * processing items in batches and preserving the original array order in results.
 * Useful for rate-limiting API calls, parallel file operations, or concurrent
 * CLI command execution.
 *
 * @param items - Array of items to process
 * @param processor - Async function to process each item (receives item and original index)
 * @param batchSize - Maximum number of concurrent operations (default: 3)
 * @returns Promise resolving to array of results in original order
 *
 * @example
 * // Install packages to multiple projects with concurrency limit
 * const results = await batchConcurrent(
 *   projectPaths,
 *   async (path) => await installToProject(path),
 *   3 // max 3 concurrent dotnet processes
 * );
 *
 * @example
 * // Process with index access
 * const results = await batchConcurrent(
 *   ['a', 'b', 'c'],
 *   async (item, index) => `${index}: ${item}`,
 *   2
 * );
 * // Results: ['0: a', '1: b', '2: c']
 */
export async function batchConcurrent<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  batchSize = 3,
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, Math.min(i + batchSize, items.length));
    const batchResults = await Promise.all(batch.map((item, batchIndex) => processor(item, i + batchIndex)));
    results.push(...batchResults);
  }

  return results;
}
