# IMPL-PROVIDER-RESOLUTION-STRATEGIES

**Status**: Planning  
**Created**: 2026-02-09  
**Pattern Focus**: Strategy + Factory + Chain of Responsibility

---

## 📋 High-Level Summary

Implement provider-specific service index resolution strategies to handle differences in how package sources (Artifactory, Azure Artifacts, GitHub, MyGet, etc.) expose their NuGet v3 API endpoints. The current `ServiceIndexResolver` assumes all sources follow the standard NuGet.org pattern (append `/v3/index.json`), but providers like Artifactory require different URL patterns or content negotiation headers.

**Core Problem**: Artifactory returns HTTP 406 when requesting `<baseUrl>/v3/index.json` because it expects the v3 segment to be injected mid-path or accessed without the `/index.json` suffix. Other providers have similar quirks (Azure Artifacts uses different auth patterns, GitHub requires specific headers, etc.).

**Solution Approach**: Apply **Strategy Pattern** for provider-specific resolution logic, **Factory Pattern** to instantiate the correct strategy, and **Chain of Responsibility** for fallback URL patterns. This preserves the existing `ServiceIndexResolver` public API while making resolution logic extensible and testable.

**Key Benefits**:
- ✅ **Open/Closed Principle**: Add new providers without modifying existing strategies
- ✅ **Single Responsibility**: Each strategy handles one provider's quirks
- ✅ **Testability**: Mock strategies independently, test fallback chains in isolation
- ✅ **Maintainability**: Provider logic co-located, clear extension points

---

## ✅ Consolidated Todo List

### Phase 1: Core Abstractions (Foundation)

- [ ] **1.1** Create `IServiceIndexResolutionStrategy` interface (see [Strategy Contract](#strategy-contract))
- [ ] **1.2** Create `ServiceIndexResolutionContext` data structure (see [Resolution Context](#resolution-context))
- [ ] **1.3** Create `ProviderStrategyFactory` (see [Factory Implementation](#factory-implementation))
- [ ] **1.4** Add unit tests for factory registration/lookup

### Phase 2: Provider Strategies (Concrete Implementations)

- [ ] **2.1** Implement `NuGetOrgStrategy` (baseline, single URL attempt) (see [NuGet.org Strategy](#nugetorg-strategy))
- [ ] **2.2** Implement `ArtifactoryStrategy` with fallback chain (see [Artifactory Strategy](#artifactory-strategy))
- [ ] **2.3** Implement `AzureArtifactsStrategy` with bearer auth handling (see [Azure Artifacts Strategy](#azure-artifacts-strategy))
- [ ] **2.4** Implement `GitHubStrategy` with API key headers (see [GitHub Strategy](#github-strategy))
- [ ] **2.5** Implement `DefaultStrategy` for custom/unknown providers (see [Default Strategy](#default-strategy))
- [ ] **2.6** Add unit tests for each strategy's URL generation and error handling

### Phase 3: Integration with ServiceIndexResolver

- [ ] **3.1** Refactor `ServiceIndexResolver.resolve()` to use strategy pattern (see [Resolver Integration](#resolver-integration))
- [ ] **3.2** Add strategy selection logic based on `PackageSource.provider`
- [ ] **3.3** Preserve existing cache behavior (cache successful resolutions under original indexUrl)
- [ ] **3.4** Add logging for strategy selection and fallback attempts
- [ ] **3.5** Update unit tests for `ServiceIndexResolver` to cover all providers

### Phase 4: Configuration & Extensibility

- [ ] **4.1** Add provider-specific metadata to `PackageSource` (see [Provider Metadata](#provider-metadata))
- [ ] **4.2** Support custom Accept headers per provider
- [ ] **4.3** Support custom retry policies per provider
- [ ] **4.4** Add configuration option to override default strategies
- [ ] **4.5** Document provider-specific quirks in API docs

### Phase 5: Testing & Validation

- [ ] **5.1** Add integration tests for real Artifactory feeds (if available)
- [ ] **5.2** Add integration tests for Azure Artifacts (mock auth)
- [ ] **5.3** Add E2E test with multiple providers in nuget.config
- [ ] **5.4** Validate backward compatibility (existing nuget.org flows unchanged)
- [ ] **5.5** Performance test: strategy selection overhead < 1ms

### Phase 6: Documentation & Migration

- [ ] **6.1** Update AGENTS.md with strategy pattern usage
- [ ] **6.2** Create provider compatibility matrix in README
- [ ] **6.3** Add troubleshooting guide for 406/401/403 errors
- [ ] **6.4** Document how to add custom provider strategies
- [ ] **6.5** Update CHANGELOG with provider support enhancements

---

## 📐 Detailed Design

### <a name="strategy-contract"></a>Strategy Contract

```typescript
// src/api/strategies/IServiceIndexResolutionStrategy.ts

/**
 * Context passed to resolution strategies.
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
 * Result of a resolution attempt.
 */
export type ResolutionAttempt =
  | { success: true; serviceIndex: ServiceIndex; resolvedUrl: string }
  | { success: false; error: AppError; attemptedUrl: string };

/**
 * Strategy for resolving service index for a specific provider.
 *
 * Strategies implement provider-specific logic for:
 * - Generating candidate URLs (with fallbacks for quirky providers)
 * - Setting appropriate HTTP headers (Accept, User-Agent, auth)
 * - Validating service index responses
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
```

### <a name="resolution-context"></a>Resolution Context

Context object encapsulates all data needed for resolution, avoiding parameter explosion in strategy methods.

```typescript
// src/api/strategies/ServiceIndexResolutionContext.ts

export interface ServiceIndexResolutionContext {
  readonly indexUrl: string;
  readonly source: PackageSource;
  readonly http: IHttpClient;
  readonly logger: ILogger;
  readonly signal?: AbortSignal;
}

export function createResolutionContext(
  indexUrl: string,
  source: PackageSource,
  http: IHttpClient,
  logger: ILogger,
  signal?: AbortSignal,
): ServiceIndexResolutionContext {
  return { indexUrl, source, http, logger, signal };
}
```

### <a name="factory-implementation"></a>Factory Implementation

Factory pattern selects the appropriate strategy based on provider type.

```typescript
// src/api/strategies/ProviderStrategyFactory.ts

/**
 * Factory for creating provider-specific resolution strategies.
 *
 * Applies Factory Pattern to encapsulate strategy instantiation.
 * Strategies are registered at initialization and selected based
 * on PackageSourceProvider type.
 *
 * @example
 * ```typescript
 * const factory = new ProviderStrategyFactory();
 * const strategy = factory.getStrategy('artifactory');
 * const result = await strategy.resolve(context);
 * ```
 */
export class ProviderStrategyFactory {
  private readonly strategies = new Map<PackageSourceProvider, IServiceIndexResolutionStrategy>();

  constructor() {
    // Register default strategies
    this.register(new NuGetOrgStrategy());
    this.register(new ArtifactoryStrategy());
    this.register(new AzureArtifactsStrategy());
    this.register(new GitHubStrategy());
    this.register(new MyGetStrategy());
    this.register(new DefaultStrategy());
  }

  /**
   * Register a custom strategy (for extensibility).
   */
  register(strategy: IServiceIndexResolutionStrategy): void {
    this.strategies.set(strategy.provider, strategy);
  }

  /**
   * Get strategy for a provider type.
   * Falls back to DefaultStrategy if provider not found.
   */
  getStrategy(provider: PackageSourceProvider): IServiceIndexResolutionStrategy {
    return this.strategies.get(provider) ?? this.strategies.get('custom')!;
  }
}
```

### <a name="nugetorg-strategy"></a>NuGet.org Strategy

Baseline strategy with no fallbacks (NuGet.org is spec-compliant).

```typescript
// src/api/strategies/NuGetOrgStrategy.ts

export class NuGetOrgStrategy implements IServiceIndexResolutionStrategy {
  readonly provider = 'nuget.org' as const;

  async resolve(context: ServiceIndexResolutionContext): Promise<Result<ServiceIndex, AppError>> {
    const { indexUrl, http, signal, logger } = context;

    logger.debug(`[NuGetOrgStrategy] Fetching service index: ${indexUrl}`);

    if (signal?.aborted) {
      return fail({ code: 'Network', message: 'Request was cancelled' });
    }

    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'OPM-VSCode-Extension/1.0',
    };

    const result = await http.get<ServiceIndex>(indexUrl, { signal, headers });

    if (!result.success) {
      logger.warn(`[NuGetOrgStrategy] Failed to fetch service index: ${result.error.message}`);
      return result;
    }

    return this.validateServiceIndex(result.value);
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
```

### <a name="artifactory-strategy"></a>Artifactory Strategy

Chain of Responsibility for URL fallbacks.

```typescript
// src/api/strategies/ArtifactoryStrategy.ts

/**
 * Resolution strategy for JFrog Artifactory NuGet feeds.
 *
 * Artifactory has non-standard service index URL patterns:
 * 1. Some instances reject `/v3/index.json` (return HTTP 406)
 * 2. Requires `/v3` injected mid-path (e.g., `/artifactory/api/nuget/v3/repo-name/index.json`)
 * 3. Some feeds work with `/v3` without `/index.json` suffix
 *
 * This strategy implements Chain of Responsibility to try multiple URL patterns.
 *
 * @see https://www.jfrog.com/confluence/display/JFROG/NuGet+Repositories
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
      if (result.error.code === 'ApiError' && 
          (result.error.statusCode === 401 || result.error.statusCode === 403)) {
        logger.warn(`[ArtifactoryStrategy] Authentication failed, stopping retries`);
        break;
      }

      // Continue to next candidate URL
      logger.debug(`[ArtifactoryStrategy] Attempt failed: ${result.error.message}`);
    }

    return fail(lastError ?? {
      code: 'ApiError',
      message: 'All Artifactory URL patterns failed',
      statusCode: 0,
    });
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
      'Accept': 'application/json',
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
```

### <a name="azure-artifacts-strategy"></a>Azure Artifacts Strategy

Handles Azure DevOps bearer token authentication.

```typescript
// src/api/strategies/AzureArtifactsStrategy.ts

/**
 * Resolution strategy for Azure Artifacts NuGet feeds.
 *
 * Azure Artifacts requires:
 * - Bearer token authentication (Personal Access Token or Azure AD token)
 * - Specific User-Agent header
 * - Standard /v3/index.json URL pattern
 *
 * @see https://learn.microsoft.com/azure/devops/artifacts/nuget/nuget-exe
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
      'Accept': 'application/json',
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
```

### <a name="github-strategy"></a>GitHub Strategy

Handles GitHub Packages API key authentication.

```typescript
// src/api/strategies/GitHubStrategy.ts

/**
 * Resolution strategy for GitHub Packages NuGet feeds.
 *
 * GitHub Packages requires:
 * - Personal Access Token via X-NuGet-ApiKey header (or Authorization header)
 * - Standard /index.json URL pattern
 * - User-Agent header
 *
 * @see https://docs.github.com/packages/working-with-a-github-packages-registry/working-with-the-nuget-registry
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
      'Accept': 'application/json',
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
```

### <a name="default-strategy"></a>Default Strategy

Fallback for custom/unknown providers.

```typescript
// src/api/strategies/DefaultStrategy.ts

/**
 * Default resolution strategy for custom/unknown providers.
 *
 * Attempts standard NuGet v3 patterns with minimal assumptions.
 * Suitable for:
 * - Custom private feeds
 * - MyGet (follows standard spec)
 * - Other spec-compliant feeds
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
      'Accept': 'application/json',
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
```

### <a name="resolver-integration"></a>Resolver Integration

Refactor `ServiceIndexResolver` to delegate to strategies.

```typescript
// src/api/services/serviceIndexResolver.ts (refactored resolve method)

export class ServiceIndexResolver {
  private readonly cache = new Map<string, ServiceIndex>();
  private readonly strategyFactory: ProviderStrategyFactory;

  constructor(
    private readonly http: IHttpClient,
    private readonly logger: ILogger,
    strategyFactory?: ProviderStrategyFactory,
  ) {
    this.strategyFactory = strategyFactory ?? new ProviderStrategyFactory();
  }

  async resolve(
    indexUrl: string,
    signal?: AbortSignal,
    headers?: Record<string, string>,
    source?: PackageSource, // NEW: pass source for provider detection
  ): Promise<Result<ServiceIndex, AppError>> {
    // Check cache first
    const cached = this.cache.get(indexUrl);
    if (cached) {
      this.logger.debug(`Using cached service index: ${indexUrl}`);
      return ok(cached);
    }

    // Determine provider type (default to 'custom' if source not provided)
    const provider = source?.provider ?? 'custom';
    const strategy = this.strategyFactory.getStrategy(provider);

    this.logger.debug(`Using ${strategy.provider} strategy for: ${indexUrl}`);

    // Create resolution context
    const context = createResolutionContext(
      indexUrl,
      source ?? {
        id: 'unknown',
        name: 'Unknown',
        provider: 'custom',
        indexUrl,
        enabled: true,
      },
      this.http,
      this.logger,
      signal,
    );

    // Delegate to strategy
    const result = await strategy.resolve(context);

    if (!result.success) {
      return result;
    }

    // Cache successful resolution
    this.cache.set(indexUrl, result.value);
    this.logger.debug(`Cached service index for ${indexUrl}`);

    return ok(result.value);
  }

  // ... existing getSearchUrl, getRegistrationUrl methods unchanged
}
```

### <a name="provider-metadata"></a>Provider Metadata

Extend `PackageSource` to support provider-specific configuration.

```typescript
// src/domain/models/nugetApiOptions.ts (additions)

/**
 * Provider-specific metadata options.
 */
export interface ProviderMetadata {
  /** Custom Accept header override */
  acceptHeader?: string;

  /** Custom User-Agent override */
  userAgent?: string;

  /** Retry policy override */
  retryPolicy?: {
    maxAttempts: number;
    backoffMs: number;
  };

  /** Additional HTTP headers */
  customHeaders?: Record<string, string>;

  /** Artifactory-specific: prefer v3 injection pattern */
  artifactory?: {
    useV3Injection: boolean;
  };

  /** Azure-specific: organization name for URL construction */
  azure?: {
    organization: string;
    project?: string;
  };
}

export interface PackageSource {
  // ... existing fields
  
  /** Provider-specific options */
  metadata?: ProviderMetadata; // CHANGED: from Record<string, unknown>
}
```

---

## 🧪 Testing Strategy

### Unit Tests

```typescript
// src/api/strategies/__tests__/ArtifactoryStrategy.test.ts

describe('ArtifactoryStrategy', () => {
  test('generates correct candidate URLs', () => {
    const strategy = new ArtifactoryStrategy();
    const urls = (strategy as any).generateCandidateUrls(
      'https://artifactory.example.com/api/nuget/v3/my-repo/index.json'
    );
    
    expect(urls).toEqual([
      'https://artifactory.example.com/api/nuget/v3/my-repo/index.json', // original
      'https://artifactory.example.com/api/nuget/v3/my-repo/v3/index.json', // v3 injection
      'https://artifactory.example.com/api/nuget/v3/my-repo/v3', // v3 only
    ]);
  });

  test('stops retries on 401 auth error', async () => {
    const mockHttp = {
      get: mock(() => Promise.resolve(fail({ code: 'ApiError', message: 'Unauthorized', statusCode: 401 }))),
    };
    
    const strategy = new ArtifactoryStrategy();
    const context = createResolutionContext(/* ... */, mockHttp, /* ... */);
    
    await strategy.resolve(context);
    
    expect(mockHttp.get).toHaveBeenCalledTimes(1); // Should not retry
  });

  test('continues retries on 406 error', async () => {
    const mockHttp = {
      get: mock()
        .mockResolvedValueOnce(fail({ code: 'ApiError', message: 'Not Acceptable', statusCode: 406 }))
        .mockResolvedValueOnce(ok({ version: '3.0.0', resources: [] })),
    };
    
    const strategy = new ArtifactoryStrategy();
    const context = createResolutionContext(/* ... */, mockHttp, /* ... */);
    
    const result = await strategy.resolve(context);
    
    expect(result.success).toBe(true);
    expect(mockHttp.get).toHaveBeenCalledTimes(2);
  });
});
```

### Integration Tests

```typescript
// test/integration/artifactory-resolution.integration.test.ts

describe('Artifactory Resolution Integration', () => {
  test('resolves real Artifactory feed', async () => {
    const resolver = new ServiceIndexResolver(new NodeHttpClient(), logger);
    const source: PackageSource = {
      id: 'artifactory-test',
      name: 'Test Artifactory',
      provider: 'artifactory',
      indexUrl: 'https://artifactory.example.com/api/nuget/v3/my-repo',
      enabled: true,
      auth: { type: 'basic', username: 'user', password: 'pass' },
    };
    
    const result = await resolver.resolve(source.indexUrl, undefined, undefined, source);
    
    expect(result.success).toBe(true);
    if (result.success) {
      const searchUrl = findResource(result.value, ResourceTypes.SearchQueryService);
      expect(searchUrl).toBeTruthy();
    }
  }, 10000);
});
```

---

## 📚 References

### Official Documentation

- **NuGet v3 Protocol**: https://learn.microsoft.com/nuget/api/overview
- **JFrog Artifactory NuGet**: https://www.jfrog.com/confluence/display/JFROG/NuGet+Repositories
- **Azure Artifacts NuGet**: https://learn.microsoft.com/azure/devops/artifacts/nuget/nuget-exe
- **GitHub Packages NuGet**: https://docs.github.com/packages/working-with-a-github-packages-registry/working-with-the-nuget-registry
- **MyGet NuGet**: https://docs.myget.org/docs/reference/nuget

### Gang of Four Patterns Applied

1. **Strategy Pattern** (`IServiceIndexResolutionStrategy`) - Encapsulates provider-specific resolution algorithms
2. **Factory Pattern** (`ProviderStrategyFactory`) - Creates appropriate strategy instances
3. **Chain of Responsibility** (`ArtifactoryStrategy.generateCandidateUrls`) - Tries multiple URL patterns in sequence
4. **Template Method** (implicit in base validation) - Common validation steps with provider-specific overrides

### Related Files

- `src/api/services/serviceIndexResolver.ts` - Main resolver (facade)
- `src/domain/models/nugetApiOptions.ts` - Provider types and metadata
- `src/env/node/nugetConfigParser.ts` - Config parsing with provider detection
- `docs/technical/ELEGANT-REDESIGN.md` - Overall architecture guidance

---

## 🎯 Success Criteria

- [ ] All provider strategies have >90% unit test coverage
- [ ] Integration tests pass against real Artifactory/Azure/GitHub feeds
- [ ] Backward compatibility: existing nuget.org flows unchanged
- [ ] Performance: strategy selection adds <1ms overhead
- [ ] Documentation: provider compatibility matrix complete
- [ ] Zero regressions in existing E2E tests
- [ ] AGENTS.md updated with pattern usage examples

---

## 🚀 Implementation Order

1. **Phase 1** (1-2 days): Core abstractions, factory, baseline strategy
2. **Phase 2** (2-3 days): Provider strategies (Artifactory, Azure, GitHub, Default)
3. **Phase 3** (1 day): Integration with ServiceIndexResolver, preserve cache behavior
4. **Phase 4** (1 day): Configuration enhancements, metadata support
5. **Phase 5** (2 days): Comprehensive testing (unit, integration, E2E)
6. **Phase 6** (1 day): Documentation and migration guide

**Total Estimate**: 7-10 days (includes testing and documentation)

---

**Next Steps**: Review plan, adjust priorities, begin Phase 1 implementation.
