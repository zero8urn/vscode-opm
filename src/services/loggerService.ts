import type * as vscode from 'vscode';

export interface ILogger extends vscode.Disposable {
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string | Error, error?: Error): void;
  debug(message: string, ...args: any[]): void;
  show(preserveFocus?: boolean): void;
  isDebugEnabled(): boolean;
}

export function formatLog(level: string, message: string, args: any[]): string {
  const timestamp = new Date().toISOString();
  let rest = '';
  if (args && args.length) {
    rest = ' ' + args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  }
  return `[${timestamp}] [${level}] ${message}${rest}`;
}

export class LoggerService implements ILogger {
  private outputChannel: vscode.OutputChannel;
  private disposables: vscode.Disposable[] = [];
  private getDebug?: () => boolean;
  constructor(context?: vscode.ExtensionContext, outputChannel?: vscode.OutputChannel, getDebug?: () => boolean) {
    if (outputChannel) {
      this.outputChannel = outputChannel;
    } else {
      throw new Error(
        'LoggerService requires an OutputChannel in this environment; use createLogger in the extension runtime.',
      );
    }
    this.getDebug = getDebug;

    if (!this.getDebug) {
      // default: read from configuration and update on changes
      this.updateDebugSetting();
      try {
        // runtime attach to vscode workspace change if available
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const vscodeApi: typeof import('vscode') = require('vscode');
        this.disposables.push(
          vscodeApi.workspace.onDidChangeConfiguration((e: any) => {
            if (e.affectsConfiguration('nugetPackageManager.logging')) {
              this.updateDebugSetting();
            }
          }),
        );
      } catch {
        // vscode not available (tests); ignore
      }
    }
  }

  private debugEnabled: boolean = false;

  private updateDebugSetting() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const vscodeApi: typeof import('vscode') = require('vscode');
      const cfg = vscodeApi.workspace.getConfiguration('nugetPackageManager.logging');
      this.debugEnabled = !!cfg.get<boolean>('debug', false);
    } catch {
      // If vscode isn't available (tests), default to false
      this.debugEnabled = false;
    }
  }

  isDebugEnabled(): boolean {
    return this.getDebug ? !!this.getDebug() : this.debugEnabled;
  }

  info(message: string, ...args: any[]) {
    const line = formatLog('INFO', message, args);
    this.outputChannel.appendLine(line);
  }

  warn(message: string, ...args: any[]) {
    const line = formatLog('WARN', message, args);
    this.outputChannel.appendLine(line);
  }

  error(message: string | Error, error?: Error) {
    let text: string;
    if (message instanceof Error) {
      text = message.message;
      error = message;
    } else {
      text = message;
    }
    const details = error && error.stack ? `\n${error.stack}` : '';
    const line = formatLog('ERROR', `${text}${details}`, []);
    this.outputChannel.appendLine(line);
  }

  debug(message: string, ...args: any[]) {
    if (!this.isDebugEnabled()) return;
    const line = formatLog('DEBUG', message, args);
    this.outputChannel.appendLine(line);
  }

  show(preserveFocus: boolean = false) {
    this.outputChannel.show(preserveFocus);
  }

  dispose() {
    try {
      this.outputChannel.dispose();
    } catch (e) {
      // ignore disposal errors
    }
    this.disposables.forEach(d => d.dispose());
  }
}

export default LoggerService;

/**
 * Factory used by the extension runtime to create a LoggerService with a real OutputChannel.
 * Call this from `extension.ts` activation where `vscode` is available.
 */
export function createLogger(context?: vscode.ExtensionContext): LoggerService {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const vscodeApi: typeof import('vscode') = require('vscode');
  const channel = vscodeApi.window.createOutputChannel('NuGet Package Management');
  return new LoggerService(context, channel);
}
