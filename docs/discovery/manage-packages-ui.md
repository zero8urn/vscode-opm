# Manage Packages UI Design

**Status**: Discovery  
**Feature**: [FEAT-001-03-manage-packages](../features/FEAT-001-03-manage-packages.md)  
**Created**: 2026-01-25  
**Last Updated**: 2026-01-25

## Overview

This document describes the UI design enhancements to the "Install to Projects" section for package management operations (uninstall, update, downgrade). It extends the existing install functionality (from [install-to-projects-ui.md](./install-to-projects-ui.md)) with dynamic button labels, version indicators, and installation state awareness.

The design maintains the inline accordion pattern established in FEAT-001-02 while adding intelligent button transformations based on:
- Whether the package is installed in selected projects
- Whether the selected version is newer, older, or the same as installed versions
- Whether multiple projects have different installed versions

## Design Principles

1. **Contextual Actions**: Button labels dynamically reflect the operation that will occur (Install/Update/Downgrade/Uninstall)
2. **Version Awareness**: Show installed versions with visual indicators (✓ current, ↑ upgrade available, ↓ downgrade available)
3. **Clear Intent**: Users always know what will happen before clicking the action button
4. **Safety**: Destructive operations (uninstall) use secondary button styling and optional confirmation
5. **Consistency**: Maintain the same accordion structure and project checkbox patterns from install workflow

## UI States & Mockups

### State 1: Installed in All Projects (Same Version)

When package is installed in all projects with the same version, and that version is selected:

```
┌──────────────────────────────────────────────────────────────┐
│ 📦 Newtonsoft.Json                              nuget.org ⚙️  │
│                                                                │
│ Version: 13.0.3 ▼  (Latest stable)                            │
│                                                                │
│ Popular high-performance JSON framework for .NET              │
│                                                                │
│ ▶ Details                                                      │
│                                                                │
│ ▶ Frameworks and Dependencies                                 │
│                                                                │
│ ▼ Install to Projects                      ✓ Installed (3)    │
│   ┌────────────────────────────────────────────────────────┐ │
│   │ ☑ Select All (3 projects)                             │ │
│   │                                                        │ │
│   │ ☑ MyApp.Web              net8.0        v13.0.3        │ │
│   │   /src/MyApp.Web/MyApp.Web.csproj                      │ │
│   │                                                        │ │
│   │ ☑ MyApp.Core             net8.0        v13.0.3        │ │
│   │   /src/MyApp.Core/MyApp.Core.csproj                    │ │
│   │                                                        │ │
│   │ ☑ MyApp.Tests            net8.0        v13.0.3        │ │
│   │   /tests/MyApp.Tests/MyApp.Tests.csproj                │ │
│   │                                                        │ │
│   │ [Uninstall from 3 projects]                            │ │
│   └────────────────────────────────────────────────────────┘ │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

**Behavior**:
- All projects are auto-selected (checkboxes checked)
- "✓ Installed (3)" badge shows installation count
- Selected version matches installed version → Show **Uninstall** button
- Button uses secondary styling (not primary blue) to indicate destructive action
- Button label dynamically shows count: "Uninstall from 3 projects"

---

### State 2: Installed in All Projects (Update Available)

When package is installed in all projects, but a newer version is selected:

```
┌──────────────────────────────────────────────────────────────┐
│ 📦 Newtonsoft.Json                              nuget.org ⚙️  │
│                                                                │
│ Version: Latest Stable ▼  13.0.3                              │
│                                                                │
│ Popular high-performance JSON framework for .NET              │
│                                                                │
│ ▶ Details                                                      │
│                                                                │
│ ▶ Frameworks and Dependencies                                 │
│                                                                │
│ ▼ Install to Projects                      ✓ Installed (3)    │
│   ┌────────────────────────────────────────────────────────┐ │
│   │ ☑ Select All (3 projects)                             │ │
│   │                                                        │ │
│   │ ☑ MyApp.Web              net8.0        v12.0.3 ↑       │ │
│   │   /src/MyApp.Web/MyApp.Web.csproj                      │ │
│   │                                                        │ │
│   │ ☑ MyApp.Core             net8.0        v12.0.3 ↑       │ │
│   │   /src/MyApp.Core/MyApp.Core.csproj                    │ │
│   │                                                        │ │
│   │ ☑ MyApp.Tests            net8.0        v12.0.3 ↑       │ │
│   │   /tests/MyApp.Tests/MyApp.Tests.csproj                │ │
│   │                                                        │ │
│   │ [Update 3 projects to v13.0.3]                         │ │
│   └────────────────────────────────────────────────────────┘ │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

**Behavior**:
- "↑" indicator shows upgrade is available next to each installed version
- Selected version (13.0.3) is newer than installed (12.0.3)
- Button label: "Update 3 projects to v13.0.3"
- Button uses primary styling (blue) for positive action
- All projects auto-selected since all have older versions

---

### State 3: Installed in All Projects (Downgrade Selected)

When package is installed in all projects, but an older version is selected:

```
┌──────────────────────────────────────────────────────────────┐
│ 📦 Newtonsoft.Json                              nuget.org ⚙️  │
│                                                                │
│ Version: 12.0.3 ▼  (Show all versions)                        │
│                                                                │
│ Popular high-performance JSON framework for .NET              │
│                                                                │
│ ▶ Details                                                      │
│                                                                │
│ ▶ Frameworks and Dependencies                                 │
│                                                                │
│ ▼ Install to Projects                      ✓ Installed (3)    │
│   ┌────────────────────────────────────────────────────────┐ │
│   │ ☑ Select All (3 projects)                             │ │
│   │                                                        │ │
│   │ ☑ MyApp.Web              net8.0        v13.0.3 ↓       │ │
│   │   /src/MyApp.Web/MyApp.Web.csproj                      │ │
│   │                                                        │ │
│   │ ☑ MyApp.Core             net8.0        v13.0.3 ↓       │ │
│   │   /src/MyApp.Core/MyApp.Core.csproj                    │ │
│   │                                                        │ │
│   │ ☑ MyApp.Tests            net8.0        v13.0.3 ↓       │ │
│   │   /tests/MyApp.Tests/MyApp.Tests.csproj                │ │
│   │                                                        │ │
│   │ [Downgrade 3 projects to v12.0.3]                      │ │
│   └────────────────────────────────────────────────────────┘ │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

**Behavior**:
- "↓" indicator shows downgrade will occur next to each installed version
- Selected version (12.0.3) is older than installed (13.0.3)
- Button label: "Downgrade 3 projects to v12.0.3"
- Button uses primary styling (blue) - not destructive, just version change
- Version dropdown shows selected older version

---

### State 4: Mixed Installation State (Installed in Some Projects)

When package is installed in some projects but not others:

```
┌──────────────────────────────────────────────────────────────┐
│ 📦 Microsoft.NET.Test.Sdk                       nuget.org ⚙️  │
│                                                                │
│ Version: Latest Stable ▼  17.12.0                             │
│                                                                │
│ The MSBuild targets and properties for building .NET test...  │
│                                                                │
│ ▶ Details                                                      │
│                                                                │
│ ▶ Frameworks and Dependencies                                 │
│                                                                │
│ ▼ Install to Projects                      ✓ Installed (2)    │
│   ┌────────────────────────────────────────────────────────┐ │
│   │ □ Select All (5 projects)                              │ │
│   │                                                        │ │
│   │ □ MyApp.Web              net8.0                        │ │
│   │   /src/MyApp.Web/MyApp.Web.csproj                      │ │
│   │                                                        │ │
│   │ □ MyApp.Core             net8.0                        │ │
│   │   /src/MyApp.Core/MyApp.Core.csproj                    │ │
│   │                                                        │ │
│   │ ☑ MyApp.Tests            net8.0        v17.12.0        │ │
│   │   /tests/MyApp.Tests/MyApp.Tests.csproj                │ │
│   │                                                        │ │
│   │ ☑ MyApp.IntegTests       net8.0        v17.11.0 ↑      │ │
│   │   /tests/MyApp.IntegTests/MyApp.IntegTests.csproj      │ │
│   │                                                        │ │
│   │ □ MyApp.BenchTests       net8.0                        │ │
│   │   /tests/MyApp.BenchTests/MyApp.BenchTests.csproj      │ │
│   │                                                        │ │
│   │ [Install to 3 projects]  [Update 1 project]            │ │
│   └────────────────────────────────────────────────────────┘ │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

**Behavior**:
- "✓ Installed (2)" badge shows package is installed in 2 projects
- Projects with package installed show version number (v17.12.0, v17.11.0)
- Project with older version shows "↑" upgrade indicator
- User can select mix of installed and not-installed projects
- When selection includes both, show TWO buttons:
  - **Install to 3 projects** (for uninstalled projects)
  - **Update 1 project** (for project with older version)
- Installed projects with current version auto-selected but disabled (cannot uninstall while other action pending)

---

### State 5: Mixed Versions (Different Versions Installed)

When different versions are installed across projects:

```
┌──────────────────────────────────────────────────────────────┐
│ 📦 Newtonsoft.Json                              nuget.org ⚙️  │
│                                                                │
│ Version: Latest Stable ▼  13.0.3                              │
│                                                                │
│ Popular high-performance JSON framework for .NET              │
│                                                                │
│ ▶ Details                                                      │
│                                                                │
│ ▶ Frameworks and Dependencies                                 │
│                                                                │
│ ▼ Install to Projects                      ✓ Installed (4)    │
│   ┌────────────────────────────────────────────────────────┐ │
│   │ ☑ Select All (4 projects)                             │ │
│   │                                                        │ │
│   │ ☑ MyApp.Web              net8.0        v13.0.3        │ │
│   │   /src/MyApp.Web/MyApp.Web.csproj                      │ │
│   │                                                        │ │
│   │ ☑ MyApp.Core             net8.0        v12.0.3 ↑       │ │
│   │   /src/MyApp.Core/MyApp.Core.csproj                    │ │
│   │                                                        │ │
│   │ ☑ MyApp.Tests            net8.0        v13.0.1 ↑       │ │
│   │   /tests/MyApp.Tests/MyApp.Tests.csproj                │ │
│   │                                                        │ │
│   │ ☑ MyApp.IntegTests       net8.0        v11.0.2 ↑       │ │
│   │   /tests/MyApp.IntegTests/MyApp.IntegTests.csproj      │ │
│   │                                                        │ │
│   │ [Update 3 projects to v13.0.3]  [Uninstall from 1]     │ │
│   └────────────────────────────────────────────────────────┘ │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

**Behavior**:
- Shows mixed versions across projects (13.0.3, 12.0.3, 13.0.1, 11.0.2)
- Selected version is 13.0.3 (latest stable)
- Projects with older versions show "↑" upgrade indicator
- Project with current version (MyApp.Web) does NOT show indicator
- Two buttons appear:
  - **Update 3 projects to v13.0.3** (for projects needing upgrade)
  - **Uninstall from 1** (for the project already at selected version)
- User can manually deselect projects to refine action

---

### State 6: Partial Selection - Only Uninstall

When user manually selects only projects that have the package installed at the selected version:

```
┌──────────────────────────────────────────────────────────────┐
│ 📦 Newtonsoft.Json                              nuget.org ⚙️  │
│                                                                │
│ Version: 13.0.3 ▼  (Latest stable)                            │
│                                                                │
│ Popular high-performance JSON framework for .NET              │
│                                                                │
│ ▶ Details                                                      │
│                                                                │
│ ▶ Frameworks and Dependencies                                 │
│                                                                │
│ ▼ Install to Projects                      ✓ Installed (3)    │
│   ┌────────────────────────────────────────────────────────┐ │
│   │ □ Select All (3 projects)                              │ │
│   │                                                        │ │
│   │ ☑ MyApp.Web              net8.0        v13.0.3        │ │
│   │   /src/MyApp.Web/MyApp.Web.csproj                      │ │
│   │                                                        │ │
│   │ □ MyApp.Core             net8.0        v13.0.3        │ │
│   │   /src/MyApp.Core/MyApp.Core.csproj                    │ │
│   │                                                        │ │
│   │ ☑ MyApp.Tests            net8.0        v13.0.3        │ │
│   │   /tests/MyApp.Tests/MyApp.Tests.csproj                │ │
│   │                                                        │ │
│   │ [Uninstall from 2 projects]                            │ │
│   └────────────────────────────────────────────────────────┘ │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

**Behavior**:
- User manually selected 2 out of 3 installed projects
- Both selected projects have the package installed at the selected version
- Button label: "Uninstall from 2 projects" (count reflects selection)
- Button uses secondary styling (destructive action)
- Select All checkbox is unchecked (partial selection)

---

### State 7: No Projects Selected

When user has unchecked all projects:

```
┌──────────────────────────────────────────────────────────────┐
│ 📦 Newtonsoft.Json                              nuget.org ⚙️  │
│                                                                │
│ Version: Latest Stable ▼  13.0.3                              │
│                                                                │
│ Popular high-performance JSON framework for .NET              │
│                                                                │
│ ▶ Details                                                      │
│                                                                │
│ ▶ Frameworks and Dependencies                                 │
│                                                                │
│ ▼ Install to Projects                      ✓ Installed (3)    │
│   ┌────────────────────────────────────────────────────────┐ │
│   │ □ Select All (3 projects)                              │ │
│   │                                                        │ │
│   │ □ MyApp.Web              net8.0        v12.0.3 ↑       │ │
│   │   /src/MyApp.Web/MyApp.Web.csproj                      │ │
│   │                                                        │ │
│   │ □ MyApp.Core             net8.0        v12.0.3 ↑       │ │
│   │   /src/MyApp.Core/MyApp.Core.csproj                    │ │
│   │                                                        │ │
│   │ □ MyApp.Tests            net8.0        v12.0.3 ↑       │ │
│   │   /tests/MyApp.Tests/MyApp.Tests.csproj                │ │
│   │                                                        │ │
│   │                                                        │ │
│   │ ℹ️ Select at least one project to enable actions       │ │
│   │                                                        │ │
│   └────────────────────────────────────────────────────────┘ │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

**Behavior**:
- All checkboxes unchecked
- No action buttons shown
- Help text: "ℹ️ Select at least one project to enable actions"
- Version indicators still visible to show available upgrades

---

### State 8: Dependency Warning on Uninstall (Confirmation Dialog)

When user attempts to uninstall a package that has dependents:

```
┌──────────────────────────────────────────────────────────────┐
│ ⚠️  Uninstall Package with Dependencies                       │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│ The package **Microsoft.Extensions.Logging.Abstractions**     │
│ is required by the following packages in MyApp.Web:           │
│                                                                │
│   • Microsoft.Extensions.Logging (v8.0.0)                     │
│   • Microsoft.Extensions.DependencyInjection (v8.0.0)         │
│   • Serilog.Extensions.Logging (v3.1.0)                       │
│                                                                │
│ Uninstalling may break your project. Consider using the       │
│ `--force` option to remove the package and all its dependents.│
│                                                                │
│                                                                │
│                [Cancel]           [Uninstall Anyway]           │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

**Behavior**:
- Modal dialog appears when CLI detects dependency conflict
- Shows list of dependent packages (parsed from `dotnet remove` output)
- **Cancel** button (default focus) - abandons operation
- **Uninstall Anyway** button - proceeds with force flag
- Dialog uses warning styling (amber/orange border)

---

### State 9: In-Progress Operation

During multi-project update/install/uninstall:

```
┌──────────────────────────────────────────────────────────────┐
│ 📦 Newtonsoft.Json                              nuget.org ⚙️  │
│                                                                │
│ Version: Latest Stable ▼  13.0.3                              │
│                                                                │
│ Popular high-performance JSON framework for .NET              │
│                                                                │
│ ▶ Details                                                      │
│                                                                │
│ ▶ Frameworks and Dependencies                                 │
│                                                                │
│ ▼ Install to Projects                      ✓ Installed (3)    │
│   ┌────────────────────────────────────────────────────────┐ │
│   │ ☑ Select All (3 projects)                  [Disabled]  │ │
│   │                                                        │ │
│   │ ☑ MyApp.Web              net8.0        v12.0.3 ↑       │ │
│   │   /src/MyApp.Web/MyApp.Web.csproj                      │ │
│   │   ⏳ Updating... (1/3)                                  │ │
│   │                                                        │ │
│   │ ☑ MyApp.Core             net8.0        v12.0.3 ↑       │ │
│   │   /src/MyApp.Core/MyApp.Core.csproj                    │ │
│   │   ⏸️ Pending...                                         │ │
│   │                                                        │ │
│   │ ☑ MyApp.Tests            net8.0        v12.0.3 ↑       │ │
│   │   /tests/MyApp.Tests/MyApp.Tests.csproj                │ │
│   │   ⏸️ Pending...                                         │ │
│   │                                                        │ │
│   │                                  [Cancel Operation]     │ │
│   └────────────────────────────────────────────────────────┘ │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

**Behavior**:
- All checkboxes disabled during operation
- Current project shows "⏳ Updating... (1/3)" progress indicator
- Pending projects show "⏸️ Pending..." status
- Action button replaced with "Cancel Operation" (secondary button)
- VS Code progress notification also shows overall progress

---

### State 10: Operation Complete (Success with Mixed Results)

After multi-project operation completes with partial failures:

```
┌──────────────────────────────────────────────────────────────┐
│ 📦 Newtonsoft.Json                              nuget.org ⚙️  │
│                                                                │
│ Version: Latest Stable ▼  13.0.3                              │
│                                                                │
│ Popular high-performance JSON framework for .NET              │
│                                                                │
│ ▶ Details                                                      │
│                                                                │
│ ▶ Frameworks and Dependencies                                 │
│                                                                │
│ ▼ Install to Projects                      ✓ Installed (2)    │
│   ┌────────────────────────────────────────────────────────┐ │
│   │ □ Select All (3 projects)                              │ │
│   │                                                        │ │
│   │ □ MyApp.Web              net8.0        v13.0.3        │ │
│   │   /src/MyApp.Web/MyApp.Web.csproj                      │ │
│   │   ✅ Updated successfully                               │ │
│   │                                                        │ │
│   │ □ MyApp.Core             net8.0        v13.0.3        │ │
│   │   /src/MyApp.Core/MyApp.Core.csproj                    │ │
│   │   ✅ Updated successfully                               │ │
│   │                                                        │ │
│   │ □ MyApp.Tests            net8.0        v12.0.3 ↑       │ │
│   │   /tests/MyApp.Tests/MyApp.Tests.csproj                │ │
│   │   ❌ Failed: Package not compatible with net8.0        │ │
│   │                                                        │ │
│   │ ⚠️ 2 of 3 projects updated. 1 failed. [View Logs]      │ │
│   │                                                        │ │
│   │ [Update 1 project to v13.0.3]                          │ │
│   └────────────────────────────────────────────────────────┘ │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

**Behavior**:
- Inline status messages show per-project results:
  - "✅ Updated successfully" for succeeded projects
  - "❌ Failed: [reason]" for failed projects
- Summary banner: "⚠️ 2 of 3 projects updated. 1 failed. [View Logs]"
- Failed project still shows upgrade indicator "↑" and old version
- Action button re-enabled for retry: "Update 1 project to v13.0.3"
- Checkboxes auto-cleared; user can reselect for retry
- "✓ Installed (2)" badge updated to reflect new count

---

## Button Logic Decision Tree

```
┌─────────────────────────────────────────────────────────────┐
│ Determine Action Button(s) to Display                        │
└─────────────────────────────────────────────────────────────┘
                           ↓
         ┌─────────────────────────────────┐
         │ Are any projects selected?      │
         └─────────────────────────────────┘
                 ↓ No              ↓ Yes
          [Show help text]         │
          No buttons         ┌─────────────────────────────────┐
                            │ Group selected projects by state │
                            └─────────────────────────────────┘
                                     ↓
                ┌────────────────────┼────────────────────┐
                ↓                    ↓                    ↓
        Not Installed       Same Version         Different Version
         Projects              Installed            Installed
                |                  |                     |
                ↓                  ↓                     ↓
        [Install to N      Selected version =    Selected version ≠
         projects]         Installed version?     Installed version?
                                   ↓                     ↓
                              Yes  |  No            Newer | Older
                                   |                  ↓       ↓
                           [Uninstall from     [Update N]  [Downgrade N]
                            N projects]

Multiple Groups Selected → Show Multiple Buttons
Example: [Install to 2] + [Update 1]
```

---

## Version Indicator Legend

| Indicator | Meaning | Display Context |
|-----------|---------|-----------------|
| ✓ | Package installed at selected version | Project row shows checkmark, no arrow |
| ↑ | Upgrade available (selected > installed) | Show next to installed version number |
| ↓ | Downgrade selected (selected < installed) | Show next to installed version number |
| (none) | Package not installed | No version number shown |

**Color Coding** (optional, based on theme):
- ✓ Green tint for installed indicator
- ↑ Blue/cyan for upgrade (positive action)
- ↓ Amber/orange for downgrade (caution)

---

## Action Button Styling

| Action | Button Class | Behavior |
|--------|-------------|----------|
| Install | Primary (blue) | Positive action |
| Update | Primary (blue) | Positive action |
| Downgrade | Primary (blue) | Intentional version change |
| Uninstall | Secondary (gray) | Destructive action, requires confirmation |
| Cancel Operation | Secondary (gray) | Aborts in-progress operation |

**Button Label Patterns**:
- `Install to N project(s)` - Installing to projects without the package
- `Update N project(s) to vX.Y.Z` - Upgrading to newer version
- `Downgrade N project(s) to vX.Y.Z` - Downgrading to older version
- `Uninstall from N project(s)` - Removing package entirely
- `Cancel Operation` - Stopping in-progress operation

---

## Interaction Flows

### Flow 1: Update All Projects to Latest

1. User opens package details for installed package (Newtonsoft.Json v12.0.3)
2. "Install to Projects" auto-expands, showing all projects with "↑" upgrade indicator
3. All projects auto-selected
4. Button shows: "Update 3 projects to v13.0.3"
5. User clicks button → VS Code progress notification appears
6. Each project updates sequentially with inline status updates
7. On completion, success toast: "✅ Updated Newtonsoft.Json to v13.0.3 in 3 projects"
8. Version indicators disappear (all at v13.0.3 now)

### Flow 2: Uninstall from Subset of Projects

1. User opens package details for installed package
2. "Install to Projects" shows all 3 installed projects
3. User unchecks MyApp.Core (keeps MyApp.Web and MyApp.Tests selected)
4. Button shows: "Uninstall from 2 projects"
5. User clicks → Confirmation prompt appears (optional, based on settings)
6. User confirms → Uninstall proceeds
7. Success toast: "🗑️ Uninstalled Newtonsoft.Json from 2 projects"
8. Panel updates: "✓ Installed (1)" (only MyApp.Core remains)

### Flow 3: Mixed Operation (Install + Update)

1. User opens package details, selects v13.0.3
2. Panel shows:
   - MyApp.Web: v12.0.3 ↑ (needs update)
   - MyApp.Core: not installed (needs install)
   - MyApp.Tests: v13.0.3 ✓ (current)
3. User selects MyApp.Web and MyApp.Core
4. Two buttons appear: "[Install to 1 project]" + "[Update 1 project]"
5. User clicks "Install" → MyApp.Core gets v13.0.3
6. User then clicks "Update" → MyApp.Web updates to v13.0.3
7. Alternative: System could merge into single "[Install/Update 2 projects]" button

### Flow 4: Downgrade with Confirmation

1. User selects older version (v11.0.2) from dropdown
2. All projects show "↓" downgrade indicator
3. Button: "Downgrade 3 projects to v11.0.2"
4. User clicks → Warning dialog appears:
   > "You are downgrading from v13.0.3 to v11.0.2. This may introduce compatibility issues. Continue?"
5. User confirms → Downgrade proceeds
6. Success: "⬇️ Downgraded Newtonsoft.Json to v11.0.2 in 3 projects"

---

## Edge Cases & Error Handling

### Edge Case 1: Package Installed in Zero Projects
- "Install to Projects" section shows in collapsed state by default
- No "✓ Installed" badge visible
- Expanding shows all available projects (none checked)
- Button: "Install to N projects" (after user selects projects)

### Edge Case 2: All Projects Already at Selected Version
- "Install to Projects" auto-expands
- All projects show version number WITHOUT indicator
- All projects auto-selected
- Single button: "Uninstall from N projects"
- Clicking triggers optional confirmation prompt

### Edge Case 3: Selected Version Not in Installed Versions
- User selects v10.0.0 (very old version)
- All projects have newer versions (v12.0.3, v13.0.3)
- All show "↓" downgrade indicator
- Button: "Downgrade N projects to v10.0.0"
- Strong warning on confirmation: "This is a major downgrade"

### Edge Case 4: Dependency Conflict Detected
- User attempts to uninstall Microsoft.Extensions.Logging.Abstractions
- CLI returns error: "Package is required by 3 other packages"
- Modal dialog shows dependent packages (State 8 mockup)
- User can cancel or force uninstall (removes dependents too)

### Edge Case 5: Partial Network Failure
- Update operation starts for 5 projects
- Projects 1-3 succeed, project 4 fails (network timeout), project 5 pending
- Operation continues for project 5
- Final result: 4 success, 1 failure
- Toast: "⚠️ Updated 4 of 5 projects. 1 failed."
- Failed project shows retry button

---

## Accessibility Requirements

1. **Keyboard Navigation**:
   - Tab order: Version dropdown → Source dropdown → Add button → Accordion headers → Project checkboxes → Action buttons
   - Enter/Space toggle checkboxes
   - Enter activates buttons
   - Escape closes panel (existing behavior)

2. **Screen Reader Announcements**:
   - "Package Newtonsoft.Json, version 13.0.3 selected, installed in 3 projects"
   - "MyApp.Web, version 12.0.3 installed, upgrade available to 13.0.3, checkbox unchecked"
   - "Update 3 projects to version 13.0.3 button"
   - Progress updates: "Updating MyApp.Web, 1 of 3 projects"
   - Results: "Update complete. 3 projects succeeded."

3. **ARIA Attributes**:
   - `role="region" aria-label="Install to Projects"` on accordion content
   - `aria-checked` on checkboxes
   - `aria-disabled="true"` during operations
   - `aria-live="polite"` on status messages
   - `aria-describedby` linking buttons to help text

4. **Visual Indicators**:
   - Focus outlines on all interactive elements
   - Disabled state clearly distinguishable (opacity + cursor)
   - Color not the only indicator (use icons + text for status)

---

## Responsive Design Notes

| Panel Width | Adaptations |
|-------------|-------------|
| < 400px | Project paths truncate aggressively (show filename only), buttons stack vertically |
| 400-500px | Standard layout (as shown in mockups) |
| > 500px | No changes (fixed max-width at 600px from existing design) |

**Text Truncation Strategy**:
- Project name: Never truncate (most important identifier)
- Project path: Middle truncation preserving directory structure (`.../src/.../MyApp.csproj`)
- Status messages: Right truncation with ellipsis, full text in tooltip

---

## Implementation Notes

### State Management
- Track installed versions per project (fetch from CLI on panel open)
- Compare selected version to installed version for each project
- Recalculate button states on:
  - Version dropdown change
  - Project checkbox toggle
  - Operation completion

### IPC Message Extensions
```typescript
// New request types
type WebviewMessage =
  | { type: 'getInstalledPackages'; projectPaths: string[] }
  | { type: 'uninstallPackage'; packageId: string; projectPaths: string[]; force?: boolean }
  | { type: 'updatePackage'; packageId: string; version: string; projectPaths: string[] };

// Enhanced response type
type InstallPackageResponse = {
  packageId: string;
  version: string;
  operation: 'install' | 'update' | 'downgrade' | 'uninstall';
  success: boolean;
  results: Array<{
    projectPath: string;
    success: boolean;
    operation: 'install' | 'update' | 'downgrade' | 'uninstall';
    error?: string;
    previousVersion?: string; // For update/downgrade tracking
  }>;
};
```

### Component Changes
- Extend `project-selector` component with:
  - `installedVersions` property (map of projectPath → version)
  - `selectedVersion` property for comparison
  - Logic to determine button label(s) and action(s)
  - Status display per project row
- Add new `uninstall-confirm-dialog` component for dependency warnings
- Enhance `packageDetailsPanel` to fetch installed package data on open

---

## Future Enhancements (Out of Scope)

1. **Batch Version Selection**: Allow selecting different target versions per project (complex UX)
2. **Rollback on Failure**: Automatically revert successful installs if one project fails (transaction-like behavior)
3. **Dependency Graph Visualization**: Show tree of dependencies when uninstalling
4. **Smart Recommendations**: Suggest updating dependent packages when updating a core package
5. **Consolidate Versions**: Dedicated workflow to align versions across all projects (separate feature)

---

## Related Documentation

- [install-to-projects-ui.md](./install-to-projects-ui.md) - Original install UI design (FEAT-001-02)
- [FEAT-001-03-manage-packages.md](../features/FEAT-001-03-manage-packages.md) - Feature requirements
- [STORY-001-03-001 through STORY-001-03-007](../stories/) - Individual user stories
- [request-response.md](./request-response.md) - IPC message flow patterns
