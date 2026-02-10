import type { PackageSourceProvider } from '../../domain/models/nugetApiOptions';
import type { IServiceIndexResolutionStrategy } from './IServiceIndexResolutionStrategy';
import { NuGetOrgStrategy } from './NuGetOrgStrategy';
import { ArtifactoryStrategy } from './ArtifactoryStrategy';
import { AzureArtifactsStrategy } from './AzureArtifactsStrategy';
import { GitHubStrategy } from './GitHubStrategy';
import { MyGetStrategy } from './MyGetStrategy';
import { DefaultStrategy } from './DefaultStrategy';

/**
 * Factory for creating provider-specific resolution strategies.
 *
 * Applies Factory Pattern to encapsulate strategy instantiation.
 * Strategies are registered at initialization and selected based
 * on PackageSourceProvider type.
 *
 * Design benefits:
 * - Open/Closed: Register new strategies without modifying factory
 * - Single Responsibility: Factory only handles instantiation
 * - Dependency Inversion: Depends on IServiceIndexResolutionStrategy abstraction
 *
 * @example
 * ```typescript
 * const factory = new ProviderStrategyFactory();
 * const strategy = factory.getStrategy('artifactory');
 * const result = await strategy.resolve(context);
 * ```
 *
 * @example
 * ```typescript
 * // Custom strategy registration
 * const factory = new ProviderStrategyFactory();
 * factory.register(new MyCustomStrategy());
 * ```
 */
export class ProviderStrategyFactory {
  private readonly strategies = new Map<PackageSourceProvider, IServiceIndexResolutionStrategy>();

  constructor() {
    // Register default strategies
    this.register(new NuGetOrgStrategy());
    this.register(new ArtifactoryStrategy());
    this.register(new AzureArtifactsStrategy());
    this.register(new GitHubStrategy());
    this.register(new MyGetStrategy());
    this.register(new DefaultStrategy());
  }

  /**
   * Register a custom strategy (for extensibility).
   *
   * Allows users to override default strategies or add support for
   * new providers without modifying core code.
   *
   * @param strategy - Strategy implementation to register
   */
  register(strategy: IServiceIndexResolutionStrategy): void {
    this.strategies.set(strategy.provider, strategy);
  }

  /**
   * Get strategy for a provider type.
   * Falls back to DefaultStrategy if provider not found.
   *
   * @param provider - Package source provider type
   * @returns Strategy instance for the provider
   */
  getStrategy(provider: PackageSourceProvider): IServiceIndexResolutionStrategy {
    return this.strategies.get(provider) ?? this.strategies.get('custom')!;
  }

  /**
   * Check if a strategy is registered for a provider.
   *
   * @param provider - Package source provider type
   * @returns True if strategy is registered
   */
  hasStrategy(provider: PackageSourceProvider): boolean {
    return this.strategies.has(provider);
  }

  /**
   * Get all registered provider types.
   *
   * @returns Array of registered provider types
   */
  getRegisteredProviders(): PackageSourceProvider[] {
    return Array.from(this.strategies.keys());
  }
}
