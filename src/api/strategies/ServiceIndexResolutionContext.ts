import type { PackageSource } from '../../domain/models/nugetApiOptions';
import type { IHttpClient } from '../services/serviceIndexResolver';
import type { ILogger } from '../../services/loggerService';
import type { ServiceIndexResolutionContext } from './IServiceIndexResolutionStrategy';

/**
 * Factory function to create resolution context.
 * Encapsulates context creation to avoid parameter explosion in strategy methods.
 *
 * @param indexUrl - Service index URL to resolve
 * @param source - Package source configuration
 * @param http - HTTP client for network requests
 * @param logger - Logger for diagnostics
 * @param signal - Optional cancellation signal
 * @returns Resolution context object
 */
export function createResolutionContext(
  indexUrl: string,
  source: PackageSource,
  http: IHttpClient,
  logger: ILogger,
  signal?: AbortSignal,
): ServiceIndexResolutionContext {
  return {
    indexUrl,
    source,
    http,
    logger,
    signal,
  };
}
