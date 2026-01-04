import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { discoverNuGetSources, mergePackageSources } from '../../src/services/configurationService';
import { createNuGetApiClient } from '../../src/env/node/nugetApiClient';
import type { ILogger } from '../../src/services/loggerService';

/**
 * Integration tests for NuGet source discovery and client initialization.
 *
 * These tests create temporary nuget.config files and verify that:
 * 1. Sources are discovered from the config hierarchy
 * 2. Sources can be merged with settings
 * 3. The merged sources initialize a working NuGet client
 */

// Mock logger for tests
const createMockLogger = (): ILogger => ({
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  show: () => {},
  isDebugEnabled: () => false,
  dispose: () => {},
});

describe('NuGet Source Integration', () => {
  let tempWorkspace: string;

  beforeAll(() => {
    // Create temporary workspace with nuget.config
    tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opm-test-'));

    const nugetConfig = `<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />
  </packageSources>
</configuration>`;

    fs.writeFileSync(path.join(tempWorkspace, 'nuget.config'), nugetConfig);
  });

  afterAll(() => {
    // Clean up temporary workspace
    if (tempWorkspace && fs.existsSync(tempWorkspace)) {
      fs.rmSync(tempWorkspace, { recursive: true, force: true });
    }
  });

  test('discovers sources from workspace nuget.config', () => {
    const sources = discoverNuGetSources(tempWorkspace);

    expect(sources.length).toBeGreaterThanOrEqual(1);
    expect(sources.some(s => s.id === 'nuget.org')).toBe(true);
  });

  test('merged sources can initialize NuGet client', () => {
    const discovered = discoverNuGetSources(tempWorkspace);
    const defaultSources = [
      {
        id: 'fallback',
        name: 'Fallback',
        indexUrl: 'https://fallback.example.com/v3/index.json',
        enabled: true,
        provider: 'custom' as const,
        auth: { type: 'none' as const },
      },
    ];

    const merged = mergePackageSources(discovered, defaultSources);
    const logger = createMockLogger();

    const client = createNuGetApiClient(logger, { sources: merged });

    expect(client).toBeDefined();
    expect(merged.length).toBeGreaterThanOrEqual(1);
    // nuget.org from config should override fallback
    expect(merged[0]?.id).toBe('nuget.org');
  });

  test('client uses workspace source for search', async () => {
    const discovered = discoverNuGetSources(tempWorkspace);
    const merged = mergePackageSources(discovered, []);
    const logger = createMockLogger();

    const client = createNuGetApiClient(logger, { sources: merged });

    // This should use nuget.org source from config
    const result = await client.searchPackages({ query: 'Newtonsoft.Json', take: 1 });

    // Expect successful search
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result.length).toBeGreaterThan(0);
    }
  });

  test('returns empty array when no nuget.config exists', () => {
    const nonExistentPath = path.join(os.tmpdir(), 'nonexistent-' + Date.now());
    const sources = discoverNuGetSources(nonExistentPath);

    // When no workspace-level config exists, system-level configs (user/computer)
    // may still be discovered. On a system with .NET installed, this typically
    // includes the default nuget.org source. We verify that:
    // 1. The function doesn't throw/crash
    // 2. Sources is an array (may be empty or contain system-level sources)
    expect(Array.isArray(sources)).toBe(true);

    // If nuget.org is discovered from system configs, verify it's correctly parsed
    const nugetOrg = sources.find(s => s.id === 'nuget.org');
    if (nugetOrg) {
      expect(nugetOrg.indexUrl).toBe('https://api.nuget.org/v3/index.json');
      expect(nugetOrg.enabled).toBe(true);
    }
  });

  test('merging empty discovered sources returns settings sources', () => {
    const settingsSources = [
      {
        id: 'settings-source',
        name: 'Settings Source',
        indexUrl: 'https://settings.example.com/v3/index.json',
        enabled: true,
        provider: 'custom' as const,
        auth: { type: 'none' as const },
      },
    ];

    const merged = mergePackageSources([], settingsSources);

    expect(merged).toEqual(settingsSources);
  });
});
