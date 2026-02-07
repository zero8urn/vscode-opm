/**
 * API module exports.
 *
 * Provides the NuGet API facade and supporting infrastructure.
 */

export { NuGetApiFacade, createNuGetApiFacade } from './nugetApiFacade';
export { HttpPipeline, FetchHttpClient, RetryMiddleware, RateLimitMiddleware } from './httpPipeline';
export type { IHttpClient, IHttpMiddleware } from './httpPipeline';
export { ServiceIndexResolver } from './services/serviceIndexResolver';
export { SearchExecutor } from './services/searchExecutor';
export { MetadataFetcher } from './services/metadataFetcher';
export { ReadmeFetcher } from './services/readmeFetcher';
