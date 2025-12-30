# NuGet Source Provider Handlers - Discovery

## Overview

NuGet package sources (nuget.org, Artifactory, Azure Artifacts, GitHub Packages, etc.) all implement the same standardized NuGet V3 API protocol. This means a single implementation can work across all providers without source-specific code.

## Key Concept: Protocol Abstraction

All V3-compliant sources expose a **service index** (typically at `/v3/index.json`) that advertises their supported capabilities and endpoints. The client discovers available services dynamically rather than hardcoding endpoints.

### Service Index Structure

Every V3 source returns a JSON service index with this structure:
- `version`: Protocol version (e.g., "3.0.0")
- `resources`: Array of service endpoints with `@type` and `@id` properties

Common resource types:
- `SearchQueryService` - Package search functionality
- `RegistrationsBaseUrl` - Package metadata and dependency information
- `PackageBaseAddress` - Package content (.nupkg files)
- `PackagePublish` - Package push/upload endpoint

## Provider Universality

### Providers That Work Identically

All these sources implement the same V3 spec:
1. **nuget.org** - Official public gallery
2. **JFrog Artifactory** - Enterprise package management
3. **Azure Artifacts** - Microsoft cloud offering
4. **GitHub Packages** - Git-integrated hosting
5. **MyGet** - Third-party hosting
6. **Local V3 servers** - Self-hosted implementations

### What's Standardized

✅ **API Endpoints** - Same service types and JSON response formats  
✅ **Search Protocol** - Query parameters and result structure  
✅ **Metadata Format** - Package information schema  
✅ **Versioning** - Version range and listing behavior  
✅ **Protocol Discovery** - Service index pattern  

### What Varies Per Source

⚠️ **Authentication Methods**:
- nuget.org: No auth for read, API key for push
- Artifactory: Basic auth, API tokens, or API keys
- Azure Artifacts: Personal Access Tokens (PAT) or Azure AD
- GitHub: GitHub personal access tokens
- NTLM/Negotiate: Windows integrated auth (on-prem servers)

⚠️ **Credential Storage**: All stored in `nuget.config` using same format, but interpreted differently at runtime

## NuGet.Client Architecture

The official NuGet client (used by Visual Studio) uses a resource provider pattern:

### Core Abstraction: `Repository.GetCoreV3<T>()`

This is the universal entry point that:
1. Fetches the service index from the configured source URL
2. Matches requested resource type to available providers
3. Instantiates the appropriate provider using discovered endpoints
4. Returns a resource instance ready for use

### Key Provider Implementations

**`HttpHandlerResourceV3Provider`**:
- Creates HTTP clients with authentication
- Reads credentials from nuget.config for the source
- Configures auth headers (Basic, Bearer, NTLM, etc.)
- Works for ALL V3 sources - authentication abstraction

**How Auth Mechanism is Determined**:

The provider doesn't pre-select an auth mechanism. Instead, it uses a **handler pipeline** and **reactive authentication**:

1. **Initial Setup** - `HttpHandlerResourceV3Provider` creates an `HttpClientHandler` with credentials from nuget.config attached via `clientHandler.Credentials = credentials`

2. **Handler Pipeline** - Wraps the client handler in a chain:
   - `HttpSourceAuthenticationHandler` - Handles 401/403 responses and credential prompts
   - `ProxyAuthenticationHandler` - Handles proxy authentication (if proxy configured)
   - `StsAuthenticationHandler` - Handles STS token authentication (.NET Framework only)

3. **Reactive Authentication** - `HttpSourceAuthenticationHandler` implements the "try and retry" pattern:
   - Makes initial request with credentials from nuget.config
   - If server returns `401 Unauthorized` or `403 Forbidden`, handler intercepts
   - Calls `ICredentialService` to prompt for or retrieve cached credentials
   - Retries request with new credentials
   - Repeats up to `MaxAuthRetries` times

4. **Server Negotiation** - The actual auth mechanism (Basic, NTLM, Negotiate, Bearer) is determined by:
   - **HttpClientHandler's built-in negotiation** - .NET's `HttpClientHandler` automatically negotiates auth based on server's `WWW-Authenticate` response headers
   - **Credential type** - If credentials are `NetworkCredential`, it supports Basic/NTLM/Negotiate; if token, it's treated as Bearer
   - **Server response** - Server advertises supported auth schemes in HTTP headers; client responds accordingly

**Key Insight**: The provider doesn't "choose" an auth mechanism upfront. It attaches credentials and lets .NET's `HttpClientHandler` negotiate with the server based on HTTP challenge-response protocol. This is why the same code works for Artifactory (Basic), Azure (Bearer), and on-prem servers (NTLM).

**`PackageSearchResourceV3Provider`**:
- Provides package search capability
- Reads `SearchQueryService` endpoint from service index
- Makes HTTP requests to source-specific search URL
- Returns standardized search results

**`RegistrationResourceV3Provider`**:
- Fetches package metadata and version information
- Uses `RegistrationsBaseUrl` from service index
- Retrieves dependency graphs

**`PackageMetadataResourceV3Provider`**:
- Gets detailed package information
- Downloads README, license, icon
- Retrieves author, description, tags, etc.

### How It Works

The abstraction eliminates provider-specific code:
- Each provider reads the service index to find its specific endpoints
- HttpHandler provides authenticated HTTP client for that source
- Other providers use the HTTP client to make API calls
- All sources return data in the same JSON format

**Example Flow**:
1. User configures Artifactory source in nuget.config
2. Extension requests search capability
3. `GetCoreV3<PackageSearchResource>()` is called
4. System fetches Artifactory's service index
5. Finds `SearchQueryService` endpoint URL
6. `HttpHandlerResourceV3Provider` reads Artifactory credentials from nuget.config
7. Creates authenticated HTTP client
8. `PackageSearchResourceV3Provider` uses that client to query Artifactory
9. Returns results in standard format

Same flow works for nuget.org, Azure Artifacts, GitHub - zero code changes needed.

## Authentication Handling

### Credential Storage (Standardized)

All sources store credentials in `nuget.config` using `packageSourceCredentials`:
- Username/Password pairs
- Encrypted passwords (Windows-only, machine/user-specific)
- Clear text passwords (discouraged, but supported)
- Environment variable references
- Optional `validAuthenticationTypes` specification

### Authentication Types

**Basic Authentication**:
- Most common for Artifactory, MyGet, generic servers
- Header: `Authorization: Basic base64(username:password)`

**Bearer Token**:
- Azure Artifacts (PAT tokens)
- GitHub Packages (GitHub tokens)
- Header: `Authorization: Bearer <token>`
- **Note**: GitHub and Azure don't use `WWW-Authenticate` to advertise Bearer auth. They expect tokens upfront and return `401` if missing/invalid. The client must know in advance to use Bearer tokens based on the source URL or credential type.

**API Key**:
- Often for publish/push operations
- Header: `X-NuGet-ApiKey: <key>`

**Negotiate/NTLM**:
- Windows integrated authentication
- On-premises Azure DevOps Server
- Multi-step protocol, requires special handling

### How NuGet Tools Handle Auth

The official tools use **reactive authentication** rather than pre-selecting auth types:

1. **Credential Attachment** - Credentials from nuget.config are attached to `HttpClientHandler.Credentials`
2. **Initial Request** - Request is sent with credentials (may be empty initially)
3. **Server Challenge** - If server returns `401 Unauthorized` with `WWW-Authenticate` header specifying supported schemes
4. **Automatic Negotiation** - .NET's `HttpClientHandler` automatically:
   - Parses `WWW-Authenticate` header (e.g., "Basic", "NTLM", "Negotiate")
   - Selects appropriate auth mechanism based on credential type and server support
   - Reformats credentials for that scheme (e.g., Base64 for Basic, token negotiation for NTLM)
5. **Retry with Auth** - Request is retried with properly formatted authentication
6. **Credential Prompting** - If auth fails, `HttpSourceAuthenticationHandler` prompts user via `ICredentialService`
7. **Caching** - Successfully validated credentials are cached for subsequent requests

**Special Case - Bearer Tokens (GitHub, Azure Artifacts)**:
- These sources don't use `WWW-Authenticate` challenge-response
- They expect `Authorization: Bearer <token>` header on first request

**How NuGet.Client Actually Handles Bearer Tokens**:

NuGet.Client **does NOT rely on HttpClientHandler** to detect Bearer tokens. Instead:

1. **Credential Provider Responsibility**: 
   - When `ICredentialService.GetCredentialsAsync()` is called for sources like GitHub/Azure
   - The credential provider (plugin) returns credentials **already formatted** with the Bearer token
   - The provider knows the source URL (github.com, dev.azure.com) and returns appropriate format
   
2. **Manual Header Injection**: 
   - For sources that require Bearer tokens, the credentials are often NOT passed via `HttpClientHandler.Credentials`
   - Instead, they're added directly to the request headers: `request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token)`
   - This bypasses HTTP auth negotiation entirely

3. **Configuration Convention**:
   - Users configure GitHub/Azure with username="" or username="PersonalAccessToken" and password=<token>
   - Credential providers recognize these patterns and format correctly
   - Or use dedicated credential plugins (Azure Artifacts Credential Provider, GitHub auth helper)

**Example - GitHub Packages Configuration**:
```xml
<packageSources>
  <add key="github" value="https://nuget.pkg.github.com/NAMESPACE/index.json" />
</packageSources>
<packageSourceCredentials>
  <github>
    <add key="Username" value="USERNAME" />
    <add key="ClearTextPassword" value="TOKEN" />
  </github>
</packageSourceCredentials>
```

**Resulting HTTP Calls**:

1. **Fetch Service Index**:
```http
GET https://nuget.pkg.github.com/NAMESPACE/index.json
Authorization: Bearer TOKEN
```

2. **Search for Packages** (after finding SearchQueryService endpoint):
```http
GET https://nuget.pkg.github.com/NAMESPACE/query?q=Newtonsoft&prerelease=true&skip=0&take=20
Authorization: Bearer TOKEN
```

3. **Get Package Metadata** (after finding RegistrationsBaseUrl):
```http
GET https://nuget.pkg.github.com/NAMESPACE/registration/newtonsoft.json/index.json
Authorization: Bearer TOKEN
```

**Key Points**:
- GitHub ignores the `Username` field - only the token matters
- Username is included in nuget.config for convention/clarity, but header uses `Authorization: Bearer <ClearTextPassword>`
- GitHub returns 401/404 if token is missing or invalid
- NO `WWW-Authenticate` header in response

**Bottom Line**: Bearer token support is **explicit**, not automatic. Credential providers must know which sources need Bearer tokens and format them accordingly. There's no magic detection based on username/password structure.

**For Your Extension**: You'll need to detect source URLs (github.com, dev.azure.com) and explicitly use `Authorization: Bearer` header format using the password/token value from nuget.config credentials.

**Optional Hints**:
- `validAuthenticationTypes` in nuget.config can restrict which schemes to try
- Primarily used to force Basic auth when server advertises multiple options (NTLM/Negotiate/Basic)
- Not applicable to Bearer tokens (GitHub/Azure) which don't use HTTP auth negotiation
- Format: `<add key="ValidAuthenticationTypes" value="basic,negotiate" />`

**Reference**: See `HttpSourceAuthenticationHandler.cs` in NuGet.Client for implementation details.

## Implementation Strategy for Extension

### Recommended Hybrid Approach

**For Search/Browse Operations**:
- Implement NuGet V3 API HTTP client directly
- Required because dotnet CLI has no search command
- Fetch service index from each configured source
- Call `SearchQueryService` endpoints
- Handle Basic/Bearer authentication (covers 90% of scenarios)
- Aggregate results from multiple sources

**For Install/Update/Remove Operations**:
- Delegate to dotnet CLI commands
- CLI handles all authentication complexity automatically
- Supports encrypted passwords, NTLM, credential caching
- Handles package resolution and dependency management
- More reliable for edge cases

### What You Need to Implement

✅ **Service Index Fetcher**: Download and parse `/v3/index.json`  
✅ **Endpoint Discovery**: Extract resource URLs from service index  
✅ **Basic Auth Handler**: Base64 encode username:password  
✅ **Bearer Auth Handler**: Add token to Authorization header  
✅ **nuget.config Parser**: Read sources and credentials  
✅ **Multi-source Aggregation**: Query all enabled sources, merge results  

❌ **NTLM/Negotiate**: Too complex - let dotnet CLI handle these scenarios  
❌ **Password Decryption**: Windows-specific, machine-bound - use CLI  
❌ **Package Resolution**: Dependency solving is complex - use CLI  

## Important Considerations

### Global Packages Folder

The global packages folder (default: `~/.nuget/packages`) caches downloaded packages. When a package exists locally, NuGet may skip source lookups, which can bypass source mapping security features. Consider:
- Documenting this behavior
- Allowing users to configure repo-specific global package folders
- Providing clear cache commands

### Package Source Mapping (NuGet 6.0+)

Source mapping allows filtering which sources are used for specific package ID patterns. This is primarily for security:
- Prevents package substitution attacks
- Ensures corporate packages only come from trusted sources
- Defined in nuget.config `<packageSourceMapping>` section

While search may query all sources, actual package installation respects these mappings.

### Protocol Versions

**V3 API** (Current standard, since 2015):
- JSON-based protocol
- Service discovery via index.json
- Most efficient and feature-rich
- All modern sources support this

**V2 API** (Legacy, OData-based):
- Still supported by many sources for backward compatibility
- Less efficient than V3
- May be needed for very old private servers
- Consider implementing only if specific user need arises

## Research Resources

### Official NuGet Client (Primary Reference)

**Repository**: https://github.com/NuGet/NuGet.Client

**Key Components to Study**:
- `src/NuGet.Core/NuGet.Protocol/` - V2/V3 API implementation
  - `Repository.cs` - Resource provider abstraction
  - `Resources/PackageSearchResource.cs` - Search implementation
  - `HttpSource/HttpSource.cs` - Authentication handling
- `src/NuGet.Core/NuGet.Configuration/` - nuget.config parsing
  - `SettingsUtility.cs` - Configuration utilities
  - `PackageSourceProvider.cs` - Source management
- `src/NuGet.Core/NuGet.PackageManagement/` - Package operations
  - Multi-project handling
  - Consolidation logic

### NuGet Protocol Documentation

**Official API Spec**: https://learn.microsoft.com/en-us/nuget/api/overview

**Specific Endpoints**:
- Search API: https://learn.microsoft.com/en-us/nuget/api/search-query-service-resource
- Package Metadata: https://learn.microsoft.com/en-us/nuget/api/registration-base-url-resource
- Package Content: https://learn.microsoft.com/en-us/nuget/api/package-base-address-resource
- Authentication: https://learn.microsoft.com/en-us/nuget/api/package-publish-resource

**Configuration**:
- nuget.config reference: https://learn.microsoft.com/en-us/nuget/reference/nuget-config-file
- Package source mapping: https://learn.microsoft.com/en-us/nuget/consume-packages/package-source-mapping

### Existing VS Code Extensions

**NuGet Gallery Extension** (Community):
- Repository: https://github.com/pcislo/vscode-nuget-package-manager
- Relevant files:
  - `src/service/NugetService.ts` - Basic V3 API usage
  - Shows TypeScript HTTP client patterns
- Limitations: Single-project focused, doesn't handle solutions

**OmniSharp VSCode Extension**:
- Repository: https://github.com/OmniSharp/omnisharp-vscode
- Shows .csproj/solution parsing patterns
- MSBuild integration examples
- Doesn't handle package management UI

### IDE Implementation References

**Visual Studio**: Uses NuGet.Client libraries directly (see GitHub repo above)

**JetBrains Rider**:
- Documentation: https://www.jetbrains.com/help/rider/Using_NuGet.html
- Also uses official NuGet.Client libraries

### Testing Resources

**Live Service Indexes to Study**:
- nuget.org: https://api.nuget.org/v3/index.json
- Use Postman/curl to explore actual responses
- See real-world service index and API structures
- Test authentication patterns safely

## Next Steps

1. **Study NuGet.Client source code** - Focus on `NuGet.Protocol` project
2. **Test V3 API manually** - Use curl/Postman against nuget.org
3. **Parse nuget.config** - Build XML parser for sources and credentials
4. **Implement service index fetcher** - Download and parse index.json
5. **Build basic search client** - Query SearchQueryService endpoints
6. **Add authentication** - Support Basic and Bearer auth
7. **Test with Artifactory/Azure** - Validate against private sources
8. **Delegate to dotnet CLI** - For install/update/remove operations
