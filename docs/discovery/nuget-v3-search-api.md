# NuGet v3 Search API - Discovery Reference

## Overview

The NuGet v3 Search API provides standardized package search functionality across NuGet package sources. This document outlines the official API specification and third-party implementation compatibility.

## Service Discovery

### Service Index

All v3-compliant NuGet sources expose a **service index** at `/v3/index.json` (or similar endpoint) that advertises available capabilities:

```json
{
  "version": "3.0.0",
  "resources": [
    {
      "@id": "https://api-v2v3search-0.nuget.org/query",
      "@type": "SearchQueryService",
      "comment": "Query endpoint of NuGet Search service"
    }
  ]
}
```

**Key Properties:**
- `version`: SemVer 2.0.0 string indicating schema version (currently `3.0.0`)
- `resources`: Array of service endpoints with `@type` and `@id` properties

**Discovery Flow:**
1. Fetch service index from package source (e.g., `https://api.nuget.org/v3/index.json`)
2. Find resource with `@type` matching `SearchQueryService` or version variants
3. Extract `@id` URL as the search endpoint base URL
4. Append query parameters to perform searches

## Search Query Service

### Resource Type Versions

| @type | Description |
|-------|-------------|
| `SearchQueryService` | Initial release (v3.0.0) |
| `SearchQueryService/3.0.0-beta` | Alias of SearchQueryService |
| `SearchQueryService/3.0.0-rc` | Alias of SearchQueryService |
| `SearchQueryService/3.5.0` | Adds `packageType` parameter and `packageTypes` response property |

### HTTP Methods

- **Supported:** `GET`, `HEAD`
- **Required Headers:** None (optional: `Accept: application/json`)

### Endpoint Format

```
GET {@id}?q={QUERY}&skip={SKIP}&take={TAKE}&prerelease={PRERELEASE}&semVerLevel={SEMVERLEVEL}&packageType={PACKAGETYPE}
```

## Request Parameters

### Official v3 Specification

| Parameter | Location | Type | Required | Description |
|-----------|----------|------|----------|-------------|
| `q` | Query string | string | No | Search terms to filter packages (server-defined tokenization) |
| `skip` | Query string | integer | No | Number of results to skip for pagination (default: `0`) |
| `take` | Query string | integer | No | Number of results to return (server may impose max; nuget.org max: `1000`) |
| `prerelease` | Query string | boolean | No | Include prerelease packages (`true`/`false`; default: `false`) |
| `semVerLevel` | Query string | string | No | SemVer version filter (`2.0.0` includes SemVer 2.0.0 packages) |
| `packageType` | Query string | string | No | Filter by package type name (added in v3.5.0) |

### Parameter Details

**`q` (Query):**
- Empty or omitted returns all packages (enables "Browse" mode)
- Parsing is implementation-defined
- nuget.org supports field-specific filtering (e.g., `id:Newtonsoft`)

**`skip` / `take` (Pagination):**
- `skip`: Default `0`, nuget.org max: `3000`
- `take`: Must be > 0, nuget.org max: `1000`
- Use for client-side paging

**`prerelease`:**
- `false` (default): Excludes prerelease versions
- `true`: Includes both stable and prerelease

**`semVerLevel`:**
- Omitted: SemVer 1.0.0 packages only
- `2.0.0`: Includes both SemVer 1.0.0 and 2.0.0 packages

**`packageType`:**
- Filters by author-defined package type
- Empty value = no filter
- Invalid type returns empty results

### Non-Standard Parameters

> **⚠️ IMPORTANT:** The following parameters are **NOT** part of the official NuGet v3 API specification and should be considered **nuget.org-specific extensions**.

| Parameter | Source | Support |
|-----------|--------|---------|
| `orderBy` | nuget.org only | Not in v3 spec; proprietary Azure Search feature |
| `packageFilters` | nuget.org only | Not in v3 spec; web UI feature |

**Recommendation:** Do not rely on these parameters for third-party sources.

## Response Format

### Root Object

```json
{
  "totalHits": 2,
  "data": [ /* array of search results */ ]
}
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `totalHits` | integer | Yes | Total match count (ignores `skip`/`take`) |
| `data` | array | Yes | Search results (max length: `take` value) |

### Search Result Object

Each item in `data` represents a package ID with aggregated version information:

```json
{
  "id": "NuGet.Versioning",
  "version": "4.4.0",
  "description": "NuGet's implementation of Semantic Versioning.",
  "versions": [
    {
      "version": "3.3.0",
      "downloads": 50343,
      "@id": "https://api.nuget.org/v3/registration.../3.3.0.json"
    }
  ],
  "authors": ["NuGet"],
  "iconUrl": "https://...",
  "licenseUrl": "https://...",
  "projectUrl": "https://...",
  "registration": "https://api.nuget.org/v3/registration.../index.json",
  "summary": "",
  "tags": ["semver", "semantic", "versioning"],
  "title": "NuGet.Versioning",
  "totalDownloads": 141896,
  "verified": true,
  "packageTypes": [
    {
      "name": "Dependency"
    }
  ]
}
```

#### Result Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | Package ID (case-insensitive unique identifier) |
| `version` | string | Yes | Latest version (SemVer 2.0.0 format, may include build metadata) |
| `description` | string | No | Package description |
| `versions` | array | Yes | All versions matching `prerelease` filter |
| `authors` | string or string[] | No | Package authors |
| `iconUrl` | string | No | Package icon URL |
| `licenseUrl` | string | No | License URL |
| `owners` | string or string[] | No | Owner usernames (nuget.org-specific) |
| `projectUrl` | string | No | Project homepage URL |
| `registration` | string | No | Absolute URL to registration index (metadata) |
| `summary` | string | No | Short description |
| `tags` | string or string[] | No | Package tags |
| `title` | string | No | Display title |
| `totalDownloads` | integer | No | Aggregate download count (sum of `versions[].downloads`) |
| `verified` | boolean | No | Verified package badge (nuget.org ID prefix reservation) |
| `packageTypes` | array | Yes | Package type metadata (added in v3.5.0) |

#### Version Object

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `@id` | string | Yes | Absolute URL to registration leaf (version metadata) |
| `version` | string | Yes | SemVer 2.0.0 version string |
| `downloads` | integer | Yes | Download count for this specific version |

#### Package Type Object

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | Yes | Package type name (e.g., "Dependency", "DotnetTool") |

### Unlisted Packages

**Unlisted packages MUST NOT appear in search results.** This is a protocol requirement.

## Error Handling

### HTTP Status Codes

| Status | Meaning | Action |
|--------|---------|--------|
| `200` | Success | Parse response JSON |
| `400` | Bad request | Check query parameters |
| `401` | Unauthorized | Provide credentials |
| `403` | Forbidden | Check permissions |
| `429` | Rate limited | Implement exponential backoff |
| `500` | Server error | Retry with backoff |
| `503` | Service unavailable | Retry later |

### Timeouts

- Recommended client timeout: **30 seconds**
- Use `AbortController` for cancellable requests

## Third-Party Source Compatibility

### V3 API Support Matrix

| Source | V3 API Support | Service Index URL | Notes |
|--------|----------------|-------------------|-------|
| **nuget.org** | ✅ Full | `https://api.nuget.org/v3/index.json` | Official reference implementation |
| **JFrog Artifactory** | ✅ Yes | `https://<domain>/artifactory/api/nuget/v3/<repo>/index.json` | Does NOT support `PackageBaseAddress` or SemVer 2.0 |
| **Azure Artifacts** | ✅ Yes | `https://pkgs.dev.azure.com/<org>/_packaging/<feed>/nuget/v3/index.json` | Microsoft-owned, full v3 support |
| **GitHub Packages** | ✅ Yes | `https://nuget.pkg.github.com/<namespace>/index.json` | Requires authentication |
| **MyGet** | ✅ Yes | `https://www.myget.org/F/<feed>/api/v3/index.json` | Third-party hosting, full v3 |
| **NuGet.Server** | ❌ No | N/A | V2 API only (.NET Framework 4.6, open-source package) |
| **BaGet** | ✅ Yes | `http://<host>/v3/index.json` | Lightweight self-hosted v3 server |

### Authentication Methods

| Source | Primary Method | Alternative Methods | Header Format |
|--------|----------------|---------------------|---------------|
| **nuget.org** | None (public) | API Key (push only) | N/A |
| **Artifactory** | Basic Auth | Bearer, `X-JFrog-Art-Api` | `Authorization: Basic <base64>` |
| **Azure Artifacts** | Bearer Token | Personal Access Token | `Authorization: Bearer <token>` |
| **GitHub Packages** | Personal Access Token | N/A | `X-NuGet-ApiKey: <token>` (non-standard) |
| **MyGet** | API Key | Basic Auth | `X-NuGet-ApiKey: <key>` |

### Known Limitations

#### Artifactory
- ❌ **Does NOT support** `PackageBaseAddress` resource type
- ❌ **Does NOT support** SemVer 2.0.0 packages
- ✅ Supports v3 search, registration, and package publish

#### NuGet.Server
- ❌ **V2 API only** - no v3 service index
- ❌ No `SearchQueryService` endpoint
- Legacy package for .NET Framework 4.6 applications

#### GitHub Packages
- ⚠️ Uses non-standard `X-NuGet-ApiKey` header instead of `Authorization`
- ⚠️ Namespace required in URL (`/<owner>` or `/<org>`)

### Sorting Support

> **⚠️ CRITICAL:** Sorting is **NOT** part of the official NuGet v3 API specification.

| Source | Sorting Support | Notes |
|--------|-----------------|-------|
| **nuget.org** | ✅ Yes (`orderBy` parameter) | Proprietary Azure Search feature; options: `relevance`, `downloads`, `created` |
| **Artifactory** | ❌ No | Not documented; returns default order |
| **Azure Artifacts** | ⚠️ Unknown | Not documented; may share nuget.org backend |
| **GitHub Packages** | ❌ No | Not documented |
| **MyGet** | ❌ No | Not documented |
| **BaGet** | ❌ No | Lightweight implementation; default order only |

**Recommendation:** Implement sorting only for nuget.org sources. For other sources, use client-side sorting.

## Best Practices

### Service Index Caching
- **Cache service index responses** to reduce API calls
- Invalidate cache on 404/401/403 responses
- Recommended TTL: 1 hour

### Request Optimization
- Use `AbortController` for cancellable requests
- Implement exponential backoff for 429/503 errors
- Set reasonable timeouts (30s default)

### Security
- **Never log authentication headers** (credentials leak risk)
- Use HTTPS for all package sources
- Validate SSL certificates in production

### Pagination
- Respect server-imposed limits (nuget.org: max `take=1000`)
- Implement "Load More" pattern instead of showing all results
- Track `totalHits` for accurate result counts

### Error Messages
- Parse error responses for user-friendly messages
- Distinguish between authentication (401/403) and server errors (500/503)
- Provide actionable hints (e.g., "Configure credentials in nuget.config")

## Example Search Requests

### Basic Search
```
GET https://api.nuget.org/v3-flatcontainer/query?q=Newtonsoft.Json
```

### Search with Pagination
```
GET https://api.nuget.org/v3-flatcontainer/query?q=Serilog&skip=20&take=10
```

### Include Prerelease Packages
```
GET https://api.nuget.org/v3-flatcontainer/query?q=EntityFramework&prerelease=true
```

### Browse All Packages (No Query)
```
GET https://api.nuget.org/v3-flatcontainer/query?skip=0&take=50
```

### Filter by Package Type
```
GET https://api.nuget.org/v3-flatcontainer/query?q=dotnet-format&packageType=DotnetTool
```

### SemVer 2.0.0 Packages
```
GET https://api.nuget.org/v3-flatcontainer/query?q=AutoMapper&semVerLevel=2.0.0
```

## References

- [NuGet v3 API Overview](https://learn.microsoft.com/en-us/nuget/api/overview)
- [Service Index](https://learn.microsoft.com/en-us/nuget/api/service-index)
- [Search Query Service Resource](https://learn.microsoft.com/en-us/nuget/api/search-query-service-resource)
- [NuGet.Client Source Code](https://github.com/NuGet/NuGet.Client)
- [Artifactory NuGet Documentation](https://jfrog.com/help/r/jfrog-artifactory-documentation/nuget-repositories)
- [GitHub Packages NuGet Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-nuget-registry)
- [Azure Artifacts NuGet](https://learn.microsoft.com/en-us/azure/devops/artifacts/nuget/)

---

**Last Updated:** 2025-12-29  
**Version:** 1.0  
**Specification:** NuGet v3 API (v3.0.0 - v3.5.0)
