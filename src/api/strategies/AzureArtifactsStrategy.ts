import { ok, fail } from '../../core/result';
import type { Result, AppError } from '../../core/result';
import type { ServiceIndex } from '../../domain/models/serviceIndex';
import type { IServiceIndexResolutionStrategy, ServiceIndexResolutionContext } from './IServiceIndexResolutionStrategy';

/**
 * Resolution strategy for Azure Artifacts NuGet feeds.
 *
 * Azure Artifacts requires:
 * - Bearer token authentication (Personal Access Token or Azure AD token)
 * - Specific User-Agent header
 * - Standard /v3/index.json URL pattern
 *
 * Auth configuration:
 * - Primary: Bearer token in `auth.password` field
 * - Fallback: Basic auth (Azure accepts both)
 *
 * @see https://learn.microsoft.com/azure/devops/artifacts/nuget/nuget-exe
 *
 * @example
 * ```typescript
 * const source: PackageSource = {
 *   provider: 'azure-artifacts',
 *   auth: { type: 'bearer', password: 'PAT_TOKEN' }
 * };
 * const strategy = new AzureArtifactsStrategy();
 * const result = await strategy.resolve(context);
 * ```
 */
export class AzureArtifactsStrategy implements IServiceIndexResolutionStrategy {
  readonly provider = 'azure-artifacts' as const;

  async resolve(context: ServiceIndexResolutionContext): Promise<Result<ServiceIndex, AppError>> {
    const { indexUrl, http, signal, logger } = context;

    logger.debug(`[AzureArtifactsStrategy] Fetching service index: ${indexUrl}`);

    if (signal?.aborted) {
      return fail({ code: 'Network', message: 'Request was cancelled' });
    }

    const headers = this.buildHeaders(context);
    const result = await http.get<ServiceIndex>(indexUrl, { signal, headers });

    if (!result.success) {
      // Enhance error message for auth failures
      if (result.error.code === 'ApiError' && result.error.statusCode === 401) {
        return fail({
          ...result.error,
          message: 'Azure Artifacts authentication failed. Ensure PAT is configured in nuget.config',
        });
      }
      return result;
    }

    return ok(result.value);
  }

  private buildHeaders(context: ServiceIndexResolutionContext): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'OPM-VSCode-Extension/1.0 (Azure-Artifacts)',
    };

    const auth = context.source.auth;
    if (auth?.type === 'bearer' && auth.password) {
      // Azure uses password field for PAT token
      headers['Authorization'] = `Bearer ${auth.password}`;
    } else if (auth?.type === 'basic' && auth.username && auth.password) {
      // Fallback: convert basic to bearer (Azure accepts either)
      const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    }

    return headers;
  }
}
