# NuGet Package Management - Feature Discovery

## Feature Breakdown

### Non-Functional Requirements (NFRs)
- **Theme support**: Webviews must support VS Code theming (use `--vscode-*` tokens), respond to theme changes, and be able to receive computed color tokens from the extension host.
- **Error support**: Provide a consistent user-facing error message while writing detailed traces to logs; handle CLI errors gracefully and surface actionable messages with ‘View details’ linking to operation logs.
- **Logging / Telemetry Support**: Centralized logging via `OutputChannel` and optional persistent logs; telemetry should respect `vscode.env.isTelemetryEnabled` and provide a `telemetryEnabled` setting for users to opt-in/out.
- **HTML sanitization**: Sanitize any HTML coming from external sources before rendering in webviews (e.g., READMEs) using DOM sanitization libraries or safe renderers.
- **Secure resource URIs**: Always use `webview.asWebviewUri()` for local resources injected into webviews; avoid loading remote scripts by default and use strict CSP.
- **CI Support**: GitHub Actions (or equivalent) should run build, lint, unit tests, and E2E tests to maintain quality and guard regressions.

These Non-Functional Requirements are tracked under FEAT-001-00 (Foundations & Non-Functional Requirements) in the project backlog/epic plan.

| Feature Name | Description | Component Type | CLI/API Support | Notes |
|-------------|-------------|----------------|-----------------|-------|
| Package Search | Search packages by name/keyword | Search UI | ✅ NuGet API | |
| Type-based Search | Find packages containing specific types | Search UI | ✅ NuGet API | T: prefix search |
| Package Browse View | Display package list with metadata | List/Grid UI | ✅ NuGet API | |
| Package Details Panel | Show detailed package information | Details UI | ✅ NuGet API | |
| Version Selector | Choose specific package version | Dropdown UI | ✅ NuGet API | |
| Prerelease Toggle | Include/exclude prerelease versions | Checkbox UI | ✅ NuGet API | |
| Install Package | Add package to project | Action | ✅ dotnet CLI | `dotnet add package` |
| Uninstall Package | Remove package from project | Action | ✅ dotnet CLI | `dotnet remove package` |
| Update Package | Upgrade to newer version | Action | ✅ dotnet CLI | `dotnet add package` |
| Installed Packages View | List currently installed packages | List UI | ✅ dotnet CLI | Parse `.csproj` |
| Updates Available View | Show packages with updates | List UI | ✅ NuGet API | Version comparison |
| Consolidate Packages | Unify versions across projects | List UI | ✅ dotnet CLI | Multi-project operation |
| Multi-project Install | Install to multiple projects | Checkbox List UI | ✅ dotnet CLI | Batch operations |
| Multi-project Uninstall | Remove from multiple projects | Checkbox List UI | ✅ dotnet CLI | Batch operations |
| Multi-project Update | Update across projects | Checkbox List UI | ✅ dotnet CLI | Batch operations |
| Solution-wide View | Manage all solution packages | Tree/List UI | ✅ dotnet CLI | Parse solution file |
| Package Source Manager | Configure NuGet feeds | Settings UI | ✅ nuget.config | |
| Package Source Selector | Switch active package source | Dropdown UI | ✅ nuget.config | |
| Download Count Display | Show package popularity | Badge UI | ✅ NuGet API | |
| Author Information | Display package author/owner | Link UI | ✅ NuGet API | |
| License Display | Show package license info | Link/Text UI | ✅ NuGet API | |
| README Viewer | Display package README | Markdown UI | ✅ NuGet API | |
| Package Dependencies | Show dependency tree | Tree UI | ✅ NuGet API | |
| Dependency Resolver | Calculate dependency graph | Logic | ✅ dotnet CLI | Handled by CLI |
| Version Conflict Detection | Identify version mismatches | Validation | ✅ Parse output | Parse CLI errors |
| License Acceptance | Prompt for license agreement | Dialog UI | ✅ dotnet CLI | Interactive prompt |
| Package Restore | Restore missing packages | Action | ✅ dotnet CLI | `dotnet restore` |
| Package Cache View | Display locally cached packages | List UI | ⚠️ File System | Read cache folder |
| Package Details Link | Open package on NuGet.org | Action | ✅ Browser | URL navigation |
| Assembly Explorer | View package DLL contents | ⚠️ Research | ❌ IDE-specific | Rider-specific feature |
| Quick Documentation | Show inline package docs | Tooltip/Panel UI | ✅ NuGet API | XML docs |
| Project Selection | Choose target projects | Checkbox List UI | ✅ Parse solution | |
| Filter by Framework | Show framework compatibility | Filter UI | ✅ NuGet API | Target framework |
| Filter by Tags | Filter packages by tags | Filter UI | ✅ NuGet API | |
| Sort by Relevance | Order by search relevance | Sort UI | ✅ NuGet API | |
| Sort by Downloads | Order by popularity | Sort UI | ✅ NuGet API | |
| Sort by Recent Updates | Order by publish date | Sort UI | ✅ NuGet API | |
| Implicit Package Warning | Warn about SDK packages | Warning UI | ✅ Parse .csproj | `IsImplicitlyDefined` |
| Transitive Dependencies | Show indirect dependencies | Tree UI | ✅ dotnet CLI | `dotnet list package` |
| Vulnerable Package Alert | Warn about security issues | ⚠️ Research | ⚠️ NuGet API | Vulnerability database |
| Deprecated Package Alert | Warn about deprecated packages | Warning UI | ✅ NuGet API | Deprecation metadata |
| Package Icon Display | Show package icon/logo | Image UI | ✅ NuGet API | |
| Project Type Detection | Detect .csproj format | Logic | ✅ Parse .csproj | PackageReference vs packages.config |
| Batch Update All | Update all outdated packages | Action | ✅ dotnet CLI | Sequential updates |
| Rollback Package | Revert to previous version | Action | ✅ dotnet CLI | Install specific version |
| Package Compatibility | Check framework compatibility | Validation | ✅ NuGet API | Target framework matching |
| Local Package Source | Support local folder feeds | Source Config | ✅ nuget.config | |
| Private Feed Auth | Authenticate to private feeds | ⚠️ Research | ⚠️ Credential mgmt | May need VS integration |
| Auth Handling | Support Basic/Bearer token auth | Credentials/HTTP | ✅ nuget.config / NuGet API | Basic/Bearer support; delegate NTLM/STS to CLI |
| Package Pinning | Lock package to version | ⚠️ Research | ⚠️ Central Pkg Mgmt | Directory.Packages.props |
| Central Package Mgmt | Manage versions centrally | ⚠️ Research | ⚠️ Parse props | Directory.Packages.props |
| Dependency Behavior | Configure dependency resolution | Settings UI | ✅ CLI flags | Lowest, Highest, etc. |
| Remove Unused Deps | Clean unused dependencies | Action | ⚠️ Research | Requires analysis |
| Force Uninstall | Remove with dependencies | Action | ✅ dotnet CLI | With warning |
| Package Conflict UI | Resolve version conflicts | Dialog UI | ✅ Parse output | Interactive resolution |
| Search Result Paging | Paginate search results | Pagination UI | ✅ NuGet API | |
| Recently Used Packages | Show package history | List UI | ✅ Local storage | Extension state |
| Package Comparison | Compare package versions | ⚠️ Research | ⚠️ API/Analysis | Feature comparison |
| Bulk Operations Queue | Queue multiple operations | Queue UI | ✅ Sequential CLI | |
| Operation Progress | Show install/update progress | Progress UI | ✅ Parse output | CLI output stream |
| Operation Logs | Display operation history | Log UI | ✅ Output channel | |
| Error Handling | Display actionable errors | Error UI | ✅ Parse stderr | |
| IntelliSense in .csproj | Autocomplete package names | ⚠️ Research | ⚠️ VS Code API | Language server |
| Package Version Tooltip | Show version in .csproj hover | ⚠️ Research | ⚠️ VS Code API | Language server |
| Quick Fix Actions | Suggest package installs | ⚠️ Research | ⚠️ VS Code API | Code actions |
| Workspace Trust | Respect workspace trust | Security | ✅ VS Code API | |
| Package Size Display | Show download size | Badge UI | ✅ NuGet API | |
| Total Dependencies Count | Show dependency count | Badge UI | ✅ NuGet API | |
| Package Age Display | Show last publish date | Text UI | ✅ NuGet API | |
| Verified Package Badge | Show verified packages | Badge UI | ✅ NuGet API | Verified owners |
| Package Prefix Reserved | Show prefix reservation | Badge UI | ✅ NuGet API | |

## Legend

- ✅ Fully Supported: Can be implemented with dotnet CLI or NuGet API
- ⚠️ Research Required: Needs investigation or special implementation
- ❌ Not Supported: Requires IDE-specific internals

## Implementation Priority Groups

### P0 - Core Functionality
- Package Search, Browse View, Details Panel
- Install/Uninstall/Update Package
- Installed Packages View, Updates Available View
- Version Selector, Prerelease Toggle
- Solution-wide View, Project Selection

### P1 - Multi-Project Support
- Multi-project Install/Uninstall/Update
- Consolidate Packages
- Batch Update All

### P2 - Enhanced Discovery
- Type-based Search, Filter capabilities
- Sort options, Package Source Manager
- README Viewer, License Display

### P3 - Advanced Features
- Dependency visualization
- Vulnerability/Deprecation alerts
- Central Package Management
- Package Comparison

### P4 - External Provider Support
- Artifactory, GitHub Packages, Azure Artifacts, MyGet, Self-hosted
- Provider detection & endpoint discovery
- Provider-specific auth handlers (Bearer/PAT, Basic, API keys)
- Source mapping support and cross-source deduping
- Provider quirks: v2 endpoints, custom base URLs, rate limits, only support v3?
- SSL cert/allowInsecure handling and proxy auth behaviors
- Credential providers and CLI fallback for NTLM/STS/OAuth flows

### P5 - Accessibility
- Accessibility: Use ARIA roles, keyboard-first navigation, and verify high-contrast styling via theme.