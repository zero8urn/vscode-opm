/**
 * Unified result type for all operations that can fail.
 * Replaces DomainResult<T> and NuGetResult<T> with a single discriminated union.
 *
 * @example
 * ```typescript
 * async function fetchUser(id: string): Promise<Result<User>> {
 *   try {
 *     const user = await api.getUser(id);
 *     return ok(user);
 *   } catch (e) {
 *     return fail({ code: 'Network', message: e.message, cause: e });
 *   }
 * }
 *
 * const result = await fetchUser('123');
 * if (result.success) {
 *   console.log(result.value.name); // TypeScript knows 'value' exists
 * } else {
 *   console.error(result.error.message); // TypeScript knows 'error' exists
 * }
 * ```
 */

export type Result<T, E = AppError> =
  | { readonly success: true; readonly value: T }
  | { readonly success: false; readonly error: E };

/**
 * Unified error type for all application errors.
 * Discriminated union of all possible error scenarios.
 */
export type AppError =
  | { readonly code: 'Network'; readonly message: string; readonly cause?: unknown }
  | { readonly code: 'ApiError'; readonly message: string; readonly statusCode: number; readonly details?: unknown }
  | { readonly code: 'RateLimit'; readonly message: string; readonly retryAfter?: number }
  | { readonly code: 'AuthRequired'; readonly message: string; readonly hint?: string }
  | { readonly code: 'ParseError'; readonly message: string; readonly raw?: unknown }
  | { readonly code: 'Cancelled'; readonly message: string }
  | { readonly code: 'Timeout'; readonly message: string; readonly timeoutMs?: number }
  | { readonly code: 'NotFound'; readonly message: string; readonly resource?: string }
  | { readonly code: 'Validation'; readonly message: string; readonly field?: string }
  | { readonly code: 'CliError'; readonly message: string; readonly exitCode?: number; readonly stderr?: string }
  | { readonly code: 'ProjectNotFound'; readonly message: string; readonly projectPath?: string }
  | { readonly code: 'DotnetNotFound'; readonly message: string }
  | { readonly code: 'Unknown'; readonly message: string; readonly cause?: unknown };

// ============================================================================
// Constructors
// ============================================================================

/**
 * Create a successful result.
 */
export const ok = <T>(value: T): Result<T, never> => ({ success: true, value });

/**
 * Create a failed result.
 */
export const fail = <E = AppError>(error: E): Result<never, E> => ({ success: false, error });

// ============================================================================
// Combinators (Railway-Oriented Programming)
// ============================================================================

/**
 * Map the success value of a result.
 * Errors pass through unchanged.
 */
export const mapResult = <T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> =>
  result.success ? ok(fn(result.value)) : result;

/**
 * Flat-map (chain) results.
 * Errors pass through unchanged.
 */
export const flatMapResult = <T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> =>
  result.success ? fn(result.value) : result;

/**
 * Provide a default value if result is error.
 */
export const unwrapOr = <T, E>(result: Result<T, E>, defaultValue: T): T =>
  result.success ? result.value : defaultValue;

/**
 * Extract value or throw error.
 * Use sparingly — prefer pattern matching.
 */
export const unwrap = <T, E>(result: Result<T, E>): T => {
  if (result.success) return result.value;
  throw new Error(`Unwrap failed: ${JSON.stringify(result.error)}`);
};

/**
 * Combine multiple results into one.
 * Returns first error encountered, or success with array of values.
 */
export const combineResults = <T, E>(results: Result<T, E>[]): Result<T[], E> => {
  const values: T[] = [];
  for (const result of results) {
    if (!result.success) return result;
    values.push(result.value);
  }
  return ok(values);
};
