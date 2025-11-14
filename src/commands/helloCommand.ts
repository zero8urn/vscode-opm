import * as vscode from 'vscode';
import { DomainProviderService } from '../domain/domainProviderService';

export class HelloCommand {
  static id = 'dpm.hello';
  constructor(private domainService: DomainProviderService) {}

  async execute(name?: string) {
    const who = name ?? 'world';
    const message = `Hello, ${who}!`;
    // lightweight delegation example
    vscode.window.showInformationMessage(message);
    return message;
  }
}
