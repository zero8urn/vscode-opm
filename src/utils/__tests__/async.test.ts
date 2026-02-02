/**
 * Tests for async utility functions.
 *
 * @module utils/__tests__/async.test
 */

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
      // Simulate varying execution times (later items finish first)
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

  test('passes correct index to processor', async () => {
    const items = ['a', 'b', 'c'];
    const processor = mock(async (item: string, index: number) => `${index}:${item}`);

    const results = await batchConcurrent(items, processor, 2);

    expect(results).toEqual(['0:a', '1:b', '2:c']);
    expect(processor).toHaveBeenNthCalledWith(1, 'a', 0);
    expect(processor).toHaveBeenNthCalledWith(2, 'b', 1);
    expect(processor).toHaveBeenNthCalledWith(3, 'c', 2);
  });

  test('handles single item', async () => {
    const items = [42];
    const processor = mock(async (n: number) => n * 2);

    const results = await batchConcurrent(items, processor, 3);

    expect(results).toEqual([84]);
    expect(processor).toHaveBeenCalledTimes(1);
  });

  test('works with batch size larger than array', async () => {
    const items = [1, 2, 3];
    const processor = mock(async (n: number) => n * 2);

    const results = await batchConcurrent(items, processor, 10);

    expect(results).toEqual([2, 4, 6]);
    expect(processor).toHaveBeenCalledTimes(3);
  });

  test('handles different result types', async () => {
    const items = [1, 2, 3];
    const processor = async (n: number) => ({ value: n, squared: n * n });

    const results = await batchConcurrent(items, processor, 2);

    expect(results).toEqual([
      { value: 1, squared: 1 },
      { value: 2, squared: 4 },
      { value: 3, squared: 9 },
    ]);
  });

  test('handles async errors in first batch', async () => {
    const items = [1, 2, 3, 4, 5];
    const processor = async (n: number) => {
      if (n === 2) throw new Error('Second item failed');
      return n;
    };

    await expect(batchConcurrent(items, processor, 3)).rejects.toThrow('Second item failed');
  });

  test('handles async errors in later batch', async () => {
    const items = [1, 2, 3, 4, 5];
    const processor = async (n: number) => {
      if (n === 4) throw new Error('Fourth item failed');
      return n;
    };

    await expect(batchConcurrent(items, processor, 2)).rejects.toThrow('Fourth item failed');
  });
});
