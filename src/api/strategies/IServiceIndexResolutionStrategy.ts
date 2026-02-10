import type { Result, AppError } from '../../core/result';
import type { ServiceIndex } from '../../domain/models/serviceIndex';
import type { PackageSource, PackageSourceProvider } from '../../domain/models/nugetApiOptions';
import type { IHttpClient } from '../services/serviceIndexResolver';
import type { ILogger } from '../../services/loggerService';

/**
 * Context passed to resolution strategies.
 * Encapsulates all data needed for service index resolution.
 */
export interface ServiceIndexResolutionContext {
  /** Original index URL from package source configuration */
  readonly indexUrl: string;

  /** Package source metadata (auth, provider-specific options) */
  readonly source: PackageSource;

  /** HTTP client for making requests */
  readonly http: IHttpClient;

  /** Logger for diagnostics */
  readonly logger: ILogger;

  /** Cancellation signal */
  readonly signal?: AbortSignal;
}

/**
 * Strategy for resolving service index for a specific provider.
 *
 * Strategies implement provider-specific logic for:
 * - Generating candidate URLs (with fallbacks for quirky providers)
 * - Setting appropriate HTTP headers (Accept, User-Agent, auth)
 * - Validating service index responses
 *
 * Applies Strategy Pattern from Gang of Four to encapsulate provider-specific
 * resolution algorithms, making the system Open/Closed (new providers added
 * without modifying existing code).
 *
 * @example
 * ```typescript
 * class ArtifactoryStrategy implements IServiceIndexResolutionStrategy {
 *   async resolve(context: ServiceIndexResolutionContext): Promise<Result<ServiceIndex>> {
 *     // Try multiple URL patterns
 *     for (const url of this.generateCandidateUrls(context.indexUrl)) {
 *       const result = await context.http.get<ServiceIndex>(url, { ... });
 *       if (result.success) return ok(result.value);
 *     }
 *     return fail({ code: 'ApiError', message: 'All attempts failed' });
 *   }
 * }
 * ```
 */
export interface IServiceIndexResolutionStrategy {
  /**
   * Resolve service index using provider-specific logic.
   *
   * @param context - Resolution context (URL, source, HTTP client, logger)
   * @returns Result containing ServiceIndex or error
   */
  resolve(context: ServiceIndexResolutionContext): Promise<Result<ServiceIndex, AppError>>;

  /**
   * Provider type this strategy handles.
   */
  readonly provider: PackageSourceProvider;
}
