# Octothorpe Package Manager (OPM)

A streamlined VS Code extension for .NET dependency management, bringing intuitive NuGet package browsing, searching, and installation directly into your editor.

## Features

### **Search & Browse Packages**
- Search across public and private NuGet feeds (nuget.org, Azure Artifacts, GitHub Packages, Artifactory, custom sources)
- Real-time search with intelligent filtering
- View package details, descriptions, and metadata
- Support for prerelease and framework-specific versions

### **Install & Manage Dependencies**
- Install packages with interactive project and version selection
- Uninstall packages from any project in your solution
- Automatic solution and project discovery
- Smart project targeting for multi-project solutions

### **Flexible Source Configuration**
- Auto-discover package sources from `nuget.config`
- Configure custom feeds and authenticated sources
- Support for enterprise package repositories
- Multiple source management

## Getting Started

1. **Open Package Browser**
   - Press `F1` or `Ctrl+Shift+P` to open the Command Palette
   - Run: **`opm: Open Package Browser`**

2. **Search for Packages**
   - Enter a search term (e.g., `micro`)
   - Browse results with package details, versions, and download stats

3. **Install Packages**
   - Click **Install** on any package card
   - Select target project and version
   - Confirm installation

## Prerequisites
- Dotnet sdk installed

## Contributing

We welcome contributions! For development setup, building, and testing instructions, see [DEVELOPMENT.md](DEVELOPMENT.md).

## License

This extension is licensed under the [Mozilla Public License 2.0](LICENSE).
