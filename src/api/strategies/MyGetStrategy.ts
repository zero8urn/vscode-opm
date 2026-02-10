import { ok, fail } from '../../core/result';
import type { Result, AppError } from '../../core/result';
import type { ServiceIndex } from '../../domain/models/serviceIndex';
import type { IServiceIndexResolutionStrategy, ServiceIndexResolutionContext } from './IServiceIndexResolutionStrategy';

/**
 * Resolution strategy for MyGet NuGet feeds.
 *
 * MyGet follows the standard NuGet v3 protocol, similar to nuget.org.
 * This strategy supports:
 * - Standard /v3/index.json URL pattern
 * - API key authentication via X-NuGet-ApiKey header
 * - Basic/bearer auth as fallback
 *
 * @see https://docs.myget.org/docs/reference/nuget
 *
 * @example
 * ```typescript
 * const source: PackageSource = {
 *   provider: 'myget',
 *   auth: { type: 'api-key', password: 'api-key', apiKeyHeader: 'X-NuGet-ApiKey' }
 * };
 * const strategy = new MyGetStrategy();
 * const result = await strategy.resolve(context);
 * ```
 */
export class MyGetStrategy implements IServiceIndexResolutionStrategy {
  readonly provider = 'myget' as const;

  async resolve(context: ServiceIndexResolutionContext): Promise<Result<ServiceIndex, AppError>> {
    const { indexUrl, http, signal, logger } = context;

    logger.debug(`[MyGetStrategy] Fetching service index: ${indexUrl}`);

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
    if (auth?.type === 'api-key' && auth.password) {
      const headerName = auth.apiKeyHeader ?? 'X-NuGet-ApiKey';
      headers[headerName] = auth.password;
    } else if (auth?.type === 'basic' && auth.username && auth.password) {
      const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
      headers.Authorization = `Basic ${credentials}`;
    } else if (auth?.type === 'bearer' && auth.password) {
      headers.Authorization = `Bearer ${auth.password}`;
    }

    return headers;
  }
}
