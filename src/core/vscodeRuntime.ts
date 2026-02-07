/**
 * Adapter for VS Code API access.
 * Single source of truth for all VS Code runtime dependencies.
 * Enables full testability without VS Code Extension Host.
 *
 * @example Production:
 * ```typescript
 * const runtime = new VsCodeRuntime();
 * const config = runtime.getConfiguration('opm');
 * ```
 *
 * @example Tests:
 * ```typescript
 * const runtime = new MockVsCodeRuntime();
 * runtime.showInformationMessage('Test');
 * expect(runtime.messages).toContain('Test');
 * ```
 */

import type * as vscode from 'vscode';

export interface IVsCodeRuntime {
  readonly workspace: typeof vscode.workspace;
  readonly window: typeof vscode.window;
  readonly commands: typeof vscode.commands;
  readonly Uri: typeof vscode.Uri;

  getConfiguration(section: string): vscode.WorkspaceConfiguration;
  createOutputChannel(name: string): vscode.OutputChannel;
  showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined>;
  showErrorMessage(message: string, ...items: string[]): Thenable<string | undefined>;
  withProgress<T>(
    options: vscode.ProgressOptions,
    task: (progress: vscode.Progress<{ message?: string }>) => Promise<T>,
  ): Thenable<T>;
}

/**
 * Production adapter - only file that imports vscode at runtime.
 */
export class VsCodeRuntime implements IVsCodeRuntime {
  private readonly api: typeof import('vscode');

  constructor() {
    // This is the ONLY place vscode is required at runtime
    this.api = require('vscode');
  }

  get workspace() {
    return this.api.workspace;
  }
  get window() {
    return this.api.window;
  }
  get commands() {
    return this.api.commands;
  }
  get Uri() {
    return this.api.Uri;
  }

  getConfiguration(section: string): vscode.WorkspaceConfiguration {
    return this.api.workspace.getConfiguration(section);
  }

  createOutputChannel(name: string): vscode.OutputChannel {
    return this.api.window.createOutputChannel(name);
  }

  showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined> {
    return this.api.window.showInformationMessage(message, ...items);
  }

  showErrorMessage(message: string, ...items: string[]): Thenable<string | undefined> {
    return this.api.window.showErrorMessage(message, ...items);
  }

  withProgress<T>(
    options: vscode.ProgressOptions,
    task: (progress: vscode.Progress<{ message?: string }>) => Promise<T>,
  ): Thenable<T> {
    return this.api.window.withProgress(options, task);
  }
}

/**
 * Test adapter - no VS Code dependencies.
 */
export class MockVsCodeRuntime implements Partial<IVsCodeRuntime> {
  readonly messages: string[] = [];
  readonly errors: string[] = [];
  private readonly configs = new Map<string, Record<string, unknown>>();

  showInformationMessage(message: string): Thenable<string | undefined> {
    this.messages.push(message);
    return Promise.resolve(undefined);
  }

  showErrorMessage(message: string): Thenable<string | undefined> {
    this.errors.push(message);
    return Promise.resolve(undefined);
  }

  getConfiguration(section: string): any {
    return {
      get: <T>(key: string, defaultValue?: T): T | undefined => {
        const config = this.configs.get(section);
        if (!config) return defaultValue;
        const value = config[key];
        return value !== undefined ? (value as T) : defaultValue;
      },
      has: (key: string): boolean => {
        const config = this.configs.get(section);
        return config ? key in config : false;
      },
    };
  }

  setConfig(section: string, key: string, value: unknown): void {
    const config = this.configs.get(section) || {};
    config[key] = value;
    this.configs.set(section, config);
  }
}
