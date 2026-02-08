/**
 * Handler Registry — Centralized registration of all webview message handlers.
 *
 * Exports all handlers and provides a factory function to create and register them
 * with the mediator.
 */

import type { IMessageHandler } from '../mediator/webviewMessageMediator';
import type { IVsCodeRuntime } from '../../core/vscodeRuntime';
import { WebviewReadyHandler } from './webviewReadyHandler';
import { GetPackageSourcesHandler } from './getPackageSourcesHandler';
import { SearchHandler } from './searchHandler';
import { LoadMoreHandler } from './loadMoreHandler';
import { PackageDetailsHandler } from './packageDetailsHandler';
import { GetProjectsHandler } from './getProjectsHandler';
import { RefreshProjectCacheHandler } from './refreshProjectCacheHandler';
import { InstallPackageHandler } from './installPackageHandler';
import { UninstallPackageHandler } from './uninstallPackageHandler';

// Export all handlers for direct usage
export {
  WebviewReadyHandler,
  GetPackageSourcesHandler,
  SearchHandler,
  LoadMoreHandler,
  PackageDetailsHandler,
  GetProjectsHandler,
  RefreshProjectCacheHandler,
  InstallPackageHandler,
  UninstallPackageHandler,
};

/**
 * Create all message handlers for the package browser webview.
 * Returns an array of handler instances ready for registration with the mediator.
 *
 * @param runtime - VS Code runtime adapter for handlers that need workspace access
 * @returns Array of all message handler instances
 */
export function createAllHandlers(runtime: IVsCodeRuntime): IMessageHandler[] {
  return [
    new WebviewReadyHandler(runtime),
    new GetPackageSourcesHandler(runtime),
    new SearchHandler(),
    new LoadMoreHandler(),
    new PackageDetailsHandler(),
    new GetProjectsHandler(runtime),
    new RefreshProjectCacheHandler(),
    new InstallPackageHandler(runtime),
    new UninstallPackageHandler(runtime),
  ];
}
