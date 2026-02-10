import type { ILogger } from '../../../services/loggerService';
import type { IHttpClient } from '../../services/serviceIndexResolver';
import type { Result, AppError } from '../../../core/result';

/**
 * Create a mock logger for testing.
 */
export function createMockLogger(): ILogger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    show: () => {},
    isDebugEnabled: () => false,
    dispose: () => {},
  };
}

/**
 * Create a mock HTTP client for testing.
 */
export function createMockHttpClient<T>(response: Result<T, AppError>): IHttpClient {
  return {
    get: () => Promise.resolve(response as Result<any, AppError>),
  };
}
