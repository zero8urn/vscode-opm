import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { parseNuGetConfigXml, discoverNuGetConfigs, mergeNuGetConfigs } from '../nugetConfigParser';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('nugetConfigParser', () => {
  describe('parseNuGetConfigXml', () => {
    test('parses basic package source without credentials', () => {
      const xml = `
        <configuration>
          <packageSources>
            <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />
          </packageSources>
        </configuration>
      `;

      const sources = parseNuGetConfigXml(xml);

      expect(sources).toHaveLength(1);
      expect(sources[0]).toMatchObject({
        id: 'nuget.org',
        name: 'nuget.org',
        provider: 'nuget.org',
        indexUrl: 'https://api.nuget.org/v3/index.json',
        enabled: true,
      });
      expect(sources[0]?.auth).toBeUndefined();
    });

    test('parses credentials section and merges with sources', () => {
      const xml = `
        <configuration>
          <packageSources>
            <add key="MyPrivateFeed" value="https://pkgs.example.com/nuget/v3/index.json" />
          </packageSources>
          <packageSourceCredentials>
            <MyPrivateFeed>
              <add key="Username" value="john.doe" />
              <add key="ClearTextPassword" value="secret123" />
            </MyPrivateFeed>
          </packageSourceCredentials>
        </configuration>
      `;

      const sources = parseNuGetConfigXml(xml);

      expect(sources).toHaveLength(1);
      expect(sources[0]).toMatchObject({
        id: 'MyPrivateFeed',
        name: 'MyPrivateFeed',
        indexUrl: 'https://pkgs.example.com/nuget/v3/index.json',
        enabled: true,
      });
      expect(sources[0]?.auth).toMatchObject({
        type: 'basic',
        username: 'john.doe',
        password: 'secret123',
      });
    });

    test('applies provider-specific auth type overrides for Azure Artifacts', () => {
      const xml = `
        <configuration>
          <packageSources>
            <add key="AzureFeed" value="https://pkgs.dev.azure.com/org/_packaging/feed/nuget/v3/index.json" />
          </packageSources>
          <packageSourceCredentials>
            <AzureFeed>
              <add key="Username" value="az" />
              <add key="ClearTextPassword" value="ghp_abc123xyz" />
            </AzureFeed>
          </packageSourceCredentials>
        </configuration>
      `;

      const sources = parseNuGetConfigXml(xml);

      expect(sources).toHaveLength(1);
      expect(sources[0]?.provider).toBe('azure-artifacts');
      expect(sources[0]?.auth).toMatchObject({
        type: 'bearer',
        username: 'az',
        password: 'ghp_abc123xyz',
      });
    });

    test('applies provider-specific auth type overrides for GitHub Packages', () => {
      const xml = `
        <configuration>
          <packageSources>
            <add key="GitHubFeed" value="https://nuget.pkg.github.com/owner/index.json" />
          </packageSources>
          <packageSourceCredentials>
            <GitHubFeed>
              <add key="Username" value="token" />
              <add key="ClearTextPassword" value="ghp_xyz789abc" />
            </GitHubFeed>
          </packageSourceCredentials>
        </configuration>
      `;

      const sources = parseNuGetConfigXml(xml);

      expect(sources).toHaveLength(1);
      expect(sources[0]?.provider).toBe('github');
      expect(sources[0]?.auth).toMatchObject({
        type: 'api-key',
        apiKeyHeader: 'X-NuGet-ApiKey',
        username: 'token',
        password: 'ghp_xyz789abc',
      });
    });

    test('applies provider-specific auth type overrides for MyGet', () => {
      const xml = `
        <configuration>
          <packageSources>
            <add key="MyGetFeed" value="https://myget.org/F/feed/api/v3/index.json" />
          </packageSources>
          <packageSourceCredentials>
            <MyGetFeed>
              <add key="Username" value="user" />
              <add key="ClearTextPassword" value="apikey123" />
            </MyGetFeed>
          </packageSourceCredentials>
        </configuration>
      `;

      const sources = parseNuGetConfigXml(xml);

      expect(sources).toHaveLength(1);
      expect(sources[0]?.provider).toBe('myget');
      expect(sources[0]?.auth).toMatchObject({
        type: 'api-key',
        apiKeyHeader: 'X-NuGet-ApiKey',
        username: 'user',
        password: 'apikey123',
      });
    });

    test('handles multiple sources with mixed credentials', () => {
      const xml = `
        <configuration>
          <packageSources>
            <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />
            <add key="PrivateFeed" value="https://private.example.com/nuget/v3/index.json" />
            <add key="AnotherFeed" value="https://another.example.com/nuget/v3/index.json" />
          </packageSources>
          <packageSourceCredentials>
            <PrivateFeed>
              <add key="Username" value="user1" />
              <add key="ClearTextPassword" value="pass1" />
            </PrivateFeed>
          </packageSourceCredentials>
        </configuration>
      `;

      const sources = parseNuGetConfigXml(xml);

      expect(sources).toHaveLength(3);

      // nuget.org - no credentials
      expect(sources[0]?.id).toBe('nuget.org');
      expect(sources[0]?.auth).toBeUndefined();

      // PrivateFeed - with credentials
      expect(sources[1]?.id).toBe('PrivateFeed');
      expect(sources[1]?.auth).toMatchObject({
        type: 'basic',
        username: 'user1',
        password: 'pass1',
      });

      // AnotherFeed - no credentials
      expect(sources[2]?.id).toBe('AnotherFeed');
      expect(sources[2]?.auth).toBeUndefined();
    });

    test('returns empty object for malformed credentials XML', () => {
      const xml = `
        <configuration>
          <packageSources>
            <add key="MyFeed" value="https://example.com/nuget/v3/index.json" />
          </packageSources>
          <packageSourceCredentials>
            <MyFeed>
              <add key="Username" value="user" />
              <!-- Missing password -->
            </MyFeed>
          </packageSourceCredentials>
        </configuration>
      `;

      const sources = parseNuGetConfigXml(xml);

      expect(sources).toHaveLength(1);
      expect(sources[0]?.auth).toBeUndefined();
    });

    test('handles missing packageSourceCredentials section', () => {
      const xml = `
        <configuration>
          <packageSources>
            <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />
          </packageSources>
        </configuration>
      `;

      const sources = parseNuGetConfigXml(xml);

      expect(sources).toHaveLength(1);
      expect(sources[0]?.auth).toBeUndefined();
    });

    test('handles credentials for non-existent source', () => {
      const xml = `
        <configuration>
          <packageSources>
            <add key="RealFeed" value="https://real.example.com/nuget/v3/index.json" />
          </packageSources>
          <packageSourceCredentials>
            <NonExistentFeed>
              <add key="Username" value="user" />
              <add key="ClearTextPassword" value="pass" />
            </NonExistentFeed>
          </packageSourceCredentials>
        </configuration>
      `;

      const sources = parseNuGetConfigXml(xml);

      expect(sources).toHaveLength(1);
      expect(sources[0]?.id).toBe('RealFeed');
      expect(sources[0]?.auth).toBeUndefined();
    });

    test('filters out local file paths (Windows and UNC)', () => {
      const xml = `
        <configuration>
          <packageSources>
            <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />
            <add key="LocalCache" value="C:\\Program Files (x86)\\Microsoft SDKs\\NuGetPackages\\" />
            <add key="NetworkShare" value="\\\\server\\share\\packages" />
            <add key="RelativePath" value="..\\packages" />
            <add key="PrivateFeed" value="https://private.example.com/nuget/v3/index.json" />
          </packageSources>
        </configuration>
      `;

      const sources = parseNuGetConfigXml(xml);

      // Should only include HTTP(S) sources
      expect(sources).toHaveLength(2);
      expect(sources.map(s => s.id)).toEqual(['nuget.org', 'PrivateFeed']);
      expect(sources.every(s => s.indexUrl.startsWith('http'))).toBe(true);
    });
  });

  describe('discoverNuGetConfigs', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nuget-test-'));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test('discovers workspace config', () => {
      const configPath = path.join(tempDir, 'nuget.config');
      fs.writeFileSync(
        configPath,
        `
        <configuration>
          <packageSources>
            <add key="workspace" value="https://workspace.example.com/v3/index.json" />
          </packageSources>
        </configuration>
      `,
      );

      const configs = discoverNuGetConfigs(tempDir);

      expect(configs.length).toBeGreaterThan(0);
      expect(configs[0]).toBe(configPath);
    });

    test('discovers configs in hierarchy', () => {
      const subDir = path.join(tempDir, 'project', 'src');
      fs.mkdirSync(subDir, { recursive: true });

      const rootConfig = path.join(tempDir, 'nuget.config');
      const projectConfig = path.join(tempDir, 'project', 'nuget.config');

      fs.writeFileSync(
        rootConfig,
        `
        <configuration>
          <packageSources>
            <add key="root" value="https://root.example.com/v3/index.json" />
          </packageSources>
        </configuration>
      `,
      );

      fs.writeFileSync(
        projectConfig,
        `
        <configuration>
          <packageSources>
            <add key="project" value="https://project.example.com/v3/index.json" />
          </packageSources>
        </configuration>
      `,
      );

      const configs = discoverNuGetConfigs(subDir);

      // Should find project config first (higher priority), then root config
      expect(configs.length).toBeGreaterThanOrEqual(2);
      expect(configs[0]).toBe(projectConfig);
      expect(configs[1]).toBe(rootConfig);
    });

    test('includes user-level config on Windows', () => {
      if (os.platform() !== 'win32') {
        return; // Skip on non-Windows
      }

      const configs = discoverNuGetConfigs(tempDir);

      // User config should be included if APPDATA is set
      const appdata = process.env.APPDATA;
      if (appdata) {
        const userConfig = path.join(appdata, 'NuGet', 'NuGet.Config');
        if (fs.existsSync(userConfig)) {
          expect(configs).toContain(userConfig);
        }
      }
    });

    test('includes user-level config on Unix', () => {
      if (os.platform() === 'win32') {
        return; // Skip on Windows
      }

      const configs = discoverNuGetConfigs(tempDir);

      // User config should be included
      const home = os.homedir();
      const nugetConfig = path.join(home, '.nuget', 'NuGet', 'NuGet.Config');
      const dotconfigConfig = path.join(home, '.config', 'NuGet', 'NuGet.Config');

      if (fs.existsSync(nugetConfig)) {
        expect(configs).toContain(nugetConfig);
      } else if (fs.existsSync(dotconfigConfig)) {
        expect(configs).toContain(dotconfigConfig);
      }
    });
  });

  describe('mergeNuGetConfigs', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nuget-merge-test-'));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test('merges sources from multiple configs', () => {
      const config1 = path.join(tempDir, 'config1.config');
      const config2 = path.join(tempDir, 'config2.config');

      fs.writeFileSync(
        config1,
        `
        <configuration>
          <packageSources>
            <add key="source1" value="https://source1.example.com/v3/index.json" />
          </packageSources>
        </configuration>
      `,
      );

      fs.writeFileSync(
        config2,
        `
        <configuration>
          <packageSources>
            <add key="source2" value="https://source2.example.com/v3/index.json" />
          </packageSources>
        </configuration>
      `,
      );

      const sources = mergeNuGetConfigs([config1, config2]);

      expect(sources).toHaveLength(2);
      expect(sources.find(s => s.id === 'source1')).toBeDefined();
      expect(sources.find(s => s.id === 'source2')).toBeDefined();
    });

    test('higher priority config overrides lower priority', () => {
      const highPriority = path.join(tempDir, 'high.config');
      const lowPriority = path.join(tempDir, 'low.config');

      fs.writeFileSync(
        highPriority,
        `
        <configuration>
          <packageSources>
            <add key="nuget.org" value="https://custom.nuget.org/v3/index.json" />
          </packageSources>
        </configuration>
      `,
      );

      fs.writeFileSync(
        lowPriority,
        `
        <configuration>
          <packageSources>
            <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />
          </packageSources>
        </configuration>
      `,
      );

      const sources = mergeNuGetConfigs([highPriority, lowPriority]);

      expect(sources).toHaveLength(1);
      expect(sources[0]?.indexUrl).toBe('https://custom.nuget.org/v3/index.json');
    });

    test('respects clear directive', () => {
      const config1 = path.join(tempDir, 'config1.config');
      const config2 = path.join(tempDir, 'config2.config');

      fs.writeFileSync(
        config1,
        `
        <configuration>
          <packageSources>
            <clear />
            <add key="private" value="https://private.example.com/v3/index.json" />
          </packageSources>
        </configuration>
      `,
      );

      fs.writeFileSync(
        config2,
        `
        <configuration>
          <packageSources>
            <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />
          </packageSources>
        </configuration>
      `,
      );

      const sources = mergeNuGetConfigs([config1, config2]);

      // Clear in config1 should remove nuget.org from config2
      expect(sources).toHaveLength(1);
      expect(sources[0]?.id).toBe('private');
    });

    test('merges credentials from multiple configs', () => {
      const config1 = path.join(tempDir, 'config1.config');
      const config2 = path.join(tempDir, 'config2.config');

      fs.writeFileSync(
        config1,
        `
        <configuration>
          <packageSources>
            <add key="feed1" value="https://feed1.example.com/v3/index.json" />
          </packageSources>
          <packageSourceCredentials>
            <feed1>
              <add key="Username" value="user1" />
              <add key="ClearTextPassword" value="pass1" />
            </feed1>
          </packageSourceCredentials>
        </configuration>
      `,
      );

      fs.writeFileSync(
        config2,
        `
        <configuration>
          <packageSources>
            <add key="feed2" value="https://feed2.example.com/v3/index.json" />
          </packageSources>
          <packageSourceCredentials>
            <feed2>
              <add key="Username" value="user2" />
              <add key="ClearTextPassword" value="pass2" />
            </feed2>
          </packageSourceCredentials>
        </configuration>
      `,
      );

      const sources = mergeNuGetConfigs([config1, config2]);

      expect(sources).toHaveLength(2);
      expect(sources.find(s => s.id === 'feed1')?.auth?.username).toBe('user1');
      expect(sources.find(s => s.id === 'feed2')?.auth?.username).toBe('user2');
    });
  });
});
