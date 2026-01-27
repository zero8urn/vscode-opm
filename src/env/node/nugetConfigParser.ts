import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { PackageSource, PackageSourceProvider, PackageSourceAuth } from '../../domain/models/nugetApiOptions';

/**
 * Parses a nuget.config XML file to extract package sources.
 *
 * **Security Note**: This function loads credentials from nuget.config into memory.
 * In production, this should only be called in trusted workspaces to prevent
 * malicious nuget.config files from being parsed.
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
 * Extracts an attribute value from XML content.
 *
 * @param content - XML content to search
 * @param key - Attribute key to extract (case-insensitive)
 * @returns Attribute value or undefined
 */
function extractAttributeValue(content: string, key: string): string | undefined {
  const regex = new RegExp(`<add\\s+key="${key}"\\s+value="([^"]+)"`, 'i');
  const match = content.match(regex);
  return match?.[1];
}

/**
 * Parses credentials from <packageSourceCredentials> section.
 *
 * @param xml - nuget.config XML content
 * @returns Map of source name to auth configuration
 */
function parseCredentialsSection(xml: string): Record<string, PackageSourceAuth> {
  const credentials: Record<string, PackageSourceAuth> = {};

  // Extract <packageSourceCredentials> section
  const credRegex = /<packageSourceCredentials>([\s\S]*?)<\/packageSourceCredentials>/i;
  const match = xml.match(credRegex);
  if (!match) return credentials;

  const credSection = match[1] ?? '';

  // Extract each source's credentials: <SourceName>...</SourceName>
  const sourceRegex = /<(\w+)>([\s\S]*?)<\/\1>/g;
  for (const sourceMatch of credSection.matchAll(sourceRegex)) {
    const sourceName = sourceMatch[1];
    const sourceContent = sourceMatch[2];

    if (!sourceName || !sourceContent) continue;

    const username = extractAttributeValue(sourceContent, 'Username');
    const password = extractAttributeValue(sourceContent, 'ClearTextPassword');

    if (username && password) {
      credentials[sourceName] = {
        type: 'basic', // Default to basic, can be overridden by provider detection
        username,
        password,
      };
    }
  }

  return credentials;
}

/**
 * Applies provider-specific auth type overrides.
 *
 * @param auth - Base auth configuration
 * @param provider - Package source provider
 * @returns Updated auth configuration
 */
function applyProviderAuthType(auth: PackageSourceAuth, provider: PackageSourceProvider): PackageSourceAuth {
  const updated = { ...auth };

  switch (provider) {
    case 'azure-artifacts':
      updated.type = 'bearer';
      break;
    case 'github':
      updated.type = 'api-key';
      updated.apiKeyHeader = 'X-NuGet-ApiKey';
      break;
    case 'myget':
      updated.type = 'api-key';
      updated.apiKeyHeader = 'X-NuGet-ApiKey';
      break;
    case 'artifactory':
      // Keep basic as default, user can override
      break;
    case 'nuget.org':
      // Public, should not have auth
      break;
    case 'custom':
      // Keep basic as default
      break;
  }

  return updated;
}

/**
 * Parses nuget.config XML content.
 *
 * @param xml - nuget.config XML content
 * @returns Array of package sources with merged credentials
 */
export function parseNuGetConfigXml(xml: string): PackageSource[] {
  const sources: PackageSource[] = [];

  // Extract <packageSources> section first
  const sourcesRegex = /<packageSources>([\s\S]*?)<\/packageSources>/i;
  const sourcesMatch = xml.match(sourcesRegex);

  if (!sourcesMatch) {
    return sources;
  }

  const sourcesSection = sourcesMatch[1] ?? '';

  // Simple regex-based XML parsing (good enough for nuget.config structure)
  // Format: <add key="SourceName" value="https://url" protocolVersion="3" />
  const addTagRegex = /<add\s+([^>]+)\/>/g;
  const matches = sourcesSection.matchAll(addTagRegex);

  for (const match of matches) {
    const attrString = match[1];
    if (!attrString) continue;

    const attributes = parseAttributes(attrString);

    if (!attributes.key || !attributes.value) {
      continue;
    }

    // Skip local file paths - only support HTTP(S) package sources
    const urlLower = attributes.value.toLowerCase();
    if (!urlLower.startsWith('http://') && !urlLower.startsWith('https://')) {
      // Local file path like C:\... or \\network\share - skip it
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

  // Parse credentials and merge with sources
  const credentials = parseCredentialsSection(xml);

  return sources.map(source => {
    const auth = credentials[source.id];

    if (auth) {
      // Apply provider-specific auth type overrides
      const updatedAuth = applyProviderAuthType(auth, source.provider);
      return { ...source, auth: updatedAuth };
    }

    return source;
  });
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
 * Gets user-level NuGet config directory.
 *
 * @returns Path to user config directory, or undefined if cannot be determined
 */
function getUserConfigDir(): string | undefined {
  const platform = os.platform();

  if (platform === 'win32') {
    // Windows: %APPDATA%\NuGet
    const appdata = process.env.APPDATA;
    return appdata ? path.join(appdata, 'NuGet') : undefined;
  }

  // Mac/Linux: Prefer ~/.nuget/NuGet, fallback to ~/.config/NuGet
  const home = os.homedir();
  if (!home) return undefined;

  // Check ~/.nuget/NuGet first (preferred by .NET CLI)
  const nugetDir = path.join(home, '.nuget', 'NuGet');
  if (fs.existsSync(nugetDir)) {
    return nugetDir;
  }

  // Fallback to ~/.config/NuGet (used by Mono)
  return path.join(home, '.config', 'NuGet');
}

/**
 * Gets additional user-level config directory.
 *
 * @returns Path to additional config directory, or undefined if cannot be determined
 */
function getAdditionalUserConfigDir(): string | undefined {
  const platform = os.platform();

  if (platform === 'win32') {
    // Windows: %APPDATA%\NuGet\config
    const appdata = process.env.APPDATA;
    return appdata ? path.join(appdata, 'NuGet', 'config') : undefined;
  }

  // Mac/Linux: Match the user config directory pattern
  const home = os.homedir();
  if (!home) return undefined;

  // Check ~/.nuget/config first
  const nugetConfigDir = path.join(home, '.nuget', 'config');
  if (fs.existsSync(nugetConfigDir)) {
    return nugetConfigDir;
  }

  // Fallback to ~/.config/NuGet/config
  return path.join(home, '.config', 'NuGet', 'config');
}

/**
 * Gets computer-level NuGet config directory.
 *
 * @returns Path to computer config directory, or undefined if cannot be determined
 */
function getComputerConfigDir(): string | undefined {
  const platform = os.platform();
  const commonAppData = process.env.NUGET_COMMON_APPLICATION_DATA;

  if (commonAppData) {
    return path.join(commonAppData, 'NuGet', 'Config');
  }

  if (platform === 'win32') {
    // Windows: %ProgramFiles(x86)%\NuGet\Config
    const programFiles = process.env['ProgramFiles(x86)'] ?? process.env.ProgramFiles;
    return programFiles ? path.join(programFiles, 'NuGet', 'Config') : undefined;
  }

  if (platform === 'darwin') {
    // macOS: /Library/Application Support
    return '/Library/Application Support';
  }

  // Linux: /etc/opt/NuGet/Config
  return '/etc/opt/NuGet/Config';
}

/**
 * Finds all config files in a directory hierarchy, traversing from startPath to drive root.
 *
 * @param startPath - Starting directory path
 * @returns Array of config file paths in order (closest to startPath first)
 */
function findConfigsToRoot(startPath: string): string[] {
  const configs: string[] = [];
  let currentDir = path.resolve(startPath);
  const rootDir = path.parse(currentDir).root;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Check for nuget.config or NuGet.config in current directory
    const candidates = [path.join(currentDir, 'nuget.config'), path.join(currentDir, 'NuGet.config')];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate) && !configs.includes(candidate)) {
        configs.push(candidate);
        break; // Only add one config per directory
      }
    }

    // Stop at root
    if (currentDir === rootDir) {
      break;
    }

    // Move up one directory
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break; // Safety check
    }
    currentDir = parentDir;
  }

  return configs;
}

/**
 * Discovers all NuGet config files following NuGet's hierarchy.
 *
 * Search order:
 * 1. Solution hierarchy (workspace folder → drive root)
 * 2. User-level config
 * 3. Additional user configs (*.Config files in config/ subfolder)
 * 4. Computer-level config
 *
 * @param workspaceRoot - Workspace root path
 * @returns Array of config file paths in priority order (highest priority first)
 *
 * @remarks Follows NuGet CLI behavior for config file discovery.
 * Settings from earlier files in the array override later files.
 */
export function discoverNuGetConfigs(workspaceRoot: string): string[] {
  const allConfigs: string[] = [];

  // 1. Solution hierarchy: workspace → drive root
  const solutionConfigs = findConfigsToRoot(workspaceRoot);
  allConfigs.push(...solutionConfigs);

  // 2. User-level config
  const userConfigDir = getUserConfigDir();
  if (userConfigDir) {
    const userConfig = path.join(userConfigDir, 'NuGet.Config');
    if (fs.existsSync(userConfig)) {
      allConfigs.push(userConfig);
    }
  }

  // 3. Additional user configs (*.Config or *.config files)
  const additionalConfigDir = getAdditionalUserConfigDir();
  if (additionalConfigDir && fs.existsSync(additionalConfigDir)) {
    try {
      const files = fs.readdirSync(additionalConfigDir);
      const configFiles = files
        .filter(f => f.endsWith('.Config') || f.endsWith('.config'))
        .map(f => path.join(additionalConfigDir, f))
        .filter(f => fs.existsSync(f));
      allConfigs.push(...configFiles);
    } catch {
      // Ignore errors reading directory
    }
  }

  // 4. Computer-level config
  const computerConfigDir = getComputerConfigDir();
  if (computerConfigDir && fs.existsSync(computerConfigDir)) {
    try {
      const files = fs.readdirSync(computerConfigDir);
      const configFiles = files
        .filter(f => f.endsWith('.Config') || f.endsWith('.config'))
        .map(f => path.join(computerConfigDir, f))
        .filter(f => fs.existsSync(f));
      allConfigs.push(...configFiles);
    } catch {
      // Ignore errors reading directory
    }
  }

  return allConfigs;
}

/**
 * Merges package sources from multiple NuGet config files.
 *
 * Applies NuGet's merge rules:
 * - Sources are combined from all configs
 * - Earlier configs (higher priority) override later configs for duplicate sources
 * - `<clear />` in a config removes all sources from lower-priority configs
 *
 * @param configPaths - Array of config file paths in priority order (highest first)
 * @returns Merged array of package sources
 */
export function mergeNuGetConfigs(configPaths: string[]): PackageSource[] {
  const sourceMap = new Map<string, PackageSource>();
  let clearFound = false;

  // Process configs in reverse order (lowest priority first)
  // so higher priority configs can override
  for (let i = configPaths.length - 1; i >= 0; i--) {
    const configPath = configPaths[i];
    if (!configPath) continue;

    const content = fs.readFileSync(configPath, 'utf-8');

    // Check for <clear /> in packageSources section
    const sourcesRegex = /<packageSources>([\s\S]*?)<\/packageSources>/i;
    const sourcesMatch = content.match(sourcesRegex);
    if (sourcesMatch) {
      const sourcesSection = sourcesMatch[1] ?? '';
      if (/<clear\s*\/>/.test(sourcesSection)) {
        // Clear all previously loaded sources
        sourceMap.clear();
        clearFound = true;
      }
    }

    // Parse sources from this config
    const sources = parseNuGetConfigXml(content);

    // Add/override sources in map
    for (const source of sources) {
      sourceMap.set(source.id, source);
    }
  }

  return Array.from(sourceMap.values());
}
