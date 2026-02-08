import * as vscode from 'vscode';
import { ServiceContainer } from './infrastructure/serviceContainer';
import { NodeServiceFactory } from './env/node/nodeServiceFactory';

/**
 * Extension activation entry point.
 * Initializes service container and registers commands.
 */
export async function activate(context: vscode.ExtensionContext) {
  // Create service container with production factory
  const container = new ServiceContainer(new NodeServiceFactory(), context);

  // Initialize all services
  await container.initialize();

  // Register all commands
  container.registerCommands();

  // Register container for disposal
  context.subscriptions.push(container);

  const logger = container.getService('logger');
  logger.info('OPM extension activated successfully');
}

/**
 * Extension deactivation entry point.
 * Cleanup is handled automatically via container disposal.
 */
export function deactivate() {
  // Container disposal is automatic via context.subscriptions
}
