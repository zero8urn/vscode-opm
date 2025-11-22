import * as vscode from 'vscode';

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
    this.outputChannel = outputChannel ?? vscode.window.createOutputChannel('NuGet Package Management');
    this.getDebug = getDebug;

    if (!this.getDebug) {
      // default: read from configuration and update on changes
      this.updateDebugSetting();
      // listen for configuration changes
      this.disposables.push(
        vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
          if (e.affectsConfiguration('nugetPackageManager.logging')) {
            this.updateDebugSetting();
          }
        }),
      );
    }
  }

  private debugEnabled: boolean = false;

  private updateDebugSetting() {
    const cfg = vscode.workspace.getConfiguration('nugetPackageManager.logging');
    this.debugEnabled = !!cfg.get<boolean>('debug', false);
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
