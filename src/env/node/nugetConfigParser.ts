import * as fs from 'fs';
import * as path from 'path';
import type { PackageSource, PackageSourceProvider } from '../domain/models/nugetApiOptions';

/**
 * Parses a nuget.config XML file to extract package sources.
 *
 * @param configPath - Absolute path to nuget.config file
 * @returns Array of package sources
 */
export function parseNuGetConfig(configPath: string): PackageSource[] {
  if (!fs.existsSync(configPath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return parseNuGetConfigXml(content);
  } catch {
    return [];
  }
}

/**
 * Parses nuget.config XML content.
 *
 * @param xml - nuget.config XML content
 * @returns Array of package sources
 */
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
      searchUrl: normalizeSearchUrl(attributes.value),
      enabled: true,
    };

    sources.push(source);
  }

  return sources;
}

/**
 * Parses XML attribute string into key-value object.
 */
function parseAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /(\w+)="([^"]+)"/g;
  const matches = attrString.matchAll(attrRegex);

  for (const match of matches) {
    const key = match[1];
    const value = match[2];
    if (key && value) {
      attrs[key] = value;
    }
  }

  return attrs;
}

/**
 * Detects package source provider from URL.
 */
function detectProvider(url: string): PackageSourceProvider {
  const lower = url.toLowerCase();

  if (lower.includes('nuget.org') || lower.includes('api.nuget.org')) {
    return 'nuget.org';
  }
  if (lower.includes('artifactory')) {
    return 'artifactory';
  }
  if (lower.includes('pkgs.dev.azure.com') || lower.includes('visualstudio.com')) {
    return 'azure-artifacts';
  }
  if (lower.includes('nuget.pkg.github.com')) {
    return 'github';
  }
  if (lower.includes('myget.org')) {
    return 'myget';
  }

  return 'custom';
}

/**
 * Normalizes source URL to search endpoint.
 * Different providers have different URL patterns.
 */
function normalizeSearchUrl(sourceUrl: string): string {
  const provider = detectProvider(sourceUrl);

  // Remove trailing /index.json or /v3/index.json
  const baseUrl = sourceUrl.replace(/\/index\.json$/, '').replace(/\/v3\/index\.json$/, '');

  switch (provider) {
    case 'nuget.org':
      // NuGet.org uses separate search endpoint
      return 'https://azuresearch-usnc.nuget.org/query';

    case 'artifactory':
      // Artifactory: https://artifactory.company.com/artifactory/api/nuget/v3/repo-name
      // Search: https://artifactory.company.com/artifactory/api/nuget/v3/repo-name/query
      return `${baseUrl}/query`;

    case 'azure-artifacts':
      // Azure Artifacts: https://pkgs.dev.azure.com/org/_packaging/feed/nuget/v3/index.json
      // Search: https://pkgs.dev.azure.com/org/_packaging/feed/nuget/v3/query2
      return baseUrl.replace(/\/index\.json$/, '') + '/query2';

    case 'github':
      // GitHub Packages doesn't support v3 search API - would need GraphQL
      return baseUrl;

    case 'myget':
      // MyGet: https://www.myget.org/F/feed-name/api/v3/index.json
      // Search: https://www.myget.org/F/feed-name/api/v3/query
      return baseUrl.replace(/\/index\.json$/, '') + '/query';

    default:
      // Assume v3 protocol with /query endpoint
      return `${baseUrl}/query`;
  }
}

/**
 * Discovers nuget.config files in workspace.
 *
 * Searches in order:
 * 1. Workspace root
 * 2. .nuget folder
 * 3. User profile directory
 *
 * @param workspaceRoot - Workspace root path
 * @returns Path to first found nuget.config, or undefined
 */
export function discoverNuGetConfig(workspaceRoot: string): string | undefined {
  const candidates = [
    path.join(workspaceRoot, 'nuget.config'),
    path.join(workspaceRoot, 'NuGet.config'),
    path.join(workspaceRoot, '.nuget', 'nuget.config'),
    path.join(workspaceRoot, '.nuget', 'NuGet.config'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}
