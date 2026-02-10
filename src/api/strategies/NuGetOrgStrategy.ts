import { ok, fail } from '../../core/result';
import type { Result, AppError } from '../../core/result';
import type { ServiceIndex } from '../../domain/models/serviceIndex';
import type { IServiceIndexResolutionStrategy, ServiceIndexResolutionContext } from './IServiceIndexResolutionStrategy';

/**
 * Resolution strategy for NuGet.org feeds.
 *
 * NuGet.org is spec-compliant and requires no special handling.
 * This strategy serves as the baseline implementation with:
 * - Single URL attempt (no fallbacks needed)
 * - Standard Accept/User-Agent headers
 * - Basic service index validation
 *
 * @example
 * ```typescript
 * const strategy = new NuGetOrgStrategy();
 * const result = await strategy.resolve(context);
 * ```
 */
export class NuGetOrgStrategy implements IServiceIndexResolutionStrategy {
  readonly provider = 'nuget.org' as const;

  async resolve(context: ServiceIndexResolutionContext): Promise<Result<ServiceIndex, AppError>> {
    const { indexUrl, http, signal, logger } = context;

    logger.debug(`[NuGetOrgStrategy] Fetching service index: ${indexUrl}`);

    if (signal?.aborted) {
      return fail({ code: 'Network', message: 'Request was cancelled' });
    }

    const headers = this.buildHeaders();
    const result = await http.get<ServiceIndex>(indexUrl, { signal, headers });

    if (!result.success) {
      logger.warn(`[NuGetOrgStrategy] Failed to fetch service index: ${result.error.message}`);
      return result;
    }

    return this.validateServiceIndex(result.value);
  }

  private buildHeaders(): Record<string, string> {
    return {
      Accept: 'application/json',
      'User-Agent': 'OPM-VSCode-Extension/1.0',
    };
  }

  private validateServiceIndex(data: ServiceIndex): Result<ServiceIndex, AppError> {
    if (!Array.isArray(data.resources) || data.resources.length === 0) {
      return fail({
        code: 'ApiError',
        message: 'Invalid service index: resources array missing or empty',
        statusCode: 0,
      });
    }
    return ok(data);
  }
}
