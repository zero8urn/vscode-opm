# STORY-001-01-008-package-details-api

**Feature**: [FEAT-001-01-browse-search](../features/FEAT-001-01-browse-search.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Not Started | In Progress | Done  
**Priority**: High  
**Estimate**: 5 Story Points  
**Created**: 2025-11-16  
**Last Updated**: 2025-11-16

## User Story

**As a** developer using the NuGet Package Management extension  
**I want** fetch package details from registration api  
**So that** I can efficiently manage NuGet packages in my VS Code workspace

## Description

This story implements integration with the NuGet v3 Registration API to fetch comprehensive package metadata for display in the package details panel. The Registration API provides authoritative information about individual packages including all available versions, dependencies, deprecation warnings, vulnerability information, license details, and README content.

The implementation follows a three-tier hierarchy defined by the NuGet API: Registration Index (all versions), Registration Page (subset of versions), and Registration Leaf (individual version details). For packages with ≤64 versions, the API inlines all data in the index response for efficiency. For larger packages, pages must be fetched separately to retrieve version-specific metadata.

This functionality is critical for the Browse & Search feature (FEAT-001-01) as it provides the detailed package information users need to make informed installation decisions. The API client will be implemented in the environment layer (`nugetApiClient.ts`) with domain parsers (`packageDetailsParser.ts`) to transform raw API responses into typed domain models that can be consumed by the webview UI and command handlers.

## Acceptance Criteria

### Scenario: Fetch Package Details for Small Package (≤64 versions)
**Given** a NuGet package ID with 64 or fewer versions (e.g., `Newtonsoft.Json`)  
**When** the client requests package details via the Registration Index endpoint  
**Then** the response contains inlined registration pages with all version metadata  
**And** no additional page requests are required  
**And** the response includes all versions, dependencies, and catalog entries

### Scenario: Fetch Package Details for Large Package (>64 versions)
**Given** a NuGet package ID with more than 64 versions  
**When** the client requests package details via the Registration Index endpoint  
**Then** the response contains registration page URLs without inlined items  
**And** the client can fetch individual pages by their `@id` URLs  
**And** each page contains the specified version range from `lower` to `upper`

### Scenario: Retrieve Individual Version Metadata
**Given** a package ID and specific version number  
**When** the client requests the Registration Leaf endpoint  
**Then** the response contains complete metadata for that version  
**And** includes `catalogEntry` with dependencies, deprecation, vulnerabilities  
**And** includes `packageContent` URL for .nupkg download  
**And** includes `registration` URL back to the parent index

### Scenario: Handle Package Not Found
**Given** a non-existent package ID  
**When** the client requests the Registration Index endpoint  
**Then** the API returns HTTP 404 Not Found  
**And** the client returns a domain error with code `PACKAGE_NOT_FOUND`  
**And** no retry attempts are made

### Scenario: Handle Version Not Found
**Given** a valid package ID but non-existent version  
**When** the client requests the Registration Leaf endpoint  
**Then** the API returns HTTP 404 Not Found  
**And** the client returns a domain error with code `VERSION_NOT_FOUND`

### Scenario: Parse Dependency Groups
**Given** a registration leaf response with `dependencyGroups`  
**When** the parser processes the catalog entry  
**Then** dependencies are grouped by target framework  
**And** each dependency includes `id`, `range`, and `@id` properties  
**And** framework-agnostic dependencies have empty `targetFramework` string

### Scenario: Parse Deprecation Metadata
**Given** a registration leaf with deprecation information (v3.4.0+)  
**When** the parser processes the catalog entry  
**Then** the deprecation object includes `reasons` array  
**And** includes optional `message` and `alternatePackage` recommendation  
**And** reasons are parsed from known values: `Legacy`, `CriticalBugs`, `Other`

### Scenario: Parse Vulnerability Information
**Given** a registration leaf with vulnerability data (v3.6.0+)  
**When** the parser processes the catalog entry  
**Then** each vulnerability includes `advisoryUrl` and `severity` level  
**And** severity is mapped from numeric codes: `0`=Low, `1`=Moderate, `2`=High, `3`=Critical

### Scenario: Handle README Content
**Given** a package with `readmeUrl` in catalog entry  
**When** the client fetches the README endpoint  
**Then** the response contains raw Markdown or plain text content  
**And** the content is sanitized before rendering in webview  
**And** fetch timeout is set to 60 seconds for large READMEs

### Additional Criteria
- [ ] Client discovers Registration Base URL from service index (`/v3/index.json`)
- [ ] Client prefers `RegistrationsBaseUrl/3.6.0` for SemVer 2.0.0 and vulnerability support
- [ ] All package IDs are lowercased in URL construction (`{id-lower}`)
- [ ] Version strings are lowercased in leaf URL construction (`{version-lower}`)
- [ ] Client sets 30-second timeout for index/page requests
- [ ] Client implements exponential backoff for 429 (rate limit) and 503 (service unavailable)
- [ ] Parser validates required properties (`@id`, `@type`, `catalogEntry`, `packageContent`)
- [ ] Parser handles missing optional properties gracefully (deprecation, vulnerabilities, tags)
- [ ] Tags are normalized from space-separated string or array to array format
- [ ] All URLs are validated as absolute URLs before use
- [ ] Client respects API `commitTimeStamp` for cache invalidation decisions

## Technical Implementation

### Implementation Plan
Implementation follows the provider pattern established in the domain layer, with NuGet-specific logic isolated in the environment layer and type-safe parsers in the domain layer.

### Key Components
- **File/Module**: `src/env/node/nugetApiClient.ts` - NuGet API HTTP client with service discovery and endpoint construction
- **File/Module**: `src/domain/parsers/packageDetailsParser.ts` - Parser to transform Registration API JSON to domain types
- **File/Module**: `src/domain/types/packageDetails.ts` - Domain types for package metadata, dependencies, deprecation, vulnerabilities
- **File/Module**: `src/domain/caching/detailsCache.ts` - Cache manager for package details (10 min TTL, per STORY-001-01-012)

### Technical Approach

**Service Discovery:**
1. Fetch service index from `{sourceUrl}/v3/index.json`
2. Find resource with `@type` matching `RegistrationsBaseUrl/3.6.0` (prefer for SemVer 2.0 + vulnerabilities)
3. Fallback to `RegistrationsBaseUrl/Versioned` or `RegistrationsBaseUrl/3.4.0` if 3.6.0 unavailable
4. Extract `@id` template URL for registration base

**URL Construction:**
```typescript
// Registration Index: {baseUrl}/{id-lower}/index.json
const indexUrl = `${registrationsBaseUrl}/${packageId.toLowerCase()}/index.json`;

// Registration Page: {baseUrl}/{id-lower}/page/{lower}/{upper}.json
const pageUrl = `${registrationsBaseUrl}/${packageId.toLowerCase()}/page/${lowerVersion}/${upperVersion}.json`;

// Registration Leaf: {baseUrl}/{id-lower}/{version-lower}.json
const leafUrl = `${registrationsBaseUrl}/${packageId.toLowerCase()}/${version.toLowerCase()}.json`;

// README: https://api.nuget.org/v3-flatcontainer/{id-lower}/{version-lower}/readme
const readmeUrl = `${flatContainerUrl}/${packageId.toLowerCase()}/${version.toLowerCase()}/readme`;
```

**Fetch Strategy:**
- Start with Registration Index for all versions overview
- If index page has `items` array (≤64 versions): use inlined data
- If index page lacks `items`: fetch pages via `@id` URLs as needed
- For single version details: fetch Registration Leaf directly
- Lazy-load README content only when user requests it (separate endpoint)

**Error Handling:**
- 404 on index → `PACKAGE_NOT_FOUND` domain error
- 404 on leaf → `VERSION_NOT_FOUND` domain error
- 429 → Exponential backoff (1s, 2s, 4s, 8s, max 5 retries)
- 503 → Retry with backoff (server temporarily unavailable)
- Network timeout (30s) → `NETWORK_TIMEOUT` domain error
- Parse errors → `INVALID_API_RESPONSE` domain error with details

**Parser Responsibilities:**
- Validate required properties per Registration API schema
- Transform dependency groups into typed `PackageDependency[]` arrays
- Parse deprecation reasons into enum values
- Map vulnerability severity codes to readable levels
- Normalize tags from string or array to consistent array format
- Extract license information (prefer `licenseExpression` over `licenseUrl`)
- Handle missing optional fields with safe defaults

### API/Integration Points
- **NuGet Service Index**: `GET https://api.nuget.org/v3/index.json` - Service discovery
- **Registration Index**: `GET {RegistrationsBaseUrl}/{id-lower}/index.json` - All versions
- **Registration Page**: `GET {RegistrationsBaseUrl}/{id-lower}/page/{lower}/{upper}.json` - Version subset
- **Registration Leaf**: `GET {RegistrationsBaseUrl}/{id-lower}/{version-lower}.json` - Single version
- **README Content**: `GET https://api.nuget.org/v3-flatcontainer/{id-lower}/{version-lower}/readme` - Package README
- **AbortController API**: For request cancellation when queries change
- **Domain Cache**: Integration with cache manager for 10-minute TTL (STORY-001-01-012)

## Testing Strategy

### Unit Tests
- [ ] **Parser: Valid registration index response** - Parse complete index with inlined pages and verify all versions extracted
- [ ] **Parser: Registration index with external pages** - Parse index without `items` array, verify page URLs extracted
- [ ] **Parser: Registration leaf with all metadata** - Parse leaf with dependencies, deprecation, vulnerabilities, verify all fields
- [ ] **Parser: Dependency groups by framework** - Parse multiple dependency groups, verify framework targeting
- [ ] **Parser: Deprecation metadata parsing** - Parse deprecation with reasons, message, alternatePackage
- [ ] **Parser: Vulnerability severity mapping** - Map numeric severity codes to readable levels (Low, Moderate, High, Critical)
- [ ] **Parser: Tag normalization** - Handle both string (space-separated) and array formats for tags
- [ ] **Parser: Missing optional fields** - Parse response with minimal required fields, verify safe defaults
- [ ] **Parser: Invalid JSON structure** - Handle malformed responses, return parse error
- [ ] **URL Construction: Package ID lowercasing** - Verify IDs converted to lowercase in URLs
- [ ] **URL Construction: Version lowercasing** - Verify versions converted to lowercase in leaf URLs
- [ ] **URL Construction: Special characters** - Handle package IDs with dots, hyphens correctly
- [ ] **Error Handling: 404 on index** - Return `PACKAGE_NOT_FOUND` domain error
- [ ] **Error Handling: 404 on leaf** - Return `VERSION_NOT_FOUND` domain error
- [ ] **Error Handling: Network timeout** - Return `NETWORK_TIMEOUT` after 30s
- [ ] **Error Handling: Parse error details** - Include API response snippet in error for debugging

### Integration Tests
- [ ] **Service Discovery: Fetch service index** - Real HTTP call to nuget.org, extract RegistrationsBaseUrl
- [ ] **Fetch small package details** - Fetch package with <64 versions (e.g., `DotNetEnv`), verify inlined data
- [ ] **Fetch large package details** - Fetch package with >64 versions (e.g., `Newtonsoft.Json`), verify page fetching
- [ ] **Fetch specific version leaf** - Fetch single version metadata, verify all catalog entry fields
- [ ] **Fetch package README** - Fetch README from flatcontainer endpoint, verify content returned
- [ ] **Handle 404 for non-existent package** - Attempt to fetch fake package, verify error handling
- [ ] **Handle rate limiting (429)** - Mock rate limit response, verify exponential backoff behavior
- [ ] **Timeout on slow response** - Mock slow server, verify request aborted after 30s

### Manual Testing
- [ ] **Search and select package** - Open package browser, search for "Serilog", verify details load
- [ ] **View all versions** - Select package, verify all versions listed with publish dates
- [ ] **View dependencies** - Expand dependency groups, verify framework-specific dependencies shown
- [ ] **View deprecation warning** - Select deprecated package (e.g., old Microsoft.AspNet.*), verify warning displayed
- [ ] **View README** - Click README tab, verify Markdown rendered correctly and safely
- [ ] **View license information** - Verify license expression or URL displayed
- [ ] **Test slow network** - Throttle network to 3G, verify loading states and timeouts
- [ ] **Test private feed** - Configure authenticated source, verify details fetch with credentials

## Dependencies

### Blocked By
- STORY-001-01-001 (NuGet Search API Integration) - Provides base API client and service discovery pattern
- STORY-001-01-016 (Authenticated Sources) - Provides credential handling for private feeds
- STORY-001-01-017 (Integrate NuGet Sources) - Provides source configuration for multi-source support

### Blocks
- STORY-001-01-009 (Display Package Details Panel) - Needs parsed package details to render UI
- STORY-001-01-012 (Package Details Cache) - Needs API client to wrap with caching layer
- STORY-001-02-003 (Version Selector) - Needs all package versions for dropdown
- STORY-001-02-004 (dotnet add package) - Needs package metadata for installation

### External Dependencies
- NuGet v3 Registration API (https://api.nuget.org/v3/registration5-semver1/)
- NuGet Flat Container API (https://api.nuget.org/v3-flatcontainer/) - For README downloads
- Network connectivity to package sources
- `node-fetch` or native `fetch` for HTTP requests
- `AbortController` for request cancellation

## INVEST Check

- [x] **I**ndependent - Depends on STORY-001-01-001/016/017 but implementation is isolated to API client and parser
- [x] **N**egotiable - Parser implementation details negotiable; API contract fixed by NuGet
- [x] **V**aluable - Critical for package details panel; enables informed installation decisions
- [x] **E**stimable - 5 story points based on API complexity, parsing logic, and test coverage
- [x] **S**mall - Scoped to Registration API integration only; README and caching are separate stories
- [x] **T**estable - Clear acceptance criteria with unit, integration, and manual test scenarios

## Notes

**API Version Selection:**
Prefer `RegistrationsBaseUrl/3.6.0` for full SemVer 2.0.0 and vulnerability support. If unavailable, fall back to `3.4.0` (deprecation support) or base `RegistrationsBaseUrl` (SemVer 1.0.0 only). This ensures maximum compatibility while leveraging modern features when available.

**Performance Considerations:**
The Registration API can return large payloads for packages with hundreds of versions (e.g., Newtonsoft.Json has 100+ versions). The page/leaf architecture mitigates this, but clients should:
- Cache index responses aggressively (10 min TTL per STORY-001-01-012)
- Lazy-load individual leaf data only when user selects a specific version
- Implement request deduplication (STORY-001-01-010) to prevent duplicate in-flight requests

**README Size Limits:**
Package READMEs can be arbitrarily large. Implement a 500KB size limit for README downloads. If exceeded, truncate content and provide "View full README on nuget.org" link.

**Third-Party Source Compatibility:**
Not all NuGet sources implement the full v3 Registration API spec. JFrog Artifactory and BaGet may lack vulnerability metadata. Handle missing fields gracefully with undefined values rather than failing the entire parse.

**Error Context:**
When returning domain errors for parse failures, include enough API response context (first 500 chars) in error details to aid debugging. Never expose full API responses to users (potential security issue), but log them to the output channel.

**Deprecation Reasons:**
The NuGet API defines three deprecation reasons: `Legacy`, `CriticalBugs`, `Other`. For `Other`, the `message` property provides human-readable explanation. Always display the message if present, even for `Legacy` and `CriticalBugs` reasons.

**License Expression vs URL:**
Modern packages use `licenseExpression` (SPDX identifier like "MIT" or "Apache-2.0"). Legacy packages use `licenseUrl`. Prefer `licenseExpression` when both present, but support fallback to URL for older packages.

**Target Framework Parsing:**
Dependency groups use Target Framework Monikers (TFMs) like `.NETStandard2.0`, `.NETFramework4.5`, `net6.0`. Empty string means "any framework". Parser should preserve exact TFM strings without normalization for compatibility checks in install logic.

**Version Range Format:**
NuGet version ranges use interval notation: `[1.0.0, )` = 1.0.0 or higher, `(, 2.0.0]` = 2.0.0 or lower, `[1.0.0, 2.0.0)` = 1.0.0 ≤ version < 2.0.0. Parser should pass these through as-is; range resolution is handled by dotnet CLI during installation.

## Changelog

| Date | Change | Author |
|---|---|---|
| 2025-11-16 | Story created | AI Assistant |
| 2025-12-29 | Filled out complete story details from NuGet v3 Registration API documentation | AI Assistant |

---
**Story ID**: STORY-001-01-008-package-details-api  
**Feature**: [FEAT-001-01-browse-search](../features/FEAT-001-01-browse-search.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)
