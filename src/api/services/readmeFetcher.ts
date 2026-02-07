import type { Result, AppError } from '../../core/result';
import { ok, fail } from '../../core/result';
import type { PackageSource } from '../../domain/models/nugetApiOptions';
import type { ILogger } from '../../services/loggerService';
import type { IHttpClient } from './serviceIndexResolver';
import type { ServiceIndexResolver } from './serviceIndexResolver';

/**
 * Service responsible for fetching package README files.
 *
 * Downloads README content from the flat container endpoint,
 * with size limits and proper error handling for missing READMEs.
 *
 * @example
 * ```typescript
 * const fetcher = new ReadmeFetcher(httpClient, indexResolver, logger);
 * const result = await fetcher.getReadme('Newtonsoft.Json', '13.0.1', source);
 * if (result.success) {
 *   console.log(result.value); // README markdown content
 * }
 * ```
 */
export class ReadmeFetcher {
  /** Maximum README size (500 KB) */
  private readonly MAX_README_SIZE = 500 * 1024;

  constructor(
    private readonly http: IHttpClient,
    private readonly indexResolver: ServiceIndexResolver,
    private readonly logger: ILogger,
    private readonly timeout: number = 60000,
  ) {}

  /**
   * Fetch README content for a specific package version.
   *
   * @param packageId - Package ID (e.g., 'Newtonsoft.Json')
   * @param version - Version string (e.g., '13.0.1')
   * @param source - Package source
   * @param signal - Optional AbortSignal
   * @returns Result containing README content (markdown/text)
   */
  async getReadme(
    packageId: string,
    version: string,
    source: PackageSource,
    signal?: AbortSignal,
  ): Promise<Result<string, AppError>> {
    // Resolve flat container base URL
    const flatContainerUrlResult = await this.indexResolver.getFlatContainerUrl(
      source.indexUrl,
      signal,
      this.buildHeaders(source),
    );

    if (!flatContainerUrlResult.success) {
      return flatContainerUrlResult;
    }

    const baseUrl = flatContainerUrlResult.value;

    if (!baseUrl) {
      return fail({
        code: 'NotFound',
        message: 'Flat container not supported by this source',
        resource: 'README',
      });
    }

    // Remove trailing slash from base URL to avoid double slashes
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
    const readmeUrl = `${normalizedBaseUrl}/${packageId.toLowerCase()}/${version.toLowerCase()}/readme`;

    this.logger.debug('ReadmeFetcher: Fetching package README', {
      packageId,
      version,
      url: readmeUrl,
    });

    // Execute request with text response
    const result = await this.http.get<string>(readmeUrl, {
      signal,
      headers: {
        ...this.filterHeadersForUrl(source, readmeUrl),
        Accept: 'text/plain, text/markdown, */*',
      },
    });

    if (!result.success) {
      // Map 404 to specific NotFound error
      if (result.error.code === 'ApiError' && result.error.statusCode === 404) {
        return fail({
          code: 'NotFound',
          message: 'Package README not found',
          resource: 'README',
        });
      }
      return result;
    }

    const content = result.value;

    // Validate size
    if (typeof content === 'string' && content.length > this.MAX_README_SIZE) {
      this.logger.warn('ReadmeFetcher: README exceeds size limit', {
        size: content.length,
        limit: this.MAX_README_SIZE,
      });

      return ok(content.slice(0, this.MAX_README_SIZE) + '\n\n_[README truncated]_');
    }

    this.logger.debug('ReadmeFetcher: README fetched successfully', {
      size: typeof content === 'string' ? content.length : 0,
    });

    return ok(typeof content === 'string' ? content : String(content));
  }

  /**
   * Build HTTP headers for authenticated requests.
   */
  private buildHeaders(source: PackageSource): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'text/plain, text/markdown, */*',
      'User-Agent': 'vscode-opm/1.0.0',
    };

    if (!source.auth || source.auth.type === 'none') {
      return headers;
    }

    const { type, username, password, apiKeyHeader } = source.auth;

    switch (type) {
      case 'basic':
        if (username && password) {
          const credentials = `${username}:${password}`;
          const encoded = Buffer.from(credentials, 'utf8').toString('base64');
          headers.Authorization = `Basic ${encoded}`;
        }
        break;

      case 'bearer':
        if (password) {
          headers.Authorization = `Bearer ${password}`;
        }
        break;

      case 'api-key':
        if (apiKeyHeader && password) {
          headers[apiKeyHeader] = password;
        }
        break;
    }

    return headers;
  }

  /**
   * Filter headers for cross-origin requests.
   */
  private filterHeadersForUrl(source: PackageSource, targetUrl: string): Record<string, string> {
    const headers = this.buildHeaders(source);

    try {
      const sourceOrigin = new URL(source.indexUrl).origin;
      const targetOrigin = new URL(targetUrl).origin;

      if (sourceOrigin !== targetOrigin) {
        delete headers.Authorization;
        if (source.auth?.apiKeyHeader) {
          delete headers[source.auth.apiKeyHeader];
        }
      }
    } catch {
      delete headers.Authorization;
      if (source.auth?.apiKeyHeader) {
        delete headers[source.auth.apiKeyHeader];
      }
    }

    return headers;
  }
}
