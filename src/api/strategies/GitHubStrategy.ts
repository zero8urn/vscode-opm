import { ok, fail } from '../../core/result';
import type { Result, AppError } from '../../core/result';
import type { ServiceIndex } from '../../domain/models/serviceIndex';
import type { IServiceIndexResolutionStrategy, ServiceIndexResolutionContext } from './IServiceIndexResolutionStrategy';

/**
 * Resolution strategy for GitHub Packages NuGet feeds.
 *
 * GitHub Packages requires:
 * - Personal Access Token via X-NuGet-ApiKey header (or Authorization header)
 * - Standard /index.json URL pattern
 * - User-Agent header
 *
 * Auth configuration:
 * - Primary: API key via custom header (default: X-NuGet-ApiKey)
 * - Fallback: Token via Authorization header
 *
 * @see https://docs.github.com/packages/working-with-a-github-packages-registry/working-with-the-nuget-registry
 *
 * @example
 * ```typescript
 * const source: PackageSource = {
 *   provider: 'github',
 *   auth: { type: 'api-key', password: 'ghp_...', apiKeyHeader: 'X-NuGet-ApiKey' }
 * };
 * const strategy = new GitHubStrategy();
 * const result = await strategy.resolve(context);
 * ```
 */
export class GitHubStrategy implements IServiceIndexResolutionStrategy {
  readonly provider = 'github' as const;

  async resolve(context: ServiceIndexResolutionContext): Promise<Result<ServiceIndex, AppError>> {
    const { indexUrl, http, signal, logger } = context;

    logger.debug(`[GitHubStrategy] Fetching service index: ${indexUrl}`);

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
    } else if (auth?.password) {
      // Fallback: use Authorization header with token
      headers['Authorization'] = `token ${auth.password}`;
    }

    return headers;
  }
}
