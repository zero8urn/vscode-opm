export type WaitForOptions = {
  timeoutMs?: number;
  intervalMs?: number;
  backoff?: number; // multiplier for interval
};

export function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

/**
 * Repeatedly evaluate `predicate` until it returns a truthy value or timeout.
 * Uses an exponential backoff on the polling interval to reduce CPU churn.
 */
export async function waitFor<T = boolean>(predicate: () => Promise<T> | T, options: WaitForOptions = {}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 5000;
  let intervalMs = options.intervalMs ?? 200;
  const backoff = options.backoff ?? 1.5;

  const deadline = Date.now() + timeoutMs;

  // Attempt immediately first
  try {
    const result = await predicate();
    if (result) return result;
  } catch (err) {
    // swallow and retry until deadline
  }

  while (Date.now() < deadline) {
    await sleep(intervalMs);
    try {
      const result = await predicate();
      if (result) return result;
    } catch (err) {
      // ignore and retry
    }
    intervalMs = Math.min(1000, Math.floor(intervalMs * backoff));
  }

  // Final attempt to get a more useful rejection value
  return Promise.reject(new Error(`waitFor: timeout after ${timeoutMs}ms`));
}
