# Package Source Authentication

This document describes how to configure authentication for private NuGet package sources in the OPM extension.

## Overview

The OPM extension supports authenticating to private NuGet feeds using credentials stored in `nuget.config`. This matches the behavior of the .NET CLI and Visual Studio, ensuring a consistent developer experience.

Supported authentication types:
- **Basic Authentication**: Username + password
- **Bearer Tokens**: Personal Access Tokens (PATs) for Azure Artifacts, GitHub Packages
- **API Key Headers**: Custom authentication headers (e.g., X-NuGet-ApiKey)

## Configuration File Discovery

The extension follows NuGet's standard configuration hierarchy, searching for `nuget.config` files in multiple locations:

### Search Order

1. **Solution/Project Hierarchy** (highest priority)
   - Current workspace folder
   - Each parent folder up to the drive root
   
2. **User-Level Configuration**
   - Windows: `%APPDATA%\NuGet\NuGet.Config`
   - macOS/Linux: `~/.nuget/NuGet/NuGet.Config` (preferred by .NET CLI) or `~/.config/NuGet/NuGet.Config` (Mono)

3. **Additional User Configurations**
   - Windows: `%APPDATA%\NuGet\config\*.Config`
   - macOS/Linux: `~/.nuget/config/*.config` or `~/.config/NuGet/config/*.config`

4. **Computer-Level Configuration** (lowest priority)
   - Windows: `%ProgramFiles(x86)%\NuGet\Config\*.Config`
   - macOS: `/Library/Application Support`
   - Linux: `/etc/opt/NuGet/Config`

### Configuration Merging

When multiple `nuget.config` files are found:
- Package sources are **combined** from all configuration files
- Settings from higher-priority configs **override** lower-priority configs for duplicate sources
- Use `<clear />` in `<packageSources>` to remove all sources from lower-priority configs

Example of clearing inherited sources:
```xml
<configuration>
  <packageSources>
    <clear /> <!-- Remove all sources from user/computer configs -->
    <add key="CompanyFeed" value="https://company.example.com/nuget/v3/index.json" />
  </packageSources>
</configuration>
```

## Configuration

### nuget.config Format

Place a `nuget.config` file in your workspace root or `.nuget/` folder with the following structure:

```xml
<configuration>
  <packageSources>
    <add key="MyPrivateFeed" value="https://pkgs.example.com/nuget/v3/index.json" />
    <add key="AzureFeed" value="https://pkgs.dev.azure.com/org/_packaging/feed/nuget/v3/index.json" />
    <add key="GitHubFeed" value="https://nuget.pkg.github.com/owner/index.json" />
  </packageSources>
  
  <packageSourceCredentials>
    <MyPrivateFeed>
      <add key="Username" value="john.doe" />
      <add key="ClearTextPassword" value="your-password-or-token" />
    </MyPrivateFeed>
    <AzureFeed>
      <add key="Username" value="az" />
      <add key="ClearTextPassword" value="your-azure-pat" />
    </AzureFeed>
    <GitHubFeed>
      <add key="Username" value="token" />
      <add key="ClearTextPassword" value="ghp_your-github-pat" />
    </GitHubFeed>
  </packageSourceCredentials>
</configuration>
```

### Provider-Specific Configuration

#### Azure Artifacts

Azure Artifacts uses Bearer token authentication. The extension automatically detects Azure Artifacts feeds and uses the appropriate auth method.

```xml
<packageSources>
  <add key="AzureFeed" value="https://pkgs.dev.azure.com/org/_packaging/feed/nuget/v3/index.json" />
</packageSources>

<packageSourceCredentials>
  <AzureFeed>
    <add key="Username" value="az" />
    <add key="ClearTextPassword" value="YOUR_AZURE_PAT" />
  </AzureFeed>
</packageSourceCredentials>
```

**Creating an Azure PAT**:
1. Go to Azure DevOps → User Settings → Personal Access Tokens
2. Create new token with "Packaging (Read)" scope
3. Copy the token and paste it as the `ClearTextPassword` value

#### GitHub Packages

GitHub Packages uses the `X-NuGet-ApiKey` header for authentication. The extension automatically detects GitHub feeds.

```xml
<packageSources>
  <add key="GitHubFeed" value="https://nuget.pkg.github.com/OWNER/index.json" />
</packageSources>

<packageSourceCredentials>
  <GitHubFeed>
    <add key="Username" value="token" />
    <add key="ClearTextPassword" value="ghp_YOUR_GITHUB_PAT" />
  </GitHubFeed>
</packageSourceCredentials>
```

**Creating a GitHub PAT**:
1. Go to GitHub → Settings → Developer Settings → Personal Access Tokens → Tokens (classic)
2. Create new token with `read:packages` scope
3. Copy the token and paste it as the `ClearTextPassword` value

#### Artifactory / MyGet / Other Providers

For other providers, the extension defaults to Basic authentication. You can configure credentials using the same pattern:

```xml
<packageSourceCredentials>
  <MyFeed>
    <add key="Username" value="your-username" />
    <add key="ClearTextPassword" value="your-password-or-api-key" />
  </MyFeed>
</packageSourceCredentials>
```

## Security Best Practices

⚠️ **Important Security Considerations**:

1. **Never commit `nuget.config` with credentials to source control**
   - Add `nuget.config` to your `.gitignore` if it contains passwords or tokens
   - Use environment-specific config files (e.g., `nuget.local.config` in `.gitignore`)

2. **Use Personal Access Tokens (PATs) instead of passwords**
   - PATs can be scoped to specific permissions (read-only, specific repos)
   - PATs can be rotated without changing your account password
   - PATs can be revoked individually if compromised

3. **Workspace Trust**
   - In future versions, the extension will only load credentials from trusted workspaces
   - Always review the contents of workspaces before trusting them

4. **Credential Storage**
   - Credentials are loaded from `nuget.config` into extension memory at activation
   - Credentials are NEVER written to disk by the extension
   - Credentials are NEVER logged (even in debug mode)

5. **Rotate tokens regularly**
   - Set expiration dates on PATs
   - Rotate tokens every 3-6 months or when team members leave

## Best Practices

### Configuration Organization

**Workspace Configuration** (Recommended for most teams)
- Place `nuget.config` in your repository root
- Include company/team package sources
- Commit to version control (without credentials)
- Use placeholders for credentials: `<add key="ClearTextPassword" value="$(NUGET_AUTH_TOKEN)" />`

**User Configuration** (For personal/machine-specific sources)
- Store in `%APPDATA%\NuGet\NuGet.Config` (Windows) or `~/.nuget/NuGet/NuGet.Config` (Unix)
- Use for personal feeds, test feeds, or credentials
- Never commit to version control

**Computer Configuration** (For organization-wide defaults)
- Deployed via Group Policy or configuration management
- Ensures consistent sources across developer machines
- Can be overridden by user or solution configs

### Credential Management

1. **Never commit credentials to version control**
   - Use environment variables or credential managers
   - Add `nuget.config` with credentials to `.gitignore` if necessary

2. **Use workspace trust**
   - The extension respects VS Code's workspace trust
   - Only parse configs in trusted workspaces to prevent malicious credential extraction

3. **Rotate tokens regularly**
   - Set expiration dates on PATs
   - Review and revoke unused tokens periodically

4. **Use read-only tokens**
   - Package browsing/installation only needs read permissions
   - Don't use tokens with write/publish permissions for client operations

### Migration from Legacy Configs

If migrating from nuget v2 or older configurations:

```xml
<!-- Old v2 format (deprecated) -->
<packageSources>
  <add key="Feed" value="https://example.com/api/v2" />
</packageSources>

<!-- New v3 format (recommended) -->
<packageSources>
  <add key="Feed" value="https://example.com/v3/index.json" />
</packageSources>
```

## Troubleshooting

### Understanding Config Hierarchy

If you're not sure which `nuget.config` is being used:

1. **Check workspace root first** - Highest priority for project-specific sources
2. **Check parent directories** - Inherited from solution folder hierarchy
3. **Check user config** - `%APPDATA%\NuGet\NuGet.Config` or `~/.nuget/NuGet/NuGet.Config`
4. **Check computer config** - Org-wide defaults (if deployed)

You can verify the active configuration by:
- Placing unique test sources in each config level
- Observing which sources appear in search results

### 401 Unauthorized Error

If you see "Authentication required" errors:

1. **Verify credentials in nuget.config**
   - Check that the source name matches exactly (case-sensitive)
   - Ensure username and password are correct
   - Verify the token hasn't expired

2. **Test credentials with dotnet CLI**
   ```bash
   dotnet nuget list source
   dotnet restore --source https://your-feed-url
   ```

3. **Check token permissions**
   - Azure PATs need "Packaging (Read)" scope
   - GitHub PATs need `read:packages` scope

### 403 Forbidden Error

If you see "Forbidden" errors:

1. **Verify package source permissions**
   - Ensure your account has access to the feed
   - Check organization/team membership in Azure DevOps or GitHub

2. **Check feed visibility**
   - Private feeds require authentication
   - Org-scoped feeds may require specific team membership

### Credentials Not Loading

If credentials aren't being used:

1. **Check `nuget.config` location**
   - Extension searches workspace hierarchy, user, and computer configs
   - Workspace configs (closer to project) have highest priority
   - Ensure file is named exactly `nuget.config` or `NuGet.config`

2. **Verify XML structure**
   - Source name in `<packageSourceCredentials>` must match source key
   - Use `ClearTextPassword`, not `Password` (which requires encryption)

3. **Reload window**
   - After adding credentials, reload VS Code: Command Palette → "Developer: Reload Window"

## Migration from Other Tools

### From Visual Studio

Visual Studio and VS Code with OPM use the same `nuget.config` format. Simply copy your existing `nuget.config` to your VS Code workspace.

### From .NET CLI

If you've configured credentials using `dotnet nuget update source`, those credentials are stored in:
- Windows: `%APPDATA%\NuGet\NuGet.Config`
- macOS/Linux: `~/.nuget/NuGet/NuGet.Config`

Copy the relevant `<packageSourceCredentials>` section to your workspace `nuget.config`.

## Future Enhancements

The following features are planned for future releases:

- VS Code SecretStorage integration for encrypted credential storage
- Workspace trust enforcement (only load credentials in trusted workspaces)
- OAuth/NTLM flows via dotnet CLI credential providers
- Credential validation UI (test auth before using)
- Multi-account support (multiple PATs for same provider)

## Additional Resources

- [NuGet.config Reference](https://learn.microsoft.com/en-us/nuget/reference/nuget-config-file)
- [Azure Artifacts Authentication](https://learn.microsoft.com/en-us/azure/devops/artifacts/nuget/nuget-exe)
- [GitHub Packages Authentication](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-nuget-registry)
- [Creating GitHub PATs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token)
- [Creating Azure PATs](https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate)
