import type { Result, AppError } from '../core/result';
import { ok, fail } from '../core/result';
import type { ILogger } from '../services/loggerService';

/**
 * HTTP middleware interface for request/response processing.
 */
export interface IHttpMiddleware {
  /**
   * Process a request and optionally modify it or the response.
   *
   * @param next - Function to call the next middleware in the chain
   * @returns Result of the HTTP operation
   */
  execute<T>(next: () => Promise<Result<T, AppError>>): Promise<Result<T, AppError>>;
}

/**
 * HTTP pipeline that applies middleware to requests.
 * Uses Decorator pattern to compose middleware layers.
 *
 * @example
 * ```typescript
 * const pipeline = new HttpPipeline(baseClient, [
 *   new RetryMiddleware(logger),
 *   new RateLimitMiddleware(logger),
 * ]);
 * const result = await pipeline.get<Data>('https://api.example.com/data');
 * ```
 */
export class HttpPipeline {
  constructor(private readonly baseClient: IHttpClient, private readonly middleware: IHttpMiddleware[] = []) {}

  async get<T>(
    url: string,
    options?: { signal?: AbortSignal; headers?: Record<string, string> },
  ): Promise<Result<T, AppError>> {
    // Build middleware chain (reverse order so first middleware runs first)
    let execute = async () => this.baseClient.get<T>(url, options);

    for (let i = this.middleware.length - 1; i >= 0; i--) {
      const mw = this.middleware[i]!;
      const current = execute;
      execute = () => mw.execute(current);
    }

    return execute();
  }
}

/**
 * Basic HTTP client interface.
 */
export interface IHttpClient {
  get<T>(
    url: string,
    options?: { signal?: AbortSignal; headers?: Record<string, string> },
  ): Promise<Result<T, AppError>>;
}

/**
 * Retry middleware with exponential backoff.
 * Retries failed requests up to a maximum number of attempts.
 */
export class RetryMiddleware implements IHttpMiddleware {
  constructor(
    private readonly logger: ILogger,
    private readonly maxAttempts: number = 3,
    private readonly baseDelayMs: number = 1000,
  ) {}

  async execute<T>(next: () => Promise<Result<T, AppError>>): Promise<Result<T, AppError>> {
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      const result = await next();

      // Success or non-retryable error
      if (result.success || !this.shouldRetry(result.error)) {
        return result;
      }

      // Don't retry on last attempt
      if (attempt === this.maxAttempts - 1) {
        this.logger.warn('RetryMiddleware: Max retry attempts reached', {
          attempts: this.maxAttempts,
          error: result.error,
        });
        return result;
      }

      // Exponential backoff
      const delayMs = this.baseDelayMs * Math.pow(2, attempt);
      this.logger.debug(`RetryMiddleware: Retrying after ${delayMs}ms`, {
        attempt: attempt + 1,
        maxAttempts: this.maxAttempts,
      });

      await this.sleep(delayMs);
    }

    // Should never reach here, but TypeScript requires it
    return fail({ code: 'Network', message: 'Retry loop exited unexpectedly' });
  }

  private shouldRetry(error: AppError): boolean {
    // Retry network errors and 5xx server errors
    return error.code === 'Network' || (error.code === 'ApiError' && error.statusCode >= 500);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Rate limit middleware.
 * Enforces minimum interval between requests.
 */
export class RateLimitMiddleware implements IHttpMiddleware {
  private lastRequestTime = 0;

  constructor(private readonly logger: ILogger, private readonly minIntervalMs: number = 100) {}

  async execute<T>(next: () => Promise<Result<T, AppError>>): Promise<Result<T, AppError>> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;

    if (elapsed < this.minIntervalMs) {
      const delay = this.minIntervalMs - elapsed;
      this.logger.debug(`RateLimitMiddleware: Delaying request by ${delay}ms`);
      await this.sleep(delay);
    }

    this.lastRequestTime = Date.now();
    return next();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Fetch-based HTTP client implementation.
 * Uses native Node.js fetch for HTTP requests.
 */
export class FetchHttpClient implements IHttpClient {
  constructor(private readonly logger: ILogger, private readonly timeout: number = 30000) {}

  async get<T>(
    url: string,
    options?: { signal?: AbortSignal; headers?: Record<string, string> },
  ): Promise<Result<T, AppError>> {
    this.logger.debug('FetchHttpClient: GET request', { url });

    // Create combined abort controller for internal timeout + caller signal
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    // Listen to caller's signal if provided
    if (options?.signal) {
      if (options.signal.aborted) {
        clearTimeout(timeoutId);
        return fail({ code: 'Cancelled', message: 'Request was cancelled before it started' });
      }
      options.signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: options?.headers || {},
      });

      clearTimeout(timeoutId);

      // Handle authentication errors
      if (response.status === 401 || response.status === 403) {
        this.logger.error(`FetchHttpClient: Authentication required (${response.status})`);
        return fail({
          code: 'AuthRequired',
          message: 'Authentication required',
          hint: 'Configure credentials for this source',
        });
      }

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        this.logger.warn('FetchHttpClient: Rate limited', { retryAfter });
        return fail({
          code: 'RateLimit',
          message: 'Too many requests. Please try again later.',
          retryAfter: retryAfter ? parseInt(retryAfter, 10) : undefined,
        });
      }

      // Handle HTTP errors
      if (!response.ok) {
        // Log 404s at debug level (they're expected for optional resources like README)
        // Log other errors at error level
        if (response.status === 404) {
          this.logger.debug(`FetchHttpClient: Resource not found (404): ${url}`);
        } else {
          this.logger.error(`FetchHttpClient: HTTP error ${response.status} ${response.statusText} for URL: ${url}`);
        }
        return fail({
          code: 'ApiError',
          message: `HTTP ${response.status}: ${response.statusText}`,
          statusCode: response.status,
        });
      }

      // Parse JSON response
      let json: T;
      try {
        const text = await response.text();
        // Handle empty responses
        if (!text || text.trim() === '') {
          json = '' as T;
        } else {
          json = JSON.parse(text) as T;
        }
      } catch (parseError) {
        this.logger.error(
          'FetchHttpClient: Failed to parse JSON',
          parseError instanceof Error ? parseError : undefined,
        );
        return fail({
          code: 'ParseError',
          message: 'Invalid JSON response',
          raw: parseError,
        });
      }

      return ok(json);
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle abort/timeout
      if (error instanceof Error && error.name === 'AbortError') {
        const wasCancelledByCaller = options?.signal?.aborted;
        this.logger.warn('FetchHttpClient: Request aborted', {
          cancelledByCaller: wasCancelledByCaller,
        });
        return fail({
          code: wasCancelledByCaller ? 'Cancelled' : 'Timeout',
          message: wasCancelledByCaller ? 'Request was cancelled' : 'Request timed out',
          timeoutMs: this.timeout,
        });
      }

      // Handle network errors
      this.logger.error(`FetchHttpClient: Network error: ${error instanceof Error ? error.message : String(error)}`);
      return fail({
        code: 'Network',
        message: 'Failed to connect to server',
        cause: error,
      });
    }
  }
}
