/**
 * Infrastructure Layer Exports
 *
 * Service Container and Factory patterns for dependency injection.
 */

export { ServiceContainer } from './serviceContainer';
export type { ServiceId, ServiceTypeMap } from './serviceContainer';
export type { IServiceFactory } from './serviceFactory';
export { TestServiceFactory } from './testServiceFactory';
