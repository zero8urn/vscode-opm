# CLI-Based Project Parsing Implementation Plan

**Story**: [STORY-001-02-001b-cli-project-parsing](../stories/STORY-001-02-001b-cli-project-parsing.md)  
**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Created**: 2026-01-03  
**Status**: Ready for Implementation

## High-Level Summary

This implementation plan delivers authoritative project metadata extraction using the .NET CLI instead of ad-hoc XML parsing. The `DotnetProjectParser` service executes MSBuild property evaluation and package enumeration commands to extract target frameworks and installed packages, respecting MSBuild conditions, imports, and SDK defaults.

The implementation provides a **single-purpose parser service** that other discovery components (SolutionContextService from 001a, workspace-wide discovery from 001c) will consume. All project metadata is obtained through `dotnet` commands to ensure consistency with MSBuild evaluation and avoid the complexity and fragility of manual XML parsing.

**Core Capabilities:**
- Extract target framework(s) via `dotnet msbuild -getProperty` with full MSBuild evaluation
- Enumerate installed packages via `dotnet list package --format json` with resolved versions
- Normalize single (`TargetFramework`) and multi-targeting (`TargetFrameworks`) into consistent model
- Detect legacy `packages.config` projects and reject with clear error
- Cache CLI results with file watcher-based invalidation
- Stream CLI output for real-time parsing and timeout management

**Architecture Layers:**
1. **Types & Models**: Project model with TFMs, packages, and metadata
2. **CLI Executors**: Low-level command execution with timeout and error handling
3. **Parser Service**: High-level project metadata extraction with caching
4. **Integration Points**: Consumed by SolutionContextService and workspace discovery
5. **Testing**: Unit tests with mocked CLI, integration tests with real dotnet commands

**Design Principles:**
- CLI-first approach: No XML parsing, all data from authoritative MSBuild evaluation
- Single responsibility: Parse project metadata, don't handle discovery or context management
- Fail fast: Reject unsupported project types (packages.config) with clear errors
- Performance: Cache results, parallelize multi-project parsing, stream output for large projects

## Implementation Checklist

1. Define project model types and interfaces — see [Task 1](#task-1)
2. Implement low-level CLI command executor — see [Task 2](#task-2)
3. Implement target framework parser — see [Task 3](#task-3)
4. Implement package reference parser — see [Task 4](#task-4)
5. Implement project metadata parser service — see [Task 5](#task-5)
6. Add file watcher for cache invalidation — see [Task 6](#task-6)
7. Integrate with solution discovery service — see [Task 7](#task-7)
8. Write unit tests — see [Task 8](#task-8)
9. Write integration tests — see [Task 9](#task-9)
10. Update documentation — see [Task 10](#task-10)

## Detailed Tasks

<a id="task-1"></a>
### Task 1: Define Project Model Types and Interfaces

Create type definitions for project metadata, target frameworks, and package references.

**Files to Create:**
- `src/services/cli/types/projectMetadata.ts`

**Implementation Details:**
```typescript
/**
 * Target framework moniker (e.g., "net8.0", "net6.0;net7.0")
 */
export type TargetFrameworkMoniker = string;

/**
 * Normalized target framework(s) - single string or array for multi-targeting
 */
export type TargetFrameworks = string | string[];

/**
 * Package reference entry from dotnet list package
 */
export interface PackageReference {
  /** Package ID (e.g., "Newtonsoft.Json") */
  id: string;
  
  /** Requested version from .csproj (e.g., "13.0.3") */
  requestedVersion: string;
  
  /** Resolved version after restore (e.g., "13.0.3") */
  resolvedVersion: string;
  
  /** Whether this is a transitive dependency */
  isTransitive: boolean;
}

/**
 * Project metadata extracted from dotnet CLI commands
 */
export interface ProjectMetadata {
  /** Absolute path to .csproj file */
  path: string;
  
  /** Project file name (e.g., "MyApp.csproj") */
  name: string;
  
  /** Target framework(s) - single string or array */
  targetFrameworks: TargetFrameworks;
  
  /** Direct package references (not transitive) */
  packageReferences: PackageReference[];
  
  /** Output type (Exe, Library, WinExe) */
  outputType?: string;
  
  /** Whether project uses artifacts output layout */
  useArtifactsOutput?: boolean;
}

/**
 * Project parsing error types
 */
export enum ProjectParseErrorCode {
  /** Project file not found */
  ProjectNotFound = 'PROJECT_NOT_FOUND',
  
  /** dotnet CLI not available */
  DotnetNotFound = 'DOTNET_NOT_FOUND',
  
  /** CLI command failed or timed out */
  CliExecutionFailed = 'CLI_EXECUTION_FAILED',
  
  /** Project uses legacy packages.config format */
  UnsupportedPackagesConfig = 'UNSUPPORTED_PACKAGES_CONFIG',
  
  /** Invalid or corrupted project file */
  InvalidProjectFile = 'INVALID_PROJECT_FILE',
  
  /** No target framework defined */
  NoTargetFramework = 'NO_TARGET_FRAMEWORK',
}

/**
 * Project parsing error
 */
export interface ProjectParseError {
  code: ProjectParseErrorCode;
  message: string;
  projectPath: string;
  details?: string;
}

/**
 * Result type for project parsing operations
 */
export type ProjectParseResult = 
  | { success: true; metadata: ProjectMetadata }
  | { success: false; error: ProjectParseError };
```

**Testing:**
- Unit test: Type guards validate TargetFrameworks is string or string[]
- Unit test: PackageReference model includes all required fields
- Unit test: ProjectParseError includes all error codes

<a id="task-2"></a>
### Task 2: Implement Low-Level CLI Command Executor

Create generic CLI execution utility for running `dotnet` commands with timeout, streaming, and error handling.

**Files to Create:**
- `src/services/cli/dotnetCliExecutor.ts`

**Implementation Details:**
```typescript
import { spawn } from 'child_process';
import type { ILogger } from '../loggerService';

export interface CliExecutionOptions {
  /** Command arguments (e.g., ['msbuild', 'MyApp.csproj', '-getProperty:TargetFramework']) */
  args: string[];
  
  /** Working directory for command execution */
  cwd: string;
  
  /** Timeout in milliseconds (default: 10000) */
  timeout?: number;
  
  /** Environment variables to merge with process.env */
  env?: Record<string, string>;
}

export interface CliExecutionResult {
  /** Exit code (0 = success) */
  exitCode: number;
  
  /** Standard output as string */
  stdout: string;
  
  /** Standard error as string */
  stderr: string;
  
  /** Whether command timed out */
  timedOut: boolean;
}

export interface DotnetCliExecutor {
  /**
   * Execute a dotnet CLI command and return result
   * @throws Never throws - returns result with exitCode and error details
   */
  execute(options: CliExecutionOptions): Promise<CliExecutionResult>;
  
  /**
   * Check if dotnet CLI is available on PATH
   */
  isDotnetAvailable(): Promise<boolean>;
  
  /**
   * Get dotnet SDK version
   */
  getDotnetVersion(): Promise<string | null>;
}

export function createDotnetCliExecutor(logger: ILogger): DotnetCliExecutor {
  return {
    async execute(options: CliExecutionOptions): Promise<CliExecutionResult> {
      const timeout = options.timeout ?? 10000;
      const args = options.args;
      
      logger.debug(`Executing: dotnet ${args.join(' ')}`);
      
      return new Promise((resolve) => {
        const child = spawn('dotnet', args, {
          cwd: options.cwd,
          env: { ...process.env, ...options.env },
          shell: false,
        });
        
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        
        const timer = setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
        }, timeout);
        
        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        child.on('error', (error) => {
          clearTimeout(timer);
          logger.error(`CLI execution error: ${error.message}`);
          resolve({
            exitCode: -1,
            stdout,
            stderr: stderr || error.message,
            timedOut: false,
          });
        });
        
        child.on('close', (code) => {
          clearTimeout(timer);
          resolve({
            exitCode: code ?? -1,
            stdout,
            stderr,
            timedOut,
          });
        });
      });
    },
    
    async isDotnetAvailable(): Promise<boolean> {
      const result = await this.execute({
        args: ['--version'],
        cwd: process.cwd(),
        timeout: 5000,
      });
      return result.exitCode === 0;
    },
    
    async getDotnetVersion(): Promise<string | null> {
      const result = await this.execute({
        args: ['--version'],
        cwd: process.cwd(),
        timeout: 5000,
      });
      return result.exitCode === 0 ? result.stdout.trim() : null;
    },
  };
}
```

**Error Handling:**
- Never throw - always return CliExecutionResult with exit code and stderr
- Handle ENOENT (dotnet not found) gracefully
- Kill process on timeout using SIGTERM, then SIGKILL after 2s
- Stream stdout/stderr to avoid memory issues with large output

**Testing:**
- Unit test: Mock spawn to validate timeout handling
- Unit test: Validate stdout/stderr accumulation
- Unit test: isDotnetAvailable returns true when dotnet exists
- Integration test: Real dotnet --version command execution

<a id="task-3"></a>
### Task 3: Implement Target Framework Parser

Parse target framework(s) from `dotnet msbuild -getProperty` output.

**Files to Create:**
- `src/services/cli/parsers/targetFrameworkParser.ts`

**Implementation Details:**
```typescript
import type { DotnetCliExecutor, CliExecutionResult } from '../dotnetCliExecutor';
import type { ILogger } from '../../loggerService';
import type { TargetFrameworks } from '../types/projectMetadata';

export interface TargetFrameworkParser {
  /**
   * Parse target framework(s) from project file
   * @returns Normalized single string or string[] for multi-targeting
   */
  parseTargetFrameworks(projectPath: string): Promise<TargetFrameworks | null>;
}

export function createTargetFrameworkParser(
  cliExecutor: DotnetCliExecutor,
  logger: ILogger
): TargetFrameworkParser {
  return {
    async parseTargetFrameworks(projectPath: string): Promise<TargetFrameworks | null> {
      // Execute: dotnet msbuild <project> -getProperty:TargetFramework;TargetFrameworks -noLogo
      const result = await cliExecutor.execute({
        args: [
          'msbuild',
          projectPath,
          '-getProperty:TargetFramework;TargetFrameworks',
          '-noLogo',
        ],
        cwd: path.dirname(projectPath),
        timeout: 15000, // MSBuild evaluation can be slow
      });
      
      if (result.exitCode !== 0) {
        logger.error(`Failed to get target frameworks for ${projectPath}: ${result.stderr}`);
        return null;
      }
      
      if (result.timedOut) {
        logger.error(`Timeout getting target frameworks for ${projectPath}`);
        return null;
      }
      
      // Parse output: "TargetFramework=net8.0\nTargetFrameworks="
      // or: "TargetFramework=\nTargetFrameworks=net6.0;net7.0;net8.0"
      const lines = result.stdout.trim().split('\n');
      const props: Record<string, string> = {};
      
      for (const line of lines) {
        const match = line.match(/^(\w+)=(.*)$/);
        if (match) {
          props[match[1]] = match[2];
        }
      }
      
      // TargetFrameworks takes precedence (multi-targeting)
      if (props.TargetFrameworks) {
        const frameworks = props.TargetFrameworks.split(';')
          .map(f => f.trim())
          .filter(f => f.length > 0);
        return frameworks.length > 1 ? frameworks : frameworks[0] || null;
      }
      
      // Fallback to single TargetFramework
      if (props.TargetFramework) {
        return props.TargetFramework.trim() || null;
      }
      
      logger.warn(`No target framework found for ${projectPath}`);
      return null;
    },
  };
}
```

**Parsing Logic:**
1. Execute `dotnet msbuild -getProperty:TargetFramework;TargetFrameworks -noLogo`
2. Parse output line-by-line to extract property key-value pairs
3. Prioritize `TargetFrameworks` (multi-targeting) over `TargetFramework` (single)
4. For multi-targeting, split by semicolon and return array if >1 framework
5. For single targeting, return string directly
6. Return null if neither property is defined (invalid project)

**Error Handling:**
- Return null on CLI failure (logged as error)
- Return null on timeout (logged as error)
- Return null if no frameworks defined (logged as warning)
- Handle empty/whitespace-only framework values

**Testing:**
- Unit test: Parse single target framework (e.g., "net8.0")
- Unit test: Parse multi-targeting frameworks (e.g., "net6.0;net7.0;net8.0")
- Unit test: Return null when no frameworks defined
- Unit test: Handle MSBuild evaluation errors gracefully
- Integration test: Real project with TargetFramework property
- Integration test: Real project with TargetFrameworks property

<a id="task-4"></a>
### Task 4: Implement Package Reference Parser

Parse installed packages from `dotnet list package --format json` output.

**Files to Create:**
- `src/services/cli/parsers/packageReferenceParser.ts`

**Implementation Details:**
```typescript
import type { DotnetCliExecutor } from '../dotnetCliExecutor';
import type { ILogger } from '../../loggerService';
import type { PackageReference } from '../types/projectMetadata';

/**
 * JSON output schema from dotnet list package --format json
 */
interface DotnetListPackageOutput {
  version: number;
  parameters: string;
  projects: Array<{
    path: string;
    frameworks: Array<{
      framework: string;
      topLevelPackages: Array<{
        id: string;
        requestedVersion: string;
        resolvedVersion: string;
      }>;
      transitivePackages?: Array<{
        id: string;
        resolvedVersion: string;
      }>;
    }>;
  }>;
}

export interface PackageReferenceParser {
  /**
   * Parse package references from project file
   * @returns Array of direct package references (excludes transitive)
   */
  parsePackageReferences(projectPath: string): Promise<PackageReference[]>;
}

export function createPackageReferenceParser(
  cliExecutor: DotnetCliExecutor,
  logger: ILogger
): PackageReferenceParser {
  return {
    async parsePackageReferences(projectPath: string): Promise<PackageReference[]> {
      // Execute: dotnet list <project> package --format json
      const result = await cliExecutor.execute({
        args: ['list', projectPath, 'package', '--format', 'json'],
        cwd: path.dirname(projectPath),
        timeout: 15000,
      });
      
      if (result.exitCode !== 0) {
        // Check for packages.config error
        if (result.stderr.includes('packages.config')) {
          logger.error(`Unsupported packages.config format: ${projectPath}`);
          throw new Error('UNSUPPORTED_PACKAGES_CONFIG');
        }
        
        logger.error(`Failed to list packages for ${projectPath}: ${result.stderr}`);
        return [];
      }
      
      if (result.timedOut) {
        logger.error(`Timeout listing packages for ${projectPath}`);
        return [];
      }
      
      try {
        const output: DotnetListPackageOutput = JSON.parse(result.stdout);
        const packages: PackageReference[] = [];
        
        // Aggregate packages across all target frameworks
        const packageMap = new Map<string, PackageReference>();
        
        for (const project of output.projects) {
          for (const framework of project.frameworks) {
            for (const pkg of framework.topLevelPackages) {
              // Use highest resolved version if package appears in multiple frameworks
              const existing = packageMap.get(pkg.id);
              if (!existing || this.compareVersions(pkg.resolvedVersion, existing.resolvedVersion) > 0) {
                packageMap.set(pkg.id, {
                  id: pkg.id,
                  requestedVersion: pkg.requestedVersion,
                  resolvedVersion: pkg.resolvedVersion,
                  isTransitive: false,
                });
              }
            }
          }
        }
        
        return Array.from(packageMap.values());
      } catch (error) {
        logger.error(`Failed to parse package list JSON for ${projectPath}: ${error}`);
        return [];
      }
    },
    
    /**
     * Compare semantic versions (simple implementation)
     * @returns >0 if a > b, <0 if a < b, 0 if equal
     */
    compareVersions(a: string, b: string): number {
      const aParts = a.split('.').map(Number);
      const bParts = b.split('.').map(Number);
      const maxLen = Math.max(aParts.length, bParts.length);
      
      for (let i = 0; i < maxLen; i++) {
        const aVal = aParts[i] || 0;
        const bVal = bParts[i] || 0;
        if (aVal !== bVal) {
          return aVal - bVal;
        }
      }
      return 0;
    },
  };
}
```

**Parsing Logic:**
1. Execute `dotnet list package --format json`
2. Parse JSON output to extract top-level packages
3. Aggregate packages across all target frameworks (multi-targeting case)
4. Use highest resolved version if same package appears in multiple frameworks
5. Exclude transitive packages (only include direct PackageReference entries)
6. Return empty array on CLI failure (not an error - project may have no packages)

**Error Handling:**
- Throw specific error for packages.config projects (detected from stderr)
- Return empty array on CLI failure (logged as error)
- Return empty array on JSON parse failure (logged as error)
- Return empty array on timeout (logged as error)

**Testing:**
- Unit test: Parse JSON output with single framework
- Unit test: Parse JSON output with multi-targeting
- Unit test: Aggregate packages across frameworks using highest version
- Unit test: Exclude transitive packages
- Unit test: Detect packages.config error and throw
- Integration test: Real project with PackageReference entries
- Integration test: Real project with no packages (empty array)

<a id="task-5"></a>
### Task 5: Implement Project Metadata Parser Service

Create high-level service that combines all parsers to extract complete project metadata.

**Files to Create:**
- `src/services/cli/dotnetProjectParser.ts`

**Implementation Details:**
```typescript
import * as path from 'path';
import * as fs from 'fs/promises';
import type { ILogger } from '../loggerService';
import type { ProjectMetadata, ProjectParseResult, ProjectParseErrorCode } from './types/projectMetadata';
import type { DotnetCliExecutor } from './dotnetCliExecutor';
import type { TargetFrameworkParser } from './parsers/targetFrameworkParser';
import type { PackageReferenceParser } from './parsers/packageReferenceParser';

export interface DotnetProjectParser {
  /**
   * Parse complete project metadata from .csproj file
   */
  parseProject(projectPath: string): Promise<ProjectParseResult>;
  
  /**
   * Parse multiple projects in parallel
   */
  parseProjects(projectPaths: string[]): Promise<Map<string, ProjectParseResult>>;
  
  /**
   * Clear cached metadata for a project
   */
  clearCache(projectPath: string): void;
  
  /**
   * Clear all cached metadata
   */
  clearAllCaches(): void;
}

export function createDotnetProjectParser(
  cliExecutor: DotnetCliExecutor,
  targetFrameworkParser: TargetFrameworkParser,
  packageReferenceParser: PackageReferenceParser,
  logger: ILogger
): DotnetProjectParser {
  // Cache: Map<projectPath, { metadata: ProjectMetadata, timestamp: number }>
  const cache = new Map<string, { metadata: ProjectMetadata; timestamp: number }>();
  const CACHE_TTL = 60000; // 1 minute
  
  return {
    async parseProject(projectPath: string): Promise<ProjectParseResult> {
      // Check cache
      const cached = cache.get(projectPath);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        logger.debug(`Using cached metadata for ${projectPath}`);
        return { success: true, metadata: cached.metadata };
      }
      
      // Validate file exists
      try {
        await fs.access(projectPath);
      } catch {
        return {
          success: false,
          error: {
            code: 'PROJECT_NOT_FOUND' as ProjectParseErrorCode,
            message: `Project file not found: ${projectPath}`,
            projectPath,
          },
        };
      }
      
      // Check dotnet availability
      const dotnetAvailable = await cliExecutor.isDotnetAvailable();
      if (!dotnetAvailable) {
        return {
          success: false,
          error: {
            code: 'DOTNET_NOT_FOUND' as ProjectParseErrorCode,
            message: 'dotnet CLI not found on PATH',
            projectPath,
          },
        };
      }
      
      // Parse target frameworks
      const targetFrameworks = await targetFrameworkParser.parseTargetFrameworks(projectPath);
      if (!targetFrameworks) {
        return {
          success: false,
          error: {
            code: 'NO_TARGET_FRAMEWORK' as ProjectParseErrorCode,
            message: 'No target framework defined in project',
            projectPath,
          },
        };
      }
      
      // Parse package references
      let packageReferences;
      try {
        packageReferences = await packageReferenceParser.parsePackageReferences(projectPath);
      } catch (error) {
        if ((error as Error).message === 'UNSUPPORTED_PACKAGES_CONFIG') {
          return {
            success: false,
            error: {
              code: 'UNSUPPORTED_PACKAGES_CONFIG' as ProjectParseErrorCode,
              message: 'Legacy packages.config format is not supported',
              projectPath,
              details: 'Migrate to PackageReference format using: dotnet migrate-2019',
            },
          };
        }
        throw error;
      }
      
      // Parse additional properties (optional)
      const propsResult = await cliExecutor.execute({
        args: [
          'msbuild',
          projectPath,
          '-getProperty:OutputType;UseArtifactsOutput',
          '-noLogo',
        ],
        cwd: path.dirname(projectPath),
        timeout: 10000,
      });
      
      const additionalProps: Record<string, string> = {};
      if (propsResult.exitCode === 0) {
        for (const line of propsResult.stdout.trim().split('\n')) {
          const match = line.match(/^(\w+)=(.*)$/);
          if (match) {
            additionalProps[match[1]] = match[2];
          }
        }
      }
      
      // Build metadata
      const metadata: ProjectMetadata = {
        path: projectPath,
        name: path.basename(projectPath),
        targetFrameworks,
        packageReferences,
        outputType: additionalProps.OutputType || undefined,
        useArtifactsOutput: additionalProps.UseArtifactsOutput === 'true',
      };
      
      // Cache result
      cache.set(projectPath, { metadata, timestamp: Date.now() });
      
      return { success: true, metadata };
    },
    
    async parseProjects(projectPaths: string[]): Promise<Map<string, ProjectParseResult>> {
      const results = new Map<string, ProjectParseResult>();
      
      // Parse in parallel with concurrency limit of 5
      const concurrency = 5;
      for (let i = 0; i < projectPaths.length; i += concurrency) {
        const batch = projectPaths.slice(i, i + concurrency);
        const batchResults = await Promise.all(
          batch.map(async (projectPath) => {
            const result = await this.parseProject(projectPath);
            return { projectPath, result };
          })
        );
        
        for (const { projectPath, result } of batchResults) {
          results.set(projectPath, result);
        }
      }
      
      return results;
    },
    
    clearCache(projectPath: string): void {
      cache.delete(projectPath);
      logger.debug(`Cleared cache for ${projectPath}`);
    },
    
    clearAllCaches(): void {
      cache.clear();
      logger.debug('Cleared all project metadata caches');
    },
  };
}
```

**Orchestration Logic:**
1. Check in-memory cache (1 minute TTL)
2. Validate project file exists
3. Verify dotnet CLI is available
4. Parse target framework(s) - fail if none defined
5. Parse package references - fail if packages.config detected
6. Parse optional properties (OutputType, UseArtifactsOutput)
7. Combine into ProjectMetadata model
8. Cache result with timestamp
9. Return success or error result

**Batch Parsing:**
- `parseProjects()` accepts array of project paths
- Executes 5 projects in parallel for optimal performance
- Returns Map of projectPath → ProjectParseResult
- Each project parsed independently (one failure doesn't block others)

**Error Handling:**
- Return typed error results (never throw except for packages.config)
- Validate dotnet availability before parsing
- Detect packages.config projects with actionable migration guidance
- Cache both successes and failures to avoid repeated CLI calls

**Testing:**
- Unit test: Cache hit returns cached metadata
- Unit test: Cache miss triggers fresh parse
- Unit test: Batch parsing executes in parallel batches
- Unit test: Dotnet not found returns appropriate error
- Unit test: Project not found returns appropriate error
- Unit test: packages.config detected and rejected
- Integration test: Real project with all metadata fields
- Integration test: Multi-targeting project

<a id="task-6"></a>
### Task 6: Add File Watcher for Cache Invalidation

Implement file system watching to invalidate cache when project files change.

**Files to Modify:**
- `src/services/cli/dotnetProjectParser.ts`

**Implementation Details:**
```typescript
import * as vscode from 'vscode';

export function createDotnetProjectParser(
  cliExecutor: DotnetCliExecutor,
  targetFrameworkParser: TargetFrameworkParser,
  packageReferenceParser: PackageReferenceParser,
  logger: ILogger
): DotnetProjectParser & vscode.Disposable {
  const cache = new Map<string, { metadata: ProjectMetadata; timestamp: number }>();
  const CACHE_TTL = 60000;
  
  // File watcher for .csproj files
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.csproj');
  
  // Invalidate cache on project file changes
  const onFileChange = (uri: vscode.Uri) => {
    const projectPath = uri.fsPath;
    if (cache.has(projectPath)) {
      cache.delete(projectPath);
      logger.debug(`Invalidated cache for ${projectPath} (file changed)`);
    }
  };
  
  watcher.onDidChange(onFileChange);
  watcher.onDidDelete(onFileChange);
  
  return {
    // ... existing implementation ...
    
    dispose(): void {
      watcher.dispose();
      cache.clear();
    },
  };
}
```

**File Watcher Configuration:**
- Pattern: `**/*.csproj` (all project files in workspace)
- Events: `onDidChange`, `onDidDelete`
- Action: Clear cache entry for changed/deleted project
- Dispose: Clean up watcher and cache on service disposal

**Testing:**
- Unit test: File change event clears cache entry
- Unit test: File delete event clears cache entry
- Unit test: dispose() cleans up watcher
- E2E test: Edit .csproj, verify cache invalidated

<a id="task-7"></a>
### Task 7: Integrate with Solution Discovery Service

Update `SolutionContextService` and `DotnetSolutionParser` to use new project parser.

**Files to Modify:**
- `src/services/context/solutionContextService.ts`
- `src/services/cli/dotnetSolutionParser.ts`

**Implementation Details:**

**In `dotnetSolutionParser.ts`:**
```typescript
export interface SolutionProject {
  /** Absolute project file path */
  path: string;
  
  /** Project file name */
  name: string;
  
  /** Project metadata (null if parsing failed) */
  metadata: ProjectMetadata | null;
}

export async function parseSolution(
  solutionPath: string,
  projectParser: DotnetProjectParser
): Promise<SolutionParseResult> {
  // 1. Get project paths from dotnet sln list
  const projectPaths = await getProjectPathsFromSolution(solutionPath);
  
  // 2. Parse all projects in parallel
  const parseResults = await projectParser.parseProjects(projectPaths);
  
  // 3. Build SolutionProject array
  const projects: SolutionProject[] = [];
  for (const [projectPath, result] of parseResults) {
    projects.push({
      path: projectPath,
      name: path.basename(projectPath),
      metadata: result.success ? result.metadata : null,
    });
  }
  
  return {
    solutionPath,
    projects,
    format: solutionPath.endsWith('.slnx') ? 'slnx' : 'sln',
  };
}
```

**In `solutionContextService.ts`:**
```typescript
export interface SolutionContext {
  activeSolution: DiscoveredSolution | null;
  projects: SolutionProject[]; // Now includes metadata
  mode: 'solution' | 'workspace' | 'none';
}
```

**Testing:**
- Unit test: Solution parser uses project parser for metadata
- Unit test: Parse failures included in results (metadata = null)
- Integration test: Solution with valid and invalid projects

<a id="task-8"></a>
### Task 8: Write Unit Tests

Create comprehensive unit test suite with mocked CLI executor.

**Files to Create:**
- `src/services/cli/__tests__/dotnetCliExecutor.test.ts`
- `src/services/cli/parsers/__tests__/targetFrameworkParser.test.ts`
- `src/services/cli/parsers/__tests__/packageReferenceParser.test.ts`
- `src/services/cli/__tests__/dotnetProjectParser.test.ts`

**Test Coverage Requirements:**

**CLI Executor Tests:**
- Execute command with timeout
- Handle spawn errors (ENOENT for dotnet not found)
- Accumulate stdout/stderr from streams
- Kill process on timeout
- isDotnetAvailable returns true/false based on exit code

**Target Framework Parser Tests:**
- Parse single TargetFramework property
- Parse multi-targeting TargetFrameworks property
- Prioritize TargetFrameworks over TargetFramework
- Split semicolon-delimited frameworks
- Return null when no framework defined
- Handle CLI failures gracefully

**Package Reference Parser Tests:**
- Parse JSON output with top-level packages
- Parse multi-targeting projects (aggregate frameworks)
- Use highest version when package in multiple frameworks
- Exclude transitive packages
- Detect packages.config error from stderr
- Return empty array on CLI failure
- Handle malformed JSON gracefully

**Project Parser Tests:**
- Cache hit returns cached metadata
- Cache miss triggers fresh parse
- TTL expiration triggers re-parse
- parseProjects() executes in parallel batches
- Dotnet not available returns error
- Project not found returns error
- No target framework returns error
- packages.config detected returns error
- Cache invalidation on file change
- dispose() cleans up resources

**Mocking Strategy:**
- Mock `DotnetCliExecutor.execute()` to return controlled CliExecutionResult
- Mock `fs.access()` for file existence checks
- Mock `vscode.workspace.createFileSystemWatcher()` for watcher tests
- Create sample JSON outputs for package list parsing

**Test Runner:**
- Use Bun test runner: `bun test src/services/cli/`
- Run via `npm run test:unit`

**Target Coverage:**
- Overall: >80%
- Critical paths (CLI parsing, error handling): >95%

<a id="task-9"></a>
### Task 9: Write Integration Tests

Create integration tests against real .NET CLI and test fixture projects.

**Files to Create:**
- `test/integration/dotnetProjectParser.integration.test.ts`
- `test/fixtures/projects/SingleTarget/SingleTarget.csproj`
- `test/fixtures/projects/MultiTarget/MultiTarget.csproj`
- `test/fixtures/projects/WithPackages/WithPackages.csproj`
- `test/fixtures/projects/NoPackages/NoPackages.csproj`

**Test Fixtures:**

**SingleTarget.csproj:**
```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <OutputType>Exe</OutputType>
  </PropertyGroup>
</Project>
```

**MultiTarget.csproj:**
```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFrameworks>net6.0;net7.0;net8.0</TargetFrameworks>
    <OutputType>Library</OutputType>
  </PropertyGroup>
</Project>
```

**WithPackages.csproj:**
```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />
    <PackageReference Include="Serilog" Version="3.1.1" />
  </ItemGroup>
</Project>
```

**Integration Test Scenarios:**
- Parse single-target project and validate TargetFramework
- Parse multi-target project and validate TargetFrameworks array
- Parse project with packages and validate PackageReference entries
- Parse project with no packages and validate empty array
- Parse OutputType property extraction
- Verify cache invalidation across runs
- Test batch parsing with multiple projects

**Prerequisites:**
- Requires .NET SDK 6.0+ installed in CI environment
- Add dotnet SDK setup to GitHub Actions workflow
- Run `dotnet restore` on test fixtures before tests

**Test Runner:**
- Use Bun test runner: `bun test test/integration/dotnetProjectParser.integration.test.ts`
- Run via `npm run test:integration`

**CI Configuration:**
Update `.github/workflows/ci.yml` to install .NET SDK:
```yaml
- name: Setup .NET
  uses: actions/setup-dotnet@v3
  with:
    dotnet-version: '8.0.x'
```

<a id="task-10"></a>
### Task 10: Update Documentation

Update relevant documentation files to reflect CLI-based parsing approach.

**Files to Modify:**
- `docs/discovery/solution-project-scoping.md` — Update "CLI Integration" section with new parser details
- `docs/stories/STORY-001-02-001a-solution-discovery.md` — Update to reference project metadata parsing
- `README.md` — Add .NET SDK requirement to prerequisites section

**Documentation Updates:**

**In `solution-project-scoping.md`:**
- Add section: "Project Metadata Parsing" describing DotnetProjectParser
- Document CLI commands used (msbuild -getProperty, list package)
- Add performance characteristics for batch parsing
- Include example ProjectMetadata JSON structure

**In `STORY-001-02-001a-solution-discovery.md`:**
- Update Task 3 to reference new DotnetProjectParser service
- Remove XML parsing references
- Add integration point for project metadata in SolutionContext

**In `README.md`:**
- Add requirement: ".NET SDK 6.0 or higher" to prerequisites
- Add note: "The extension uses dotnet CLI for all project operations"

## Notes

This implementation is **critical infrastructure** for all project-level operations. The CLI-based approach ensures MSBuild evaluation correctness but requires careful error handling and performance optimization.

**Performance Considerations:**
- Batch parsing with concurrency limit prevents overwhelming dotnet CLI
- 1-minute TTL cache balances freshness with performance
- File watchers provide reactive cache invalidation
- Parallel project parsing reduces total discovery time from O(n) to O(n/5)

**Error Handling Philosophy:**
- Fail fast on invalid projects (packages.config, no target framework)
- Return typed errors instead of throwing exceptions
- Provide actionable error messages (e.g., migration command for packages.config)
- Log all CLI failures for troubleshooting

**Future Enhancements:**
- Incremental parsing: Only re-parse changed projects
- Project reference graph traversal
- Dependency tree analysis
- Framework compatibility matrix calculation
- Package vulnerability scanning integration

**Dependencies:**
- Must complete STORY-001-02-001a (Solution Discovery) first for integration
- Consumed by STORY-001-02-001c (Workspace Discovery) for fallback parsing
- Used by package install/update operations for target framework validation

---
**Implementation Plan**: IMPL-001-02-001b-cli-project-parsing  
**Story**: [STORY-001-02-001b-cli-project-parsing](../stories/STORY-001-02-001b-cli-project-parsing.md)  
**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)
