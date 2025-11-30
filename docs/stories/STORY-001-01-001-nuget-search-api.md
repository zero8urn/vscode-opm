# STORY-001-01-001-nuget-search-api

**Feature**: [FEAT-001-01-browse-search](../features/FEAT-001-01-browse-search.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Done  
**Priority**: High  
**Estimate**: 5 Story Points  
**Created**: 2025-11-16  
**Last Updated**: 2025-11-30

## User Story

**As a** developer searching for NuGet packages  
**I want** the extension to query the NuGet v3 Search API  
**So that** I can find packages matching my search criteria

## Description

This story implements the NuGet API client for the Search service, enabling package discovery by name or keyword. The client handles HTTP requests to the NuGet v3 Search endpoint, parses JSON responses, and transforms them into domain model objects (`PackageSearchResult[]`).

The implementation includes proper error handling for network failures, API rate limiting, and invalid responses. It supports all search parameters including query string, prerelease inclusion, skip/take for pagination, and framework filtering.

The search parser extracts essential package metadata from the NuGet API response: package ID, version, description, authors, download count, icon URL, and verification status.

## Acceptance Criteria

### Scenario: Successful Search Returns Results
**Given** the NuGet API is available  
**When** I search for "Newtonsoft.Json"  
**Then** the API client should return an array of PackageSearchResult objects  
**And** each result should include id, version, description, authors, downloadCount, iconUrl

### Scenario: Search with Prerelease Filter
**Given** I search with `{ prerelease: true }`  
**When** the API request is made  
**Then** the URL should include `prerelease=true` parameter  
**And** results should include prerelease versions

### Scenario: API Rate Limiting Handled
**Given** the NuGet API returns 429 Too Many Requests  
**When** the search is executed  
**Then** the client should throw a RateLimitError  
**And** the error should include retry-after duration

### Additional Criteria
- [ ] Client calls `https://azuresearch-usnc.nuget.org/query`
- [ ] Supports parameters: q, prerelease, skip, take, semVerLevel
- [ ] Parses JSON response `data[]` array into PackageSearchResult
- [ ] Handles network errors with timeout (30s)
- [ ] Returns empty array for zero results (not null/undefined)

## Technical Implementation

### Key Components
- **File/Module**: `src/env/node/nugetApiClient.ts` - HTTP client for NuGet API
- **File/Module**: `src/domain/parsers/searchParser.ts` - JSON to domain model parser
- **File/Module**: `src/domain/models/packageSearchResult.ts` - Domain model interface

### Technical Approach
```typescript
export interface PackageSearchResult {
  id: string;
  version: string;
  description: string;
  authors: string[];
  downloadCount: number;
  iconUrl: string;
  verified: boolean;
  tags: string[];
}

export class NuGetApiClient {
  async searchPackages(options: SearchOptions): Promise<PackageSearchResult[]> {
    // GET https://azuresearch-usnc.nuget.org/query?q={query}&prerelease={bool}&skip={n}&take={n}
  }
}
```

### API/Integration Points
- NuGet Search API v3: https://azuresearch-usnc.nuget.org/query
- Response format: `{ totalHits: number, data: PackageSearchResult[] }`

## Testing Strategy

### Unit Tests
- [ ] Test searchParser transforms API response to domain model
- [ ] Test empty query returns all packages (no 'q' parameter)
- [ ] Test skip/take pagination parameters
- [ ] Test prerelease=false excludes prerelease versions

### Integration Tests
- [ ] Integration test: Search for "Newtonsoft.Json" returns expected results
- [ ] Integration test: Search with non-existent package returns empty array
- [ ] Integration test: Rate limiting returns appropriate error

### Manual Testing
- [ ] Manual test: Search for popular packages (Newtonsoft, Serilog, AutoMapper)
- [ ] Manual test: Verify iconUrl resolves to valid image
- [ ] Manual test: Test with slow network (DevTools throttling)

## Dependencies

### Blocked By
None

### Blocks
- [STORY-001-01-002-search-webview-ui] consumes search results for display
- [STORY-001-01-011-search-cache] caches search API responses

### External Dependencies
- node-fetch or axios for HTTP requests
- NuGet API availability (https://api.nuget.org)

## INVEST Check

- [x] **I**ndependent - Can be developed and tested independently
- [x] **N**egotiable - Response parsing details can be refined
- [x] **V**aluable - Core functionality for package discovery
- [x] **E**stimable - 5 story points (2-3 days)
- [x] **S**mall - Focused on single API endpoint
- [x] **T**estable - Clear API contract with unit and integration tests

## Notes

NuGet Search API documentation: https://learn.microsoft.com/en-us/nuget/api/search-query-service-resource

The API has a rate limit of ~100 requests per minute per IP. Implement exponential backoff for 429 responses.

Consider implementing request cancellation using AbortController when user types new search query before previous request completes.

The `verified` field indicates packages from verified publishers (Microsoft, .NET Foundation, etc.) and should be prominently displayed in UI.

Default to `semVerLevel=2.0.0` to support modern SemVer 2.0 packages.

## Changelog

| Date | Change | Author |
|---|---|---|
| 2025-11-16 | Story created | AI Assistant |

---
**Story ID**: STORY-001-01-001-nuget-search-api  
**Feature**: [FEAT-001-01-browse-search](../features/FEAT-001-01-browse-search.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)
