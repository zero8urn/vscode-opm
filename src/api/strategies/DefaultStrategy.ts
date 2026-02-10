import { ok, fail } from '../../core/result';
import type { Result, AppError } from '../../core/result';
import type { ServiceIndex } from '../../domain/models/serviceIndex';
import type { IServiceIndexResolutionStrategy, ServiceIndexResolutionContext } from './IServiceIndexResolutionStrategy';

/**
 * Default resolution strategy for custom/unknown providers.
 *
 * Attempts standard NuGet v3 patterns with minimal assumptions.
 * Suitable for:
 * - Custom private feeds
 * - MyGet (follows standard spec)
 * - Other spec-compliant feeds
 *
 * Supports all auth types (basic, bearer, api-key) via configuration.
 *
 * @example
 * ```typescript
 * const source: PackageSource = {
 *   provider: 'custom',
 *   auth: { type: 'basic', username: 'user', password: 'pass' }
 * };
 * const strategy = new DefaultStrategy();
 * const result = await strategy.resolve(context);
 * ```
 */
export class DefaultStrategy implements IServiceIndexResolutionStrategy {
  readonly provider = 'custom' as const;

  async resolve(context: ServiceIndexResolutionContext): Promise<Result<ServiceIndex, AppError>> {
    const { indexUrl, http, signal, logger } = context;

    logger.debug(`[DefaultStrategy] Fetching service index: ${indexUrl}`);

    if (signal?.aborted) {
      return fail({ code: 'Network', message: 'Request was cancelled' });
    }

    const headers = this.buildHeaders(context);
    const result = await http.get<ServiceIndex>(indexUrl, { signal, headers });

    if (!result.success) {
      return result;
    }

    return ok(result.value);
  }

  private buildHeaders(context: ServiceIndexResolutionContext): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'OPM-VSCode-Extension/1.0',
    };

    const auth = context.source.auth;
    if (auth?.type === 'basic' && auth.username && auth.password) {
      const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    } else if (auth?.type === 'bearer' && auth.password) {
      headers['Authorization'] = `Bearer ${auth.password}`;
    } else if (auth?.type === 'api-key' && auth.password) {
      const headerName = auth.apiKeyHeader ?? 'X-NuGet-ApiKey';
      headers[headerName] = auth.password;
    }

    return headers;
  }
}
