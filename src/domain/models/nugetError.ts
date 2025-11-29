/**
 * NuGet-specific error types for API operations.
 *
 * This is a separate error type from DomainError to avoid polluting
 * the shared domain error union with package-specific codes.
 */
export type NuGetError =
  | { code: 'RateLimit'; message: string; retryAfter?: number }
  | { code: 'Network'; message: string; details?: string }
  | { code: 'ApiError'; message: string; statusCode?: number }
  | { code: 'ParseError'; message: string; details?: string }
  | { code: 'AuthRequired'; message: string; statusCode?: number; hint?: string };

/**
 * Result type for NuGet operations.
 *
 * Uses the same success/error pattern as DomainResult<T>.
 */
export type NuGetResult<T> = { success: true; result: T } | { success: false; error: NuGetError };
