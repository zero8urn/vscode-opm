# NuGet v3 Registration API - Discovery Reference

## Overview

The NuGet v3 Registration API (also called the Package Metadata API) provides comprehensive metadata for individual packages, including all versions, dependencies, deprecation warnings, vulnerability information, and download URLs. This API is the authoritative source for package details and is used when displaying package information in UIs or determining installation requirements.

Unlike the Search API which returns aggregated results across multiple packages, the Registration API focuses on a single package ID and provides complete version history, dependency graphs, and detailed metadata for each version.

## Service Discovery

### Service Index

All v3-compliant NuGet sources expose a **service index** at `/v3/index.json` that advertises available capabilities:

```json
{
  "version": "3.0.0",
  "resources": [
    {
      "@id": "https://api.nuget.org/v3/registration5-semver1/{id-lower}/index.json",
      "@type": "RegistrationsBaseUrl",
      "comment": "Base URL for package registration metadata"
    },
    {
      "@id": "https://api.nuget.org/v3/registration5-semver2/{id-lower}/index.json",
      "@type": "RegistrationsBaseUrl/3.6.0",
      "comment": "Base URL for package registration metadata (SemVer 2.0.0 support)"
    }
  ]
}
```

**Key Properties:**
- `@type`: Resource type identifier (`RegistrationsBaseUrl` or versioned variants)
- `@id`: URL template with `{id-lower}` placeholder for lowercase package ID

**Discovery Flow:**
1. Fetch service index from package source (e.g., `https://api.nuget.org/v3/index.json`)
2. Find resource with `@type` matching `RegistrationsBaseUrl` or version variants
3. Extract `@id` URL template and replace `{id-lower}` with lowercase package ID
4. Append `/index.json` to get registration index URL

## Registration Base URL Resource

### Resource Type Versions

| @type | Description |
|-------|-------------|
| `RegistrationsBaseUrl` | Initial release (v3.0.0) - SemVer 1.0.0 packages only |
| `RegistrationsBaseUrl/3.0.0-beta` | Alias of RegistrationsBaseUrl |
| `RegistrationsBaseUrl/3.0.0-rc` | Alias of RegistrationsBaseUrl |
| `RegistrationsBaseUrl/3.4.0` | Adds deprecation metadata |
| `RegistrationsBaseUrl/3.6.0` | Adds SemVer 2.0.0 support and vulnerability information |
| `RegistrationsBaseUrl/Versioned` | Unversioned alias for latest stable API |

### HTTP Methods

- **Supported:** `GET`, `HEAD`
- **Required Headers:** None (optional: `Accept: application/json`)

### URL Templates

The Registration API uses a three-tier hierarchy:

1. **Registration Index**: `{@id}/{id-lower}/index.json` - All versions of a package
2. **Registration Page**: `{@id}/{id-lower}/page/{lower-version}/{upper-version}.json` - Subset of versions
3. **Registration Leaf**: `{@id}/{id-lower}/{version-lower}.json` - Individual version details

**URL Construction:**
```
Registration Index:  https://api.nuget.org/v3/registration5-semver1/newtonsoft.json/index.json
Registration Page:   https://api.nuget.org/v3/registration5-semver1/newtonsoft.json/page/1.0.0/6.0.8.json
Registration Leaf:   https://api.nuget.org/v3/registration5-semver1/newtonsoft.json/13.0.3.json
```

## Registration Index

The **registration index** is the primary entry point for package metadata. It returns all versions of a package, organized into pages.

### Endpoint Format

```
GET {RegistrationsBaseUrl}/{id-lower}/index.json
```

**Parameters:**
- `{id-lower}`: Package ID in lowercase (e.g., `newtonsoft.json`, `microsoft.extensions.logging`)

### Response Format

```json
{
  "@id": "https://api.nuget.org/v3/registration5-semver1/newtonsoft.json/index.json",
  "@type": ["catalog:CatalogRoot", "PackageRegistration", "catalog:Permalink"],
  "commitId": "f2c5b7a2-...",
  "commitTimeStamp": "2023-05-15T18:45:32.1234567Z",
  "count": 2,
  "items": [
    {
      "@id": "https://api.nuget.org/v3/registration5-semver1/newtonsoft.json/page/1.0.0/6.0.8.json",
      "@type": "catalog:CatalogPage",
      "commitId": "f2c5b7a2-...",
      "commitTimeStamp": "2023-05-15T18:45:32.1234567Z",
      "count": 58,
      "lower": "1.0.0",
      "upper": "6.0.8",
      "parent": "https://api.nuget.org/v3/registration5-semver1/newtonsoft.json/index.json",
      "items": [
        { /* inline registration leaf for each version */ }
      ]
    },
    {
      "@id": "https://api.nuget.org/v3/registration5-semver1/newtonsoft.json/page/7.0.1/13.0.3.json",
      "@type": "catalog:CatalogPage",
      "commitId": "a8b9c1d2-...",
      "commitTimeStamp": "2023-05-15T18:45:32.1234567Z",
      "count": 45,
      "lower": "7.0.1",
      "upper": "13.0.3"
      // No "items" property - must fetch page separately
    }
  ]
}
```

### Index Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `@id` | string | Yes | Absolute URL to this registration index |
| `@type` | string[] | Yes | Type identifiers (e.g., `["catalog:CatalogRoot", "PackageRegistration"]`) |
| `commitId` | string | No | Unique identifier for this catalog state (opaque string) |
| `commitTimeStamp` | string | No | ISO 8601 timestamp of last update |
| `count` | integer | Yes | Number of registration pages in `items` array |
| `items` | array | Yes | Array of registration page objects |

### Page Object (Inline in Index)

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `@id` | string | Yes | Absolute URL to registration page (if not inline) |
| `@type` | string | Yes | Type identifier (`catalog:CatalogPage`) |
| `commitId` | string | No | Unique identifier for this page state |
| `commitTimeStamp` | string | No | ISO 8601 timestamp of last update |
| `count` | integer | Yes | Number of versions in this page |
| `lower` | string | Yes | Lowest version in this page (SemVer 2.0.0 format) |
| `upper` | string | Yes | Highest version in this page (SemVer 2.0.0 format) |
| `parent` | string | No | URL to parent registration index |
| `items` | array | No | Array of registration leaf objects (inline) or omitted (requires separate fetch) |

**Inlining Behavior:**
- **Small packages** (<= 64 versions): Page includes `items` array with all registration leaves inlined
- **Large packages** (> 64 versions): Page omits `items` array; clients must fetch page URL separately

## Registration Page

A **registration page** contains a subset of package versions. For small packages, pages are inlined in the index. For large packages, pages must be fetched separately.

### Endpoint Format

```
GET {RegistrationsBaseUrl}/{id-lower}/page/{lower-version}/{upper-version}.json
```

**Parameters:**
- `{id-lower}`: Package ID in lowercase
- `{lower-version}`: Lowest version in page (from index `lower` property)
- `{upper-version}`: Highest version in page (from index `upper` property)

### Response Format

```json
{
  "@id": "https://api.nuget.org/v3/registration5-semver1/newtonsoft.json/page/7.0.1/13.0.3.json",
  "@type": "catalog:CatalogPage",
  "commitId": "a8b9c1d2-...",
  "commitTimeStamp": "2023-05-15T18:45:32.1234567Z",
  "count": 45,
  "lower": "7.0.1",
  "upper": "13.0.3",
  "parent": "https://api.nuget.org/v3/registration5-semver1/newtonsoft.json/index.json",
  "items": [
    {
      "@id": "https://api.nuget.org/v3/registration5-semver1/newtonsoft.json/13.0.3.json",
      "@type": "Package",
      "commitId": "c3d4e5f6-...",
      "commitTimeStamp": "2023-05-15T18:45:32.1234567Z",
      "catalogEntry": { /* package metadata */ },
      "packageContent": "https://api.nuget.org/v3-flatcontainer/newtonsoft.json/13.0.3/newtonsoft.json.13.0.3.nupkg",
      "registration": "https://api.nuget.org/v3/registration5-semver1/newtonsoft.json/index.json"
    }
  ]
}
```

### Page Properties

Same as index page object, but `items` array is always present.

## Registration Leaf

A **registration leaf** represents a single package version with complete metadata, including dependencies, deprecation status, and vulnerability information.

### Endpoint Format

```
GET {RegistrationsBaseUrl}/{id-lower}/{version-lower}.json
```

**Parameters:**
- `{id-lower}`: Package ID in lowercase
- `{version-lower}`: Version string in lowercase (e.g., `13.0.3`, `1.0.0-beta`)

### Response Format

```json
{
  "@id": "https://api.nuget.org/v3/registration5-semver1/newtonsoft.json/13.0.3.json",
  "@type": "Package",
  "catalogEntry": {
    "@id": "https://api.nuget.org/v3/catalog0/data/...",
    "@type": "PackageDetails",
    "authors": "James Newton-King",
    "dependencyGroups": [
      {
        "@id": "https://api.nuget.org/v3/catalog0/data/.../dependencygroup/.netframework4.5.json",
        "@type": "PackageDependencyGroup",
        "targetFramework": ".NETFramework4.5"
        // No dependencies for this TFM
      },
      {
        "@id": "https://api.nuget.org/v3/catalog0/data/.../dependencygroup/.netstandard2.0.json",
        "@type": "PackageDependencyGroup",
        "dependencies": [
          {
            "@id": "https://api.nuget.org/v3/catalog0/data/.../dependency/microsoft.csharp.json",
            "@type": "PackageDependency",
            "id": "Microsoft.CSharp",
            "range": "[4.7.0, )"
          }
        ],
        "targetFramework": ".NETStandard2.0"
      }
    ],
    "deprecation": {
      "@id": "https://api.nuget.org/v3/catalog0/data/.../deprecation.json",
      "reasons": ["Legacy"],
      "message": "This package has been deprecated. Use NewPackage instead.",
      "alternatePackage": {
        "@id": "https://api.nuget.org/v3/catalog0/data/.../alternatepackage.json",
        "id": "NewPackage",
        "range": "[1.0.0, )"
      }
    },
    "vulnerabilities": [
      {
        "@id": "https://api.nuget.org/v3/catalog0/data/.../vulnerability/CVE-2023-1234.json",
        "advisoryUrl": "https://github.com/advisories/GHSA-...",
        "severity": "2"
      }
    ],
    "description": "Json.NET is a popular high-performance JSON framework for .NET",
    "iconUrl": "https://www.nuget.org/Content/gallery/img/default-package-icon-256x256.png",
    "id": "Newtonsoft.Json",
    "language": "",
    "licenseExpression": "MIT",
    "licenseUrl": "https://licenses.nuget.org/MIT",
    "listed": true,
    "minClientVersion": "",
    "packageContent": "https://api.nuget.org/v3-flatcontainer/newtonsoft.json/13.0.3/newtonsoft.json.13.0.3.nupkg",
    "projectUrl": "https://www.newtonsoft.com/json",
    "published": "2023-03-08T19:23:45.123+00:00",
    "readmeUrl": "https://api.nuget.org/v3-flatcontainer/newtonsoft.json/13.0.3/readme",
    "requireLicenseAcceptance": false,
    "summary": "",
    "tags": ["json", "serialization", "newtonsoft"],
    "title": "Json.NET",
    "version": "13.0.3"
  },
  "packageContent": "https://api.nuget.org/v3-flatcontainer/newtonsoft.json/13.0.3/newtonsoft.json.13.0.3.nupkg",
  "registration": "https://api.nuget.org/v3/registration5-semver1/newtonsoft.json/index.json"
}
```

### Leaf Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `@id` | string | Yes | Absolute URL to this registration leaf |
| `@type` | string | Yes | Type identifier (`Package`) |
| `catalogEntry` | object | Yes | Package metadata object (see Catalog Entry) |
| `packageContent` | string | Yes | Absolute URL to .nupkg download |
| `registration` | string | Yes | Absolute URL to parent registration index |

### Catalog Entry Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `@id` | string | Yes | Absolute URL to catalog entry |
| `@type` | string | Yes | Type identifier (`PackageDetails`) |
| `authors` | string | No | Comma-separated author names |
| `dependencyGroups` | array | No | Dependency groups by target framework |
| `deprecation` | object | No | Deprecation metadata (added in v3.4.0) |
| `vulnerabilities` | array | No | Vulnerability information (added in v3.6.0) |
| `description` | string | No | Package description (plain text or Markdown) |
| `iconUrl` | string | No | Package icon URL (deprecated; use embedded icon) |
| `id` | string | Yes | Package ID (case-preserved original) |
| `language` | string | No | Package language/locale (e.g., `en-US`) |
| `licenseExpression` | string | No | SPDX license expression (e.g., `MIT`, `Apache-2.0`) |
| `licenseUrl` | string | No | License URL (deprecated; use `licenseExpression`) |
| `listed` | boolean | Yes | Whether package is listed in search results |
| `minClientVersion` | string | No | Minimum NuGet client version required |
| `packageContent` | string | Yes | Absolute URL to .nupkg download |
| `projectUrl` | string | No | Project homepage URL |
| `published` | string | Yes | ISO 8601 timestamp of publish date |
| `readmeUrl` | string | No | Absolute URL to README content (plain text or Markdown) |
| `requireLicenseAcceptance` | boolean | No | Whether license acceptance required before install |
| `summary` | string | No | Short package summary |
| `tags` | string or string[] | No | Space-separated tags or array |
| `title` | string | No | Display title (fallback to `id` if omitted) |
| `version` | string | Yes | SemVer 2.0.0 version string |

### Dependency Group Object

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `@id` | string | Yes | Absolute URL to dependency group |
| `@type` | string | Yes | Type identifier (`PackageDependencyGroup`) |
| `dependencies` | array | No | Array of dependency objects (omitted if no dependencies) |
| `targetFramework` | string | No | Target framework moniker (e.g., `.NETStandard2.0`, `.NETFramework4.5`) or empty string for "any" |

### Dependency Object

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `@id` | string | Yes | Absolute URL to dependency |
| `@type` | string | Yes | Type identifier (`PackageDependency`) |
| `id` | string | Yes | Dependency package ID |
| `range` | string | No | Version range in NuGet format (e.g., `[1.0.0, )`, `(, 2.0.0]`) |

### Deprecation Object

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `@id` | string | Yes | Absolute URL to deprecation metadata |
| `reasons` | string[] | Yes | Deprecation reasons (e.g., `["Legacy"]`, `["CriticalBugs"]`, `["Other"]`) |
| `message` | string | No | Human-readable deprecation message |
| `alternatePackage` | object | No | Recommended replacement package |

**Deprecation Reasons:**
- `Legacy`: Package is outdated; use newer alternative
- `CriticalBugs`: Package has critical bugs; use fixed version
- `Other`: Custom deprecation reason (see `message`)

### Alternate Package Object

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `@id` | string | Yes | Absolute URL to alternate package metadata |
| `id` | string | Yes | Alternate package ID |
| `range` | string | No | Recommended version range (e.g., `[1.0.0, )`) |

### Vulnerability Object

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `@id` | string | Yes | Absolute URL to vulnerability metadata |
| `advisoryUrl` | string | Yes | URL to security advisory (e.g., GitHub Security Advisory) |
| `severity` | string | Yes | Severity level (`0` = Low, `1` = Moderate, `2` = High, `3` = Critical) |

## README Content

Package READMEs are served as separate resources via the `readmeUrl` property in the catalog entry.

### Endpoint Format

```
GET https://api.nuget.org/v3-flatcontainer/{id-lower}/{version-lower}/readme
```

### Response Format

- **Content-Type**: `text/plain` or `text/markdown`
- **Body**: Raw README content (Markdown or plain text)

**Important:** Always sanitize README content before rendering in webviews to prevent XSS attacks.

## Error Handling

### HTTP Status Codes

| Status | Meaning | Action |
|--------|---------|--------|
| `200` | Success | Parse response JSON |
| `404` | Package not found | Display "Package does not exist" message |
| `401` | Unauthorized | Provide credentials |
| `403` | Forbidden | Check permissions |
| `429` | Rate limited | Implement exponential backoff |
| `500` | Server error | Retry with backoff |
| `503` | Service unavailable | Retry later |

### 404 Handling

Unlike search results which return empty arrays, the Registration API returns **404 Not Found** for:
- Non-existent package IDs
- Non-existent versions
- Unlisted packages (depending on source configuration)

**Recommendation:** Distinguish between "package doesn't exist" (404 on index) and "version doesn't exist" (404 on leaf).

### Timeouts

- Recommended client timeout: **30 seconds** for index/page requests
- Recommended timeout: **60 seconds** for README downloads (may be large)

## Third-Party Source Compatibility

### V3 Registration API Support Matrix

| Source | Registration API Support | Notes |
|--------|--------------------------|-------|
| **nuget.org** | ✅ Full | Reference implementation with all features |
| **JFrog Artifactory** | ✅ Yes | Full support; may lack vulnerability metadata |
| **Azure Artifacts** | ✅ Yes | Full support including deprecation/vulnerability |
| **GitHub Packages** | ✅ Yes | Full support; requires authentication |
| **MyGet** | ✅ Yes | Full support |
| **BaGet** | ✅ Yes | Lightweight implementation; may lack deprecation/vulnerability |

### Feature Compatibility

| Feature | nuget.org | Artifactory | Azure Artifacts | GitHub Packages | MyGet | BaGet |
|---------|-----------|-------------|-----------------|-----------------|-------|-------|
| **Registration Index** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Registration Pages** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Registration Leaves** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Dependency Groups** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Deprecation Metadata** | ✅ | ⚠️ | ✅ | ⚠️ | ⚠️ | ❌ |
| **Vulnerability Info** | ✅ | ❌ | ✅ | ⚠️ | ❌ | ❌ |
| **README URLs** | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ |

**Legend:**
- ✅ Fully supported
- ⚠️ Partial support or untested
- ❌ Not supported

## Best Practices

### Caching Strategy

**Registration Index:**
- **Recommended TTL**: 10 minutes for package metadata
- **Invalidate on**: Package publish events (if using webhooks)
- **Cache key**: `registration-index:{source}:{packageId}`

**Registration Leaves:**
- **Recommended TTL**: 1 hour (individual versions rarely change after publish)
- **Invalidate on**: Never (versions are immutable)
- **Cache key**: `registration-leaf:{source}:{packageId}:{version}`

**README Content:**
- **Recommended TTL**: 1 hour
- **Cache key**: `readme:{source}:{packageId}:{version}`

### Request Optimization

**Fetch Index First:**
1. Fetch registration index for package
2. Check if pages are inlined (`items` property present)
3. If not inlined, fetch required page(s) separately
4. Extract leaf data from inlined pages or fetch leaves individually

**Avoid Leaf Requests:**
- Use inlined leaves from index/page responses when available
- Only fetch individual leaves for detailed metadata (README, full dependency tree)

**Lazy Load READMEs:**
- Don't fetch README until user requests package details
- Cache README content separately from registration metadata

### Security

**Sanitize README Content:**
- Always sanitize Markdown/HTML before rendering in webviews
- Use DOMPurify or similar library to prevent XSS attacks
- Limit README size (e.g., 500KB max) to prevent memory issues

**Validate Version Strings:**
- Validate version strings before constructing leaf URLs
- Prevent path traversal attacks via malicious version strings

**HTTPS Only:**
- Always use HTTPS for package sources
- Validate SSL certificates in production

### Performance

**Batch Requests:**
- Fetch registration index once per package, not per version
- Extract all needed version metadata from index before fetching leaves

**Progressive Loading:**
- Show basic metadata (name, version, description) immediately from search results
- Lazy load detailed metadata (dependencies, README) when user selects package

**Minimize API Calls:**
- Use inlined page data from index when available
- Cache index responses aggressively (10+ minutes)
- Only fetch leaves for versions user explicitly selects

### Dependency Resolution

**Parse Dependency Groups:**
- Group dependencies by target framework
- Only show dependencies for user's selected target framework
- Handle "any" framework (`targetFramework` = empty string) as fallback

**Version Range Parsing:**
- Use NuGet version range syntax: `[min, max]`, `(min, max)`, `[min, )`, `(, max]`
- Square brackets `[` = inclusive, parentheses `(` = exclusive
- Empty bound = unbounded (e.g., `[1.0.0, )` = "1.0.0 or higher")

**Transitive Dependencies:**
- Registration API only shows direct dependencies
- Recursive fetching required for full dependency tree
- Consider depth limit (e.g., 5 levels) to prevent infinite recursion

## Example Requests

### Fetch Package Metadata (Index)
```bash
GET https://api.nuget.org/v3/registration5-semver1/newtonsoft.json/index.json
```

### Fetch Specific Version Details (Leaf)
```bash
GET https://api.nuget.org/v3/registration5-semver1/newtonsoft.json/13.0.3.json
```

### Fetch Registration Page (Large Package)
```bash
GET https://api.nuget.org/v3/registration5-semver1/newtonsoft.json/page/7.0.1/13.0.3.json
```

### Fetch README Content
```bash
GET https://api.nuget.org/v3-flatcontainer/newtonsoft.json/13.0.3/readme
```

### Download Package (.nupkg)
```bash
GET https://api.nuget.org/v3-flatcontainer/newtonsoft.json/13.0.3/newtonsoft.json.13.0.3.nupkg
```

## Typical Workflow

### Display Package Details in UI

1. **Search for package** via Search API → Get package ID and latest version
2. **Fetch registration index** → Get all versions and basic metadata
3. **Extract version list** → Display version picker in UI
4. **Show basic metadata** → Display from inlined catalog entry (name, description, author)
5. **User selects version** → Fetch registration leaf (if not inlined)
6. **Parse dependencies** → Display dependency tree for selected target framework
7. **Lazy load README** → Fetch README URL and render sanitized content
8. **Check deprecation** → Display warning banner if deprecated
9. **Check vulnerabilities** → Display security alerts if vulnerable

### Install Package

1. **Fetch registration leaf** for selected version
2. **Parse dependencies** for user's target framework
3. **Check `requireLicenseAcceptance`** → Prompt user if `true`
4. **Extract `packageContent` URL** → Pass to installation handler
5. **Invoke dotnet CLI** → `dotnet add package {id} --version {version}`

## References

- [NuGet v3 API Overview](https://learn.microsoft.com/en-us/nuget/api/overview)
- [Service Index](https://learn.microsoft.com/en-us/nuget/api/service-index)
- [Registration Base URL Resource](https://learn.microsoft.com/en-us/nuget/api/registration-base-url-resource)
- [Package Content Resource](https://learn.microsoft.com/en-us/nuget/api/package-base-address-resource)
- [NuGet Version Ranges](https://learn.microsoft.com/en-us/nuget/concepts/package-versioning#version-ranges)
- [SemVer 2.0.0 Specification](https://semver.org/spec/v2.0.0.html)
- [NuGet.Client Source Code](https://github.com/NuGet/NuGet.Client)

---

**Last Updated:** 2025-12-29  
**Version:** 1.0  
**Specification:** NuGet v3 Registration API (v3.0.0 - v3.6.0)
