import type { ILogger } from '../../services/loggerService';
import type { ServiceIndex } from '../../domain/models/serviceIndex';
import { findResource, ResourceTypes } from '../../domain/models/serviceIndex';
import type { NuGetResult } from '../../domain/models/nugetError';

/**
 * Fetches and parses NuGet v3 service index.
 *
 * The service index is the entry point for NuGet package sources,
 * listing available resources (search, metadata, package publish, etc.).
 *
 * @param indexUrl - URL to index.json (e.g., 'https://api.nuget.org/v3/index.json')
 * @param logger - Logger instance
 * @param timeoutMs - Request timeout in milliseconds (default: 5000)
 * @param signal - Optional AbortSignal for cancellation
 * @returns Promise resolving to NuGetResult with ServiceIndex
 *
 * @example
 * ```typescript
 * const result = await fetchServiceIndex('https://api.nuget.org/v3/index.json', logger);
 * if (result.success) {
 *   const searchUrl = findResource(result.result, ResourceTypes.SearchQueryService);
 *   console.log(searchUrl); // 'https://azuresearch-usnc.nuget.org/query'
 * }
 * ```
 */
export async function fetchServiceIndex(
  indexUrl: string,
  logger: ILogger,
  timeoutMs = 5000,
  signal?: AbortSignal,
): Promise<NuGetResult<ServiceIndex>> {
  logger.debug(`Fetching service index: ${indexUrl}`);

  // Check if already aborted
  if (signal?.aborted) {
    logger.debug('Request already aborted');
    return {
      success: false,
      error: { code: 'Network', message: 'Request was cancelled' },
    };
  }

  // Create timeout controller
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

  // Combine timeout and caller signals
  // Note: AbortSignal.any() is not available in all environments yet
  let combinedSignal = timeoutController.signal;
  if (signal) {
    if (typeof AbortSignal.any === 'function') {
      combinedSignal = AbortSignal.any([signal, timeoutController.signal]);
    } else {
      // Fallback: listen to caller signal manually
      signal.addEventListener('abort', () => timeoutController.abort());
      combinedSignal = timeoutController.signal;
    }
  }

  try {
    const response = await fetch(indexUrl, { signal: combinedSignal });

    if (!response.ok) {
      logger.warn(`Service index request failed: HTTP ${response.status}`);
      return {
        success: false,
        error: {
          code: 'ApiError',
          message: `HTTP ${response.status}: ${response.statusText}`,
        },
      };
    }

    const data = (await response.json()) as ServiceIndex;

    logger.debug(`Service index fetched successfully (${data.resources.length} resources)`);

    return { success: true, result: data };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        logger.debug('Service index request cancelled or timed out');
        return {
          success: false,
          error: { code: 'Network', message: 'Request was cancelled or timed out' },
        };
      }

      if (error instanceof SyntaxError) {
        logger.error('Service index response is not valid JSON', error);
        return {
          success: false,
          error: { code: 'ParseError', message: 'Invalid JSON response' },
        };
      }

      logger.error('Service index request failed', error);
      return {
        success: false,
        error: { code: 'Network', message: error.message },
      };
    }

    logger.error('Service index request failed with unknown error');
    return {
      success: false,
      error: { code: 'Network', message: 'Unknown error' },
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetches service index and extracts search URL.
 *
 * Convenience function that fetches the service index and returns
 * the SearchQueryService resource URL.
 *
 * @param indexUrl - URL to index.json
 * @param logger - Logger instance
 * @param timeoutMs - Request timeout in milliseconds (default: 5000)
 * @param signal - Optional AbortSignal for cancellation
 * @returns Promise resolving to NuGetResult with search URL
 *
 * @example
 * ```typescript
 * const result = await getSearchUrl('https://api.nuget.org/v3/index.json', logger);
 * if (result.success) {
 *   console.log(result.result); // 'https://azuresearch-usnc.nuget.org/query'
 * }
 * ```
 */
export async function getSearchUrl(
  indexUrl: string,
  logger: ILogger,
  timeoutMs = 5000,
  signal?: AbortSignal,
): Promise<NuGetResult<string>> {
  const indexResult = await fetchServiceIndex(indexUrl, logger, timeoutMs, signal);

  if (!indexResult.success) {
    return indexResult;
  }

  const searchUrl = findResource(indexResult.result, ResourceTypes.SearchQueryService);

  if (!searchUrl) {
    logger.warn('SearchQueryService resource not found in service index');
    return {
      success: false,
      error: {
        code: 'ApiError',
        message: 'SearchQueryService not found in service index',
      },
    };
  }

  logger.debug(`Resolved search URL: ${searchUrl}`);

  return { success: true, result: searchUrl };
}
