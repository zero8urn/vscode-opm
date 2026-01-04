/**
 * Low-level executor for dotnet CLI commands with timeout and streaming support.
 *
 * This module provides a generic interface for running `dotnet` commands with
 * proper error handling, timeout management, and streaming output capture.
 *
 * @module services/cli/dotnetCliExecutor
 */

import { spawn } from 'child_process';
import type { ILogger } from '../loggerService';

export interface CliExecutionOptions {
  /** Command arguments (e.g., ['msbuild', 'MyApp.csproj', '-getProperty:TargetFramework']) */
  readonly args: string[];

  /** Working directory for command execution */
  readonly cwd?: string;

  /** Timeout in milliseconds (default: 30000) */
  readonly timeout?: number;

  /** Additional environment variables */
  readonly env?: Record<string, string>;
}

export interface CliExecutionResult {
  /** Exit code (0 = success) */
  readonly exitCode: number;

  /** Standard output */
  readonly stdout: string;

  /** Standard error */
  readonly stderr: string;

  /** Whether the command timed out */
  readonly timedOut: boolean;
}

export interface DotnetCliExecutor {
  /**
   * Execute a dotnet CLI command.
   *
   * Never throws - always returns CliExecutionResult with exit code and output.
   * Handles ENOENT (dotnet not found) gracefully by returning exit code -1.
   * Kills process on timeout using SIGTERM, then SIGKILL after 2s.
   *
   * @param options - Command execution options
   * @returns Execution result with exit code, stdout, stderr, and timeout flag
   */
  execute(options: CliExecutionOptions): Promise<CliExecutionResult>;

  /**
   * Check if dotnet CLI is available in PATH.
   *
   * @returns true if dotnet is available, false otherwise
   */
  isDotnetAvailable(): Promise<boolean>;

  /**
   * Get the installed dotnet version.
   *
   * @returns Version string (e.g., "8.0.100") or null if not available
   */
  getDotnetVersion(): Promise<string | null>;
}

export function createDotnetCliExecutor(logger: ILogger): DotnetCliExecutor {
  return {
    async execute(options: CliExecutionOptions): Promise<CliExecutionResult> {
      const { args, cwd, timeout = 30000, env } = options;

      logger.debug(`Executing: dotnet ${args.join(' ')}`, { cwd, timeout });

      return new Promise(resolve => {
        const stdoutChunks: string[] = [];
        const stderrChunks: string[] = [];
        let timedOut = false;
        let killed = false;

        // Spawn dotnet process
        const proc = spawn('dotnet', args, {
          cwd,
          env: { ...process.env, ...env },
          shell: false,
        });

        // Handle ENOENT (dotnet not found)
        proc.on('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'ENOENT') {
            logger.error('dotnet CLI not found in PATH', err);
            resolve({
              exitCode: -1,
              stdout: '',
              stderr: 'dotnet CLI not found in PATH. Please install .NET SDK.',
              timedOut: false,
            });
          } else {
            logger.error('Process spawn error', err);
            resolve({
              exitCode: -1,
              stdout: '',
              stderr: `Process error: ${err.message}`,
              timedOut: false,
            });
          }
        });

        // Stream stdout
        proc.stdout?.on('data', (chunk: Buffer) => {
          stdoutChunks.push(chunk.toString());
        });

        // Stream stderr
        proc.stderr?.on('data', (chunk: Buffer) => {
          stderrChunks.push(chunk.toString());
        });

        // Handle process exit
        proc.on('exit', (code, signal) => {
          if (killed) return; // Already resolved via timeout

          const exitCode = code ?? (signal ? -1 : 0);
          const stdout = stdoutChunks.join('');
          const stderr = stderrChunks.join('');

          logger.debug(`Process exited with code ${exitCode}`, {
            stdout: stdout.length,
            stderr: stderr.length,
            timedOut,
          });

          resolve({
            exitCode,
            stdout,
            stderr,
            timedOut,
          });
        });

        // Handle timeout
        const timeoutHandle = setTimeout(() => {
          timedOut = true;
          killed = true;

          logger.warn(`Command timed out after ${timeout}ms`, { args });

          // Try graceful termination first
          proc.kill('SIGTERM');

          // Force kill after 2s if still running
          setTimeout(() => {
            if (!proc.killed) {
              logger.warn('Force killing process with SIGKILL', { args });
              proc.kill('SIGKILL');
            }
          }, 2000);

          resolve({
            exitCode: -1,
            stdout: stdoutChunks.join(''),
            stderr: stderrChunks.join(''),
            timedOut: true,
          });
        }, timeout);

        // Clear timeout on process exit
        proc.on('exit', () => {
          clearTimeout(timeoutHandle);
        });
      });
    },

    async isDotnetAvailable(): Promise<boolean> {
      const result = await this.execute({ args: ['--version'] });
      return result.exitCode === 0;
    },

    async getDotnetVersion(): Promise<string | null> {
      const result = await this.execute({ args: ['--version'] });
      if (result.exitCode === 0) {
        return result.stdout.trim();
      }
      return null;
    },
  };
}
