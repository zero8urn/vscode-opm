# STORY-001-01-016-authenticated-sources

**Feature**: [FEAT-001-01-browse-search](../features/FEAT-001-01-browse-search.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Not Started  
**Priority**: High  
**Estimate**: 3 Story Points  
**Created**: 2025-11-29  
**Last Updated**: 2025-11-29  
**Follows**: [STORY-001-01-001-nuget-search-api](./STORY-001-01-001-nuget-search-api.md)

## User Story

**As a** developer using private NuGet feeds  
**I want** the extension to authenticate with package sources using credentials from nuget.config  
**So that** I can search and browse packages from authenticated sources (Azure Artifacts, GitHub Packages, Artifactory, etc.)

## Description

This story extends the NuGet API client (STORY-001-01-001) to support authenticated package sources. While the base search API implementation works for public nuget.org feeds, enterprise developers often need to access private feeds that require authentication.

The implementation adds two key capabilities:

1. **nuget.config credential parsing**: Parse `<packageSourceCredentials>` sections from nuget.config files to extract authentication configuration (username/password, tokens)
2. **Auth header injection**: Build and attach authentication headers (Basic, Bearer, API-key) to HTTP requests based on parsed credentials

Credentials are read from nuget.config on each extension activation and stored in memory for the session. This follows the same security model as the dotnet CLI, where nuget.config is the source of truth for package source credentials.

This enables seamless authentication to popular private package providers:
- **Azure Artifacts**: PAT tokens via Bearer auth
- **GitHub Packages**: PAT tokens via `X-NuGet-ApiKey` header
- **Artifactory**: Basic auth or API keys via custom headers
- **MyGet**: API keys
- **Self-hosted NuGet servers**: Basic/Bearer auth

The story does NOT include OAuth/NTLM/STS flows — those are delegated to the dotnet CLI (credential providers) in future stories.

## Acceptance Criteria

### Scenario: Basic Auth with Credentials from nuget.config
**Given** nuget.config contains:
```xml
<packageSourceCredentials>
  <MyPrivateFeed>
    <add key="Username" value="john.doe" />
    <add key="ClearTextPassword" value="secret123" />
  </MyPrivateFeed>
</packageSourceCredentials>
```
**When** the extension activates and parses nuget.config  
**Then** credentials should be loaded into memory  
**And** search requests to MyPrivateFeed should include `Authorization: Basic base64(john.doe:secret123)` header

### Scenario: Bearer Token for Azure Artifacts
**Given** nuget.config contains:
```xml
<packageSourceCredentials>
  <AzureFeed>
    <add key="Username" value="az" />
    <add key="ClearTextPassword" value="ghp_abc123xyz" />
  </AzureFeed>
</packageSourceCredentials>
```
**And** package source is configured with `provider: 'azure-artifacts'`  
**When** searching packages from this source  
**Then** requests should include `Authorization: Bearer ghp_abc123xyz` header

### Scenario: API Key Header for GitHub Packages
**Given** nuget.config contains:
```xml
<packageSourceCredentials>
  <GitHubFeed>
    <add key="Username" value="token" />
    <add key="ClearTextPassword" value="ghp_xyz789abc" />
  </GitHubFeed>
</packageSourceCredentials>
```
**And** package source is configured with `provider: 'github'`  
**When** searching packages  
**Then** requests should include `X-NuGet-ApiKey: ghp_xyz789abc` header

### Scenario: 401 Unauthorized Returns Clear Error
**Given** a package source requires auth but has no credentials in nuget.config  
**When** the API returns HTTP 401  
**Then** the extension should return a NuGetError with code 'AuthRequired'  
**And** error message should suggest configuring credentials in nuget.config

### Additional Criteria
- [x] `parseNuGetConfigXml()` extracts `<packageSourceCredentials>` section
- [x] Parsed credentials merged into `PackageSource.auth` during config parsing
- [x] `buildRequestHeaders()` method constructs auth headers based on `PackageSourceAuth`
- [x] Support for Basic, Bearer, and custom API-key header auth types
- [x] Provider-specific auth mapping (azure-artifacts → Bearer, github → X-NuGet-ApiKey)
- [x] Auth errors (401/403) return clear error messages with actionable guidance
- [x] Credentials never logged (even in debug mode)
- [x] Integration test with Basic auth test server

## Technical Implementation

### Key Components
- **File/Module**: `src/env/node/nugetApiClient.ts` - Add `buildRequestHeaders()` method
- **File/Module**: `src/env/node/nugetConfigParser.ts` - Add `parseCredentialsSection()` utility
- **File/Module**: `src/domain/models/nugetApiOptions.ts` - Update `PackageSourceAuth` to include credentials
- **File/Module**: `src/domain/models/nugetError.ts` - Add `AuthRequired` error code

### Technical Approach

#### 1. Update Auth Model
```typescript
// src/domain/models/nugetApiOptions.ts
export interface PackageSourceAuth {
  /** Authentication type */
  type: 'none' | 'basic' | 'bearer' | 'api-key';
  
  /** Username for basic auth */
  username?: string;
  
  /** Password/token (loaded from nuget.config into memory) */
  password?: string;
  
  /** API key header name (e.g., 'X-NuGet-ApiKey') */
  apiKeyHeader?: string;
}
```

#### 2. Auth Header Builder
```typescript
// src/env/node/nugetApiClient.ts
export class NuGetApiClient {
  private buildRequestHeaders(source: PackageSource): HeadersInit {
    const headers: HeadersInit = {
      'Accept': 'application/json',
      'User-Agent': 'vscode-opm/1.0.0',
    };

    if (!source.auth || source.auth.type === 'none') {
      return headers;
    }

    const { type, username, password, apiKeyHeader } = source.auth;

    switch (type) {
      case 'basic':
        if (username && password) {
          const encoded = Buffer.from(`${username}:${password}`).toString('base64');
          headers['Authorization'] = `Basic ${encoded}`;
        }
        break;

      case 'bearer':
        if (password) {
          headers['Authorization'] = `Bearer ${password}`;
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

  async searchPackages(...) {
    // ... resolve search URL ...
    const headers = this.buildRequestHeaders(source);
    const response = await fetch(url, { signal: controller.signal, headers });
    // ... rest of implementation ...
  }
}
```

#### 3. nuget.config Credential Parsing
```typescript
// src/env/node/nugetConfigParser.ts
function parseCredentialsSection(xml: string): Record<string, PackageSourceAuth> {
  const credentials: Record<string, PackageSourceAuth> = {};
  
  // Match: <packageSourceCredentials><SourceName><add key="Username" value="..." />...
  const credRegex = /<packageSourceCredentials>([\s\S]*?)<\/packageSourceCredentials>/i;
  const match = xml.match(credRegex);
  if (!match) return credentials;

  const credSection = match[1] ?? '';
  
  // Extract each source's credentials
  const sourceRegex = /<(\w+)>([\s\S]*?)<\/\1>/g;
  for (const sourceMatch of credSection.matchAll(sourceRegex)) {
    const sourceName = sourceMatch[1];
    const sourceContent = sourceMatch[2];
    
    const username = extractAttributeValue(sourceContent, 'Username');
    const password = extractAttributeValue(sourceContent, 'ClearTextPassword');
    
    if (username && password) {
      credentials[sourceName] = {
        type: 'basic',  // Default to basic, can be overridden by provider detection
        username,
        password,
      };
    }
  }
  
  return credentials;
}

/**
 * Parses nuget.config and merges credentials with package sources.
 */
export function parseNuGetConfigXml(xml: string): PackageSource[] {
  const sources = parseSourcesSection(xml);  // Existing implementation
  const credentials = parseCredentialsSection(xml);
  
  // Merge credentials into sources and apply provider-specific auth types
  return sources.map(source => {
    const auth = credentials[source.id];
    
    if (auth) {
      // Apply provider-specific auth type overrides
      if (source.provider === 'azure-artifacts') {
        auth.type = 'bearer';
      } else if (source.provider === 'github') {
        auth.type = 'api-key';
        auth.apiKeyHeader = 'X-NuGet-ApiKey';
      }
      
      return { ...source, auth };
    }
    
    return source;
  });
}
```

#### 4. Extension Activation
```typescript
// src/extension.ts
export async function activate(context: vscode.ExtensionContext) {
  const logger = createLogger(context);
  
  // Parse nuget.config and load credentials into memory
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const configPath = workspaceRoot ? discoverNuGetConfig(workspaceRoot) : undefined;
  const sources = configPath ? parseNuGetConfig(configPath) : [defaultNuGetSource];
  
  // Create API client with parsed sources (including credentials)
  const apiClient = createNuGetApiClient(logger, { sources });
  
  // Register commands, views, etc.
}
```

### API/Integration Points
- **NuGet API**: HTTP 401/403 responses for auth failures
- **nuget.config**: `<packageSourceCredentials>` XML section

### Security Considerations
- ✅ Credentials loaded from nuget.config into extension memory (same as dotnet CLI behavior)
- ✅ Credentials never logged (even with logger.debug)
- ✅ Workspace trust: Only parse nuget.config in trusted workspaces
- ⚠️ Users responsible for securing nuget.config (add to .gitignore)
- ⚠️ OAuth/NTLM flows delegated to CLI credential providers (future story)

## Testing Strategy

### Unit Tests
- [x] `buildRequestHeaders()` returns correct Basic auth header with username/password
- [x] `buildRequestHeaders()` returns correct Bearer auth header
- [x] `buildRequestHeaders()` returns correct custom API-key header (GitHub)
- [x] `buildRequestHeaders()` returns default headers when auth type is 'none'
- [x] `buildRequestHeaders()` handles missing credentials gracefully
- [x] `parseCredentialsSection()` extracts username/password from XML
- [x] `parseCredentialsSection()` returns empty object for malformed XML
- [x] `parseNuGetConfigXml()` merges credentials with sources
- [x] `parseNuGetConfigXml()` applies provider-specific auth type overrides

### Integration Tests
- [x] Integration test: Search with Basic auth (use test server or httpbin.org/basic-auth)
- [x] Integration test: HTTP 401 returns AuthRequired error with helpful message
- [x] Integration test: Source with no credentials sends request without auth headers

### Manual Testing
- [ ] Manual test: Create nuget.config with Basic auth credentials
- [ ] Manual test: Search packages from authenticated private feed
- [ ] Manual test: Verify Azure Artifacts feed uses Bearer auth automatically
- [ ] Manual test: Verify GitHub Packages feed uses X-NuGet-ApiKey header
- [ ] Manual test: Confirm credentials never appear in Output channel (even with debug logging)

## Dependencies

### Blocked By
- [STORY-001-01-001-nuget-search-api] - Base search API implementation

### Blocks
- [STORY-001-01-008-package-details-api] - Package metadata API needs auth for private feeds
- Future P4 stories for provider-specific quirks (Azure Artifacts org URLs, etc.)

### External Dependencies
- nuget.config files in user workspace
- Node.js Buffer API for base64 encoding (Basic auth)

## INVEST Check

- [x] **I**ndependent - Extends search API without breaking existing functionality
- [x] **N**egotiable - Auth implementation details (header format, error codes) can be refined
- [x] **V**aluable - Critical for enterprise users with private feeds
- [x] **E**stimable - 3 story points (1-2 days: 1d implementation, 0.5d testing, 0.5d docs)
- [x] **S**mall - Focused on auth headers and credential parsing (no OAuth flows, no SecretStorage)
- [x] **T**estable - Clear auth scenarios with unit and integration tests

## Notes

### Provider-Specific Auth Patterns
- **Azure Artifacts**: Always uses Bearer auth with PAT tokens
- **GitHub Packages**: Uses `X-NuGet-ApiKey` header with PAT tokens (not standard NuGet auth)
- **Artifactory**: Supports Basic, Bearer, or `X-JFrog-Art-Api` header
- **MyGet**: Uses standard NuGet API key auth
- **nuget.org**: Public, no auth required

### Future Enhancements (Out of Scope)
- VS Code SecretStorage integration (optional enhancement for better security)
- Provider adapters for URL transformations (e.g., Azure Artifacts requires org in URL)
- OAuth/STS/NTLM flows via dotnet CLI credential providers
- Credential refresh/rotation UI
- Multi-account support (multiple PATs for same provider)
- Credential validation on save (test auth before using)

### Security Best Practices
1. **Never log credentials**: Ensure logger never outputs password values (implement string sanitization in logger if needed)
2. **Workspace trust**: Only parse nuget.config in trusted workspaces (use `vscode.workspace.isTrusted`)
3. **Secure defaults**: Default to `type: 'none'` if auth config is malformed
4. **.gitignore guidance**: Document that users should add nuget.config to .gitignore if it contains credentials
5. **Credential scrubbing**: Consider redacting password values in error messages

## Changelog

| Date | Change | Author |
|---|---|---|
| 2025-11-29 | Story created as follow-up to STORY-001-01-001 | GitHub Copilot |
| 2025-11-29 | Simplified scope: removed SecretStorage, use in-memory credentials from nuget.config | GitHub Copilot |

---
**Story ID**: STORY-001-01-016-authenticated-sources  
**Feature**: [FEAT-001-01-browse-search](../features/FEAT-001-01-browse-search.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)
