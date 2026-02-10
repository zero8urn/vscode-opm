import { ok, fail } from '../../core/result';
import type { Result, AppError } from '../../core/result';
import type { ServiceIndex } from '../../domain/models/serviceIndex';
import type { IServiceIndexResolutionStrategy, ServiceIndexResolutionContext } from './IServiceIndexResolutionStrategy';

/**
 * Resolution strategy for JFrog Artifactory NuGet feeds.
 *
 * Artifactory has non-standard service index URL patterns:
 * 1. Some instances reject `/v3/index.json` (return HTTP 406)
 * 2. Requires `/v3` injected mid-path (e.g., `/artifactory/api/nuget/v3/repo-name/index.json`)
 * 3. Some feeds work with `/v3` without `/index.json` suffix
 *
 * This strategy implements Chain of Responsibility to try multiple URL patterns.
 * Auth failures (401/403) stop retries immediately, while 406 errors trigger fallback.
 *
 * @see https://www.jfrog.com/confluence/display/JFROG/NuGet+Repositories
 *
 * @example
 * ```typescript
 * const strategy = new ArtifactoryStrategy();
 * const result = await strategy.resolve(context);
 * // Tries: original URL → v3 injection → v3 only → v3 append
 * ```
 */
export class ArtifactoryStrategy implements IServiceIndexResolutionStrategy {
  readonly provider = 'artifactory' as const;

  async resolve(context: ServiceIndexResolutionContext): Promise<Result<ServiceIndex, AppError>> {
    const { indexUrl, http, signal, logger } = context;

    logger.debug(`[ArtifactoryStrategy] Resolving service index: ${indexUrl}`);

    const candidateUrls = this.generateCandidateUrls(indexUrl);
    let lastError: AppError | null = null;

    for (const url of candidateUrls) {
      logger.debug(`[ArtifactoryStrategy] Attempting URL: ${url}`);

      const headers = this.buildHeaders(context);
      const result = await http.get<ServiceIndex>(url, { signal, headers });

      if (result.success) {
        logger.info(`[ArtifactoryStrategy] Successfully resolved via: ${url}`);
        return ok(result.value);
      }

      // Track last error for final failure response
      lastError = result.error;

      // Don't retry on auth errors (401/403) - fail fast
      if (result.error.code === 'ApiError' && (result.error.statusCode === 401 || result.error.statusCode === 403)) {
        logger.warn(`[ArtifactoryStrategy] Authentication failed, stopping retries`);
        break;
      }

      // Continue to next candidate URL
      logger.debug(`[ArtifactoryStrategy] Attempt failed: ${result.error.message}`);
    }

    return fail(
      lastError ?? {
        code: 'ApiError',
        message: 'All Artifactory URL patterns failed',
        statusCode: 0,
      },
    );
  }

  /**
   * Generate candidate URLs in priority order.
   *
   * Patterns:
   * 1. Original URL (user may have already configured correct pattern)
   * 2. Inject /v3 before /index.json (common Artifactory pattern)
   * 3. Replace /index.json with /v3 (alternative pattern)
   * 4. Append /v3/index.json if not present (fallback)
   */
  private generateCandidateUrls(indexUrl: string): string[] {
    const candidates: string[] = [];

    // 1. Original URL (respect user configuration)
    candidates.push(indexUrl);

    // 2. If URL ends with /index.json, try injecting /v3 before it
    if (indexUrl.endsWith('/index.json')) {
      const withV3Injection = indexUrl.replace(/\/index\.json$/, '/v3/index.json');
      if (!candidates.includes(withV3Injection)) {
        candidates.push(withV3Injection);
      }

      // 3. Try replacing /index.json with just /v3
      const withV3Only = indexUrl.replace(/\/index\.json$/, '/v3');
      if (!candidates.includes(withV3Only)) {
        candidates.push(withV3Only);
      }
    } else if (!indexUrl.includes('/v3')) {
      // 4. If no v3 in URL, append it
      const withV3Suffix = `${indexUrl.replace(/\/$/, '')}/v3/index.json`;
      if (!candidates.includes(withV3Suffix)) {
        candidates.push(withV3Suffix);
      }
    }

    return candidates;
  }

  private buildHeaders(context: ServiceIndexResolutionContext): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'OPM-VSCode-Extension/1.0',
    };

    // Add basic auth if configured
    const auth = context.source.auth;
    if (auth?.type === 'basic' && auth.username && auth.password) {
      const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    }

    return headers;
  }
}
