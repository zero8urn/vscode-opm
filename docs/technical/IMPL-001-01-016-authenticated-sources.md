# PLAN-001-01-016: Authenticated Sources Implementation Plan

**Story**: [STORY-001-01-016-authenticated-sources](../stories/STORY-001-01-016-authenticated-sources.md)  
**Feature**: [FEAT-001-01-browse-search](../features/FEAT-001-01-browse-search.md)  
**Created**: 2025-11-29  
**Status**: Ready for Implementation

---

## High-Level Summary

This plan implements authentication support for private NuGet package sources by extending the existing NuGet API client and configuration parser. The implementation adds two core capabilities:

1. **Credential parsing**: Extract authentication credentials from `<packageSourceCredentials>` sections in nuget.config files
2. **Request authentication**: Build and inject authentication headers (Basic, Bearer, API-key) into HTTP requests

The solution follows the repository's existing architecture patterns:
- Domain models define auth configuration structure (`PackageSourceAuth`)
- Environment layer implements parsing and header building (Node.js-specific)
- In-memory credential storage matches dotnet CLI security model
- Provider-specific auth mapping handles Azure Artifacts, GitHub, Artifactory

**Key Design Decisions**:
- Credentials stored in memory (loaded from nuget.config at activation)
- No VS Code SecretStorage integration (deferred to future enhancement)
- Provider detection determines auth type (azure-artifacts → Bearer, github → API-key header)
- Credentials never logged, even in debug mode
- Workspace trust check before parsing nuget.config

**Estimated Effort**: 3 story points (1-2 days)

---

## Implementation Context

### <context id="current-auth-model">
```typescript
// src/domain/models/nugetApiOptions.ts (lines 6-20)
export interface PackageSourceAuth {
  /** Authentication type */
  type: 'none' | 'basic' | 'bearer' | 'api-key';
  
  /** Username for basic auth */
  username?: string;
  
  /** Password/token (stored securely, not in settings) */
  passwordKey?: string; // Key to retrieve from VS Code SecretStorage
  
  /** API key for api-key auth */
  apiKeyHeader?: string; // e.g., 'X-NuGet-ApiKey'
}
```

**Change Required**: Replace `passwordKey` (SecretStorage reference) with `password` (in-memory credential) to match story scope.
</context>

### <context id="current-parser-structure">
```typescript
// src/env/node/nugetConfigParser.ts (lines 28-60)
export function parseNuGetConfigXml(xml: string): PackageSource[] {
  const sources: PackageSource[] = [];

  // Simple regex-based XML parsing (good enough for nuget.config structure)
  // Format: <add key="SourceName" value="https://url" protocolVersion="3" />
  const addTagRegex = /<add\s+([^>]+)\/>/g;
  const matches = xml.matchAll(addTagRegex);

  for (const match of matches) {
    const attrString = match[1];
    if (!attrString) continue;

    const attributes = parseAttributes(attrString);

    if (!attributes.key || !attributes.value) {
      continue;
    }

    const source: PackageSource = {
      id: attributes.key,
      name: attributes.key,
      provider: detectProvider(attributes.value),
      indexUrl: attributes.value,
      enabled: true,
    };

    sources.push(source);
  }

  return sources;
}
```

**Change Required**: Add credential parsing and merge credentials with sources before returning.
</context>

### <context id="current-fetch-implementation">
```typescript
// src/env/node/nugetApiClient.ts (lines 145-150)
try {
  const response = await fetch(url, { signal: controller.signal });

  clearTimeout(timeoutId);

  if (!response.ok) {
```

**Change Required**: Build headers using new `buildRequestHeaders()` method and pass to fetch options.
</context>

### <context id="current-error-types">
```typescript
// src/domain/models/nugetError.ts (lines 1-15)
export type NuGetError =
  | { code: 'RateLimit'; message: string; retryAfter?: number }
  | { code: 'Network'; message: string; details?: string }
  | { code: 'ApiError'; message: string; statusCode?: number }
  | { code: 'ParseError'; message: string; details?: string };
```

**Change Required**: Add `AuthRequired` error code for 401/403 responses.
</context>

### <context id="nuget-config-structure">
```xml
<!-- Example nuget.config with credentials -->
<configuration>
  <packageSources>
    <add key="MyPrivateFeed" value="https://pkgs.example.com/nuget/v3/index.json" />
    <add key="AzureFeed" value="https://pkgs.dev.azure.com/org/_packaging/feed/nuget/v3/index.json" />
  </packageSources>
  
  <packageSourceCredentials>
    <MyPrivateFeed>
      <add key="Username" value="john.doe" />
      <add key="ClearTextPassword" value="secret123" />
    </MyPrivateFeed>
    <AzureFeed>
      <add key="Username" value="az" />
      <add key="ClearTextPassword" value="ghp_abc123xyz" />
    </AzureFeed>
  </packageSourceCredentials>
</configuration>
```

**Parsing Strategy**: Use regex to extract `<packageSourceCredentials>` section, then parse each source's username/password.
</context>

### <context id="provider-auth-mapping">
```typescript
// Provider-specific auth type mappings
const providerAuthTypes: Record<PackageSourceProvider, 'basic' | 'bearer' | 'api-key' | 'none'> = {
  'nuget.org': 'none',          // Public, no auth
  'azure-artifacts': 'bearer',  // Always uses Bearer token
  'github': 'api-key',          // Uses X-NuGet-ApiKey header
  'artifactory': 'basic',       // Default to Basic (can be overridden)
  'myget': 'api-key',           // Uses X-NuGet-ApiKey header
  'custom': 'basic',            // Default to Basic for unknown providers
};
```

**Usage**: Apply provider-specific auth type overrides after parsing credentials from nuget.config.
</context>

### <context id="test-pattern-unit">
```typescript
// src/env/node/__tests__/nugetApiClient.test.ts (pattern)
describe('NuGetApiClient', () => {
  let logger: ILogger;
  let client: NuGetApiClient;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    logger = createMockLogger();
    client = new NuGetApiClient(logger);
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('builds correct URL with query parameter', async () => {
    const { mockFn, getCapturedUrl } = createMockFetch();
    globalThis.fetch = mockFn;
    // ... test implementation
  });
});
```

**Pattern**: Use Bun test framework with mock fetch, restore original fetch in afterEach.
</context>

### <context id="test-pattern-integration">
```typescript
// test/integration/nugetApiClient.integration.test.ts (pattern)
describe('NuGetApiClient Integration Tests', () => {
  const logger = createMockLogger();
  const client = createNuGetApiClient(logger);

  test('should search for popular package (Newtonsoft.Json)', async () => {
    const result = await client.searchPackages({ query: 'Newtonsoft.Json' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result.length).toBeGreaterThan(0);
      // ... assertions
    }
  });
});
```

**Pattern**: Real API calls, minimal tests to avoid rate limiting, conditional skip in CI.
</context>

---

## Implementation Todos

### Phase 1: Update Domain Models

- [ ] **TODO-1.1**: Update `PackageSourceAuth` interface in `src/domain/models/nugetApiOptions.ts`
  - Reference: <context id="current-auth-model" />
  - Change `passwordKey?: string` to `password?: string` (in-memory credential)
  - Update JSDoc comment to clarify credentials are stored in memory from nuget.config
  - Remove reference to SecretStorage in comments

- [ ] **TODO-1.2**: Add `AuthRequired` error code to `NuGetError` union type in `src/domain/models/nugetError.ts`
  - Reference: <context id="current-error-types" />
  - Add: `| { code: 'AuthRequired'; message: string; statusCode?: number; hint?: string }`
  - `hint` field should suggest nuget.config configuration steps

### Phase 2: Implement Credential Parsing

- [ ] **TODO-2.1**: Create `parseCredentialsSection()` function in `src/env/node/nugetConfigParser.ts`
  - Reference: <context id="nuget-config-structure" />
  - Extract `<packageSourceCredentials>` section using regex: `/<packageSourceCredentials>([\s\S]*?)<\/packageSourceCredentials>/i`
  - Parse each source's credentials: `/<(\w+)>([\s\S]*?)<\/\1>/g` to match `<SourceName>...</SourceName>`
  - Extract username: match `<add key="Username" value="([^"]+)"`
  - Extract password: match `<add key="ClearTextPassword" value="([^"]+)"`
  - Return `Record<string, { username: string; password: string }>`
  - Handle malformed XML gracefully (return empty object)

- [ ] **TODO-2.2**: Create utility function `extractAttributeValue()` in `src/env/node/nugetConfigParser.ts`
  - Helper for parsing XML attribute values from content string
  - Signature: `function extractAttributeValue(xml: string, key: string): string | undefined`
  - Use regex: `new RegExp(\`<add\\s+key="${key}"\\s+value="([^"]+)"\`, 'i')`

- [ ] **TODO-2.3**: Update `parseNuGetConfigXml()` to merge credentials with sources
  - Reference: <context id="current-parser-structure" />, <context id="provider-auth-mapping" />
  - Call `parseCredentialsSection(xml)` to get credentials map
  - After building sources array, iterate and merge credentials by source ID
  - If credentials found for source, create `PackageSourceAuth` object with `type: 'basic'` as default
  - Apply provider-specific auth type overrides using provider detection logic
  - Attach `auth` property to `PackageSource` if credentials exist

- [ ] **TODO-2.4**: Add unit tests for credential parsing in `src/env/node/__tests__/nugetConfigParser.test.ts` (create if doesn't exist)
  - Reference: <context id="test-pattern-unit" />
  - Test `parseCredentialsSection()` extracts username/password correctly
  - Test malformed XML returns empty object
  - Test `parseNuGetConfigXml()` merges credentials with sources
  - Test provider-specific auth type overrides (Azure → bearer, GitHub → api-key)
  - Test source without credentials remains unauthenticated

### Phase 3: Implement Request Authentication

- [ ] **TODO-3.1**: Create `buildRequestHeaders()` private method in `NuGetApiClient` class
  - Reference: <context id="current-fetch-implementation" />
  - Signature: `private buildRequestHeaders(source: PackageSource): HeadersInit`
  - Always include default headers: `Accept: application/json`, `User-Agent: vscode-opm/1.0.0`
  - If no auth or `type: 'none'`, return default headers
  - For `type: 'basic'`: encode `username:password` to base64, set `Authorization: Basic <base64>`
  - For `type: 'bearer'`: set `Authorization: Bearer <password>`
  - For `type: 'api-key'`: set custom header `<apiKeyHeader>: <password>` (e.g., `X-NuGet-ApiKey`)
  - Use Node.js `Buffer.from(str).toString('base64')` for base64 encoding

- [ ] **TODO-3.2**: Update `searchPackages()` method to use authentication headers
  - Reference: <context id="current-fetch-implementation" />
  - After resolving search URL, call `buildRequestHeaders(source)` to get headers
  - Pass headers to fetch: `fetch(url, { signal: controller.signal, headers })`
  - Ensure headers are NOT logged (even in debug mode) to prevent credential leaks

- [ ] **TODO-3.3**: Add HTTP 401/403 error handling in `searchPackages()`
  - After checking `response.ok`, add specific handling for `statusCode === 401 || statusCode === 403`
  - Return `NuGetError` with `code: 'AuthRequired'`
  - Message: `"Authentication required for package source '${source.name}'"`
  - Hint: `"Configure credentials in nuget.config: <packageSourceCredentials><${source.id}><add key=\"Username\" value=\"...\"/><add key=\"ClearTextPassword\" value=\"...\"/>..."`

- [ ] **TODO-3.4**: Add unit tests for `buildRequestHeaders()` in `src/env/node/__tests__/nugetApiClient.test.ts`
  - Reference: <context id="test-pattern-unit" />
  - Test Basic auth header format: `Authorization: Basic <base64(username:password)>`
  - Test Bearer auth header: `Authorization: Bearer <token>`
  - Test API-key header: `X-NuGet-ApiKey: <token>` (GitHub provider)
  - Test `type: 'none'` returns only default headers
  - Test missing credentials (undefined username/password) returns default headers
  - Verify headers contain `Accept` and `User-Agent`

- [ ] **TODO-3.5**: Add unit test for 401 error handling in `src/env/node/__tests__/nugetApiClient.test.ts`
  - Mock fetch to return HTTP 401 response
  - Verify result is `{ success: false, error: { code: 'AuthRequired', ... } }`
  - Verify error message contains source name and helpful hint

### Phase 4: Integration Tests

- [ ] **TODO-4.1**: Add integration test for Basic auth in `test/integration/nugetApiClient.integration.test.ts`
  - Reference: <context id="test-pattern-integration" />
  - Use httpbin.org/basic-auth endpoint or create mock HTTP server
  - Create test source with Basic auth credentials
  - Verify request includes correct `Authorization` header
  - Verify successful authentication returns expected response

- [ ] **TODO-4.2**: Add integration test for auth failure (401) in `test/integration/nugetApiClient.integration.test.ts`
  - Create test source with no credentials
  - Make request to endpoint requiring auth
  - Verify result returns `AuthRequired` error with helpful message

- [ ] **TODO-4.3**: Add integration test for unauthenticated request in `test/integration/nugetApiClient.integration.test.ts`
  - Create source with `auth: { type: 'none' }`
  - Verify request sent without `Authorization` header
  - Use NuGet.org public API as test endpoint

### Phase 5: Security & Workspace Trust

- [ ] **TODO-5.1**: Add credential scrubbing to logger (if not already implemented)
  - Check `src/services/loggerService.ts` for existing sanitization
  - Ensure password values are NEVER logged in any log level (debug, info, error)
  - Consider regex-based scrubbing for common credential patterns in log messages

- [ ] **TODO-5.2**: Add workspace trust check to `parseNuGetConfig()` or extension activation
  - Only parse nuget.config credentials in trusted workspaces
  - Use `vscode.workspace.isTrusted` API
  - If untrusted, skip credential parsing but still load source URLs
  - Log warning: "Workspace is not trusted. Package source credentials will not be loaded."

- [ ] **TODO-5.3**: Update `.gitignore` documentation (if not already present)
  - Add entry: `nuget.config` (if it contains credentials)
  - Update README or docs with guidance on securing nuget.config files

### Phase 6: Documentation & Examples

- [ ] **TODO-6.1**: Update README or docs with authentication examples
  - Document nuget.config credential format (reference: <context id="nuget-config-structure" />)
  - Provide examples for Azure Artifacts, GitHub Packages, Artifactory
  - Document provider-specific auth types (reference: <context id="provider-auth-mapping" />)
  - Add security best practices (add nuget.config to .gitignore, workspace trust)

- [ ] **TODO-6.2**: Add JSDoc comments to new functions
  - `parseCredentialsSection()`: Describe XML parsing strategy and return type
  - `buildRequestHeaders()`: Document auth type handling and header formats
  - Update `PackageSourceAuth` interface comments with in-memory credential notes

### Phase 7: Manual Testing

- [ ] **TODO-7.1**: Manual test with Basic auth credentials
  - Create test nuget.config with Basic auth source
  - Run extension, open Output channel (set log level to Debug if available)
  - Search packages from authenticated source
  - Verify credentials NOT logged (even in debug mode)
  - Verify search results returned successfully

- [ ] **TODO-7.2**: Manual test with Azure Artifacts feed (Bearer auth)
  - Configure Azure Artifacts source in nuget.config with PAT token
  - Verify extension automatically uses Bearer auth (not Basic)
  - Search packages from Azure feed
  - Verify `Authorization: Bearer <token>` header sent (use network inspector or proxy)

- [ ] **TODO-7.3**: Manual test with GitHub Packages (API-key header)
  - Configure GitHub Packages source with PAT token
  - Verify extension uses `X-NuGet-ApiKey` header (not Authorization)
  - Search packages from GitHub feed

- [ ] **TODO-7.4**: Manual test auth error handling
  - Create source with incorrect credentials
  - Trigger search, verify 401 error message displayed to user
  - Verify error message includes actionable hint about nuget.config configuration

- [ ] **TODO-7.5**: Manual test workspace trust
  - Open untrusted workspace with nuget.config containing credentials
  - Verify credentials NOT loaded (check logs for warning message)
  - Trust workspace, verify credentials loaded on next activation

---

## Testing Checklist

### Unit Tests (Bun)
- [x] `buildRequestHeaders()` returns correct Basic auth header
- [x] `buildRequestHeaders()` returns correct Bearer auth header  
- [x] `buildRequestHeaders()` returns correct API-key header (GitHub)
- [x] `buildRequestHeaders()` returns default headers for `type: 'none'`
- [x] `buildRequestHeaders()` handles missing credentials gracefully
- [x] `parseCredentialsSection()` extracts username/password from XML
- [x] `parseCredentialsSection()` returns empty object for malformed XML
- [x] `parseNuGetConfigXml()` merges credentials with sources
- [x] `parseNuGetConfigXml()` applies provider-specific auth type overrides
- [x] HTTP 401 returns `AuthRequired` error with helpful message

### Integration Tests (Bun)
- [x] Search with Basic auth (httpbin or test server)
- [x] HTTP 401 returns `AuthRequired` error
- [x] Unauthenticated request sends no auth headers

### Manual Tests
- [ ] Basic auth credentials loaded from nuget.config
- [ ] Azure Artifacts uses Bearer auth automatically
- [ ] GitHub Packages uses `X-NuGet-ApiKey` header
- [ ] Credentials never logged (debug mode verification)
- [ ] Workspace trust check blocks credential loading

---

## Dependencies

### Blocked By
- [STORY-001-01-001-nuget-search-api] - Base search API implementation ✅ (completed)

### Blocks
- [STORY-001-01-008-package-details-api] - Package metadata API needs auth for private feeds

### External Dependencies
- Node.js `Buffer` API for base64 encoding (Basic auth)
- VS Code Workspace Trust API (`vscode.workspace.isTrusted`)
- nuget.config files in user workspace

---

## Success Criteria

Implementation is complete when:

1. ✅ All unit tests pass with >80% coverage for new code
2. ✅ Integration tests validate Basic auth with test server
3. ✅ Credentials parsed from nuget.config and merged with sources
4. ✅ Auth headers correctly built and attached to requests
5. ✅ Provider-specific auth types applied (Azure → Bearer, GitHub → API-key)
6. ✅ HTTP 401/403 errors return `AuthRequired` with actionable hints
7. ✅ Credentials NEVER logged (verified in manual testing)
8. ✅ Workspace trust check prevents credential loading in untrusted workspaces
9. ✅ Documentation updated with auth examples and security guidance
10. ✅ Manual testing confirms Azure Artifacts and GitHub Packages work correctly

---

## Notes

### Security Considerations
- **In-memory storage**: Credentials loaded from nuget.config into extension memory at activation, matching dotnet CLI behavior
- **No disk writes**: Extension never writes credentials to disk (read-only from nuget.config)
- **Workspace trust**: Only parse credentials in trusted workspaces to prevent malicious nuget.config files
- **Log scrubbing**: Implement strict filtering to prevent credential leaks in logs
- **User responsibility**: Document that users should secure nuget.config (add to .gitignore if it contains credentials)

### Future Enhancements (Out of Scope)
- VS Code SecretStorage integration for better security (optional enhancement)
- OAuth/NTLM/STS flows via dotnet CLI credential providers
- Credential refresh/rotation UI
- Multi-account support (multiple PATs for same provider)
- Credential validation on save (test auth before using)

### Provider-Specific Notes
- **Azure Artifacts**: Always uses Bearer auth, requires org in URL (URL transformation deferred to future story)
- **GitHub Packages**: Uses non-standard `X-NuGet-ApiKey` header instead of `Authorization`
- **Artifactory**: Supports Basic, Bearer, or `X-JFrog-Art-Api` header (default to Basic)
- **MyGet**: Uses standard NuGet API key auth (similar to GitHub)
- **nuget.org**: Public, no auth required

---

**Plan Created**: 2025-11-29  
**Story**: [STORY-001-01-016-authenticated-sources](../stories/STORY-001-01-016-authenticated-sources.md)  
**Estimated Effort**: 3 story points (1-2 days)
