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
  // Namespaces (read-only access to VS Code API namespaces)
  readonly workspace: typeof vscode.workspace;
  readonly window: typeof vscode.window;
  readonly commands: typeof vscode.commands;
  readonly extensions: typeof vscode.extensions;
  readonly env: typeof vscode.env;

  // Type constructors
  readonly Uri: typeof vscode.Uri;
  readonly Range: typeof vscode.Range;
  readonly Position: typeof vscode.Position;
  readonly EventEmitter: typeof vscode.EventEmitter;

  // Common operations (convenience wrappers)
  getConfiguration(section?: string): vscode.WorkspaceConfiguration;
  createOutputChannel(name: string, languageId?: string): vscode.OutputChannel;
  showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined>;
  showErrorMessage(message: string, ...items: string[]): Thenable<string | undefined>;
  showWarningMessage(message: string, ...items: string[]): Thenable<string | undefined>;
  withProgress<T>(
    options: vscode.ProgressOptions,
    task: (
      progress: vscode.Progress<{ message?: string; increment?: number }>,
      token: vscode.CancellationToken,
    ) => Thenable<T>,
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

  // Namespace access
  get workspace() {
    return this.api.workspace;
  }
  get window() {
    return this.api.window;
  }
  get commands() {
    return this.api.commands;
  }
  get extensions() {
    return this.api.extensions;
  }
  get env() {
    return this.api.env;
  }

  // Type constructors
  get Uri() {
    return this.api.Uri;
  }
  get Range() {
    return this.api.Range;
  }
  get Position() {
    return this.api.Position;
  }
  get EventEmitter() {
    return this.api.EventEmitter;
  }

  // Common operations
  getConfiguration(section?: string): vscode.WorkspaceConfiguration {
    return this.api.workspace.getConfiguration(section);
  }

  createOutputChannel(name: string, languageId?: string): vscode.OutputChannel {
    return languageId
      ? this.api.window.createOutputChannel(name, languageId)
      : this.api.window.createOutputChannel(name);
  }

  showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined> {
    return this.api.window.showInformationMessage(message, ...items);
  }

  showErrorMessage(message: string, ...items: string[]): Thenable<string | undefined> {
    return this.api.window.showErrorMessage(message, ...items);
  }

  showWarningMessage(message: string, ...items: string[]): Thenable<string | undefined> {
    return this.api.window.showWarningMessage(message, ...items);
  }

  withProgress<T>(
    options: vscode.ProgressOptions,
    task: (
      progress: vscode.Progress<{ message?: string; increment?: number }>,
      token: vscode.CancellationToken,
    ) => Thenable<T>,
  ): Thenable<T> {
    return this.api.window.withProgress(options, task);
  }
}

/**
 * Mock implementation for unit tests.
 * No VS Code dependencies - runs in pure Node/Bun test environment.
 */
export class MockVsCodeRuntime implements IVsCodeRuntime {
  // Message tracking (for test assertions)
  readonly messages: Array<{ type: 'info' | 'error' | 'warning'; message: string; items?: string[] }> = [];

  // Configuration mock (simple in-memory store)
  private readonly configStore = new Map<string, Record<string, unknown>>();

  // Output channel mock
  private readonly outputChannels = new Map<string, MockOutputChannel>();

  // Progress tracking
  readonly progressCalls: Array<{ title?: string; location?: unknown }> = [];

  // Namespace properties (throw if accessed - not needed for most tests)
  get workspace(): typeof vscode.workspace {
    return {
      workspaceFolders: undefined,
      onDidChangeConfiguration: () => ({ dispose: () => {} } as any),
    } as any;
  }

  get window(): typeof vscode.window {
    throw new Error('MockVsCodeRuntime.window not implemented - use method stubs instead');
  }

  get commands(): typeof vscode.commands {
    // Provide a default commands implementation that delegates to an optional test stub
    return {
      executeCommand: (...args: unknown[]) => {
        if (typeof (this as any).commandsExecuteStub === 'function') {
          return (this as any).commandsExecuteStub(...args);
        }
        return Promise.resolve(undefined);
      },
    } as any;
  }

  get extensions(): typeof vscode.extensions {
    throw new Error('MockVsCodeRuntime.extensions not implemented');
  }

  get env(): typeof vscode.env {
    throw new Error('MockVsCodeRuntime.env not implemented');
  }

  // Type constructors (basic implementations)
  get Uri(): typeof vscode.Uri {
    return {
      file: (path: string) => ({ fsPath: path, scheme: 'file', path } as any),
      parse: (value: string) => ({ fsPath: value, scheme: 'file', path: value } as any),
    } as any;
  }

  get Range(): typeof vscode.Range {
    return class Range {} as any;
  }

  get Position(): typeof vscode.Position {
    return class Position {} as any;
  }

  get EventEmitter(): typeof vscode.EventEmitter {
    return class EventEmitter {} as any;
  }

  /**
   * Set configuration value for tests
   */
  setConfig(section: string, key: string, value: unknown): void {
    if (!this.configStore.has(section)) {
      this.configStore.set(section, {});
    }
    this.configStore.get(section)![key] = value;
  }

  /**
   * Clear all configuration
   */
  clearConfig(): void {
    this.configStore.clear();
  }

  /**
   * Clear all tracked messages
   */
  clearMessages(): void {
    this.messages.length = 0;
  }

  /**
   * Clear all tracked progress calls
   */
  clearProgress(): void {
    this.progressCalls.length = 0;
  }

  // IVsCodeRuntime implementation (subset for testing)

  getConfiguration(section?: string): vscode.WorkspaceConfiguration {
    const config = section ? this.configStore.get(section) ?? {} : {};
    return {
      get: <T>(key: string, defaultValue?: T): T => {
        const value = (config as Record<string, unknown>)[key];
        return (value !== undefined ? value : defaultValue) as T;
      },
      has: (key: string): boolean => {
        return key in (config as Record<string, unknown>);
      },
      inspect: () => undefined,
      update: async (key: string, value: unknown) => {
        if (section) {
          this.setConfig(section, key, value);
        }
      },
    } as vscode.WorkspaceConfiguration;
  }

  createOutputChannel(name: string, languageId?: string): vscode.OutputChannel {
    if (!this.outputChannels.has(name)) {
      this.outputChannels.set(name, new MockOutputChannel(name));
    }
    return this.outputChannels.get(name)! as unknown as vscode.OutputChannel;
  }

  showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined> {
    this.messages.push({ type: 'info', message, items });
    return Promise.resolve(items[0]);
  }

  showErrorMessage(message: string, ...items: string[]): Thenable<string | undefined> {
    this.messages.push({ type: 'error', message, items });
    return Promise.resolve(items[0]);
  }

  showWarningMessage(message: string, ...items: string[]): Thenable<string | undefined> {
    this.messages.push({ type: 'warning', message, items });
    return Promise.resolve(items[0]);
  }

  withProgress<T>(
    options: vscode.ProgressOptions,
    task: (
      progress: vscode.Progress<{ message?: string; increment?: number }>,
      token: vscode.CancellationToken,
    ) => Thenable<T>,
  ): Thenable<T> {
    this.progressCalls.push({ title: options.title, location: options.location });

    // Mock progress reporter
    const mockProgress: vscode.Progress<{ message?: string; increment?: number }> = {
      report: () => {
        /* no-op */
      },
    };

    // Mock cancellation token (never cancelled in tests by default)
    const mockToken: vscode.CancellationToken = {
      isCancellationRequested: false,
      onCancellationRequested: () => ({ dispose: () => {} }),
    };

    return task(mockProgress, mockToken);
  }

  /**
   * Get output channel by name (for test assertions)
   */
  getOutputChannel(name: string): MockOutputChannel | undefined {
    return this.outputChannels.get(name);
  }

  /**
   * Get all messages of a specific type
   */
  getMessages(type: 'info' | 'error' | 'warning'): string[] {
    return this.messages.filter(m => m.type === type).map(m => m.message);
  }

  /**
   * Check if a message was shown
   */
  hasMessage(message: string): boolean {
    return this.messages.some(m => m.message === message);
  }
}

/**
 * Mock OutputChannel for testing
 */
export class MockOutputChannel {
  readonly lines: string[] = [];
  private _isShown = false;

  constructor(readonly name: string) {}

  append(value: string): void {
    if (this.lines.length === 0) {
      this.lines.push(value);
    } else {
      this.lines[this.lines.length - 1] += value;
    }
  }

  appendLine(value: string): void {
    this.lines.push(value);
  }

  clear(): void {
    this.lines.length = 0;
  }

  show(preserveFocus?: boolean): void {
    this._isShown = true;
  }

  hide(): void {
    this._isShown = false;
  }

  dispose(): void {
    this.clear();
  }

  get isShown(): boolean {
    return this._isShown;
  }

  /**
   * Get all output as a single string
   */
  getText(): string {
    return this.lines.join('\n');
  }

  /**
   * Check if output contains text
   */
  contains(text: string): boolean {
    return this.getText().includes(text);
  }
}
