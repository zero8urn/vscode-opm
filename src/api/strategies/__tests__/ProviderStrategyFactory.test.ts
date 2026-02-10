import { describe, test, expect, mock } from 'bun:test';
import { ProviderStrategyFactory } from '../ProviderStrategyFactory';
import { NuGetOrgStrategy } from '../NuGetOrgStrategy';
import { ArtifactoryStrategy } from '../ArtifactoryStrategy';
import { AzureArtifactsStrategy } from '../AzureArtifactsStrategy';
import { GitHubStrategy } from '../GitHubStrategy';
import { MyGetStrategy } from '../MyGetStrategy';
import { DefaultStrategy } from '../DefaultStrategy';

describe('ProviderStrategyFactory', () => {
  test('registers all default strategies on construction', () => {
    const factory = new ProviderStrategyFactory();

    expect(factory.hasStrategy('nuget.org')).toBe(true);
    expect(factory.hasStrategy('artifactory')).toBe(true);
    expect(factory.hasStrategy('azure-artifacts')).toBe(true);
    expect(factory.hasStrategy('github')).toBe(true);
    expect(factory.hasStrategy('myget')).toBe(true);
    expect(factory.hasStrategy('custom')).toBe(true);
  });

  test('returns correct strategy for nuget.org', () => {
    const factory = new ProviderStrategyFactory();
    const strategy = factory.getStrategy('nuget.org');

    expect(strategy).toBeInstanceOf(NuGetOrgStrategy);
    expect(strategy.provider).toBe('nuget.org');
  });

  test('returns correct strategy for artifactory', () => {
    const factory = new ProviderStrategyFactory();
    const strategy = factory.getStrategy('artifactory');

    expect(strategy).toBeInstanceOf(ArtifactoryStrategy);
    expect(strategy.provider).toBe('artifactory');
  });

  test('returns correct strategy for azure-artifacts', () => {
    const factory = new ProviderStrategyFactory();
    const strategy = factory.getStrategy('azure-artifacts');

    expect(strategy).toBeInstanceOf(AzureArtifactsStrategy);
    expect(strategy.provider).toBe('azure-artifacts');
  });

  test('returns correct strategy for github', () => {
    const factory = new ProviderStrategyFactory();
    const strategy = factory.getStrategy('github');

    expect(strategy).toBeInstanceOf(GitHubStrategy);
    expect(strategy.provider).toBe('github');
  });

  test('returns correct strategy for myget', () => {
    const factory = new ProviderStrategyFactory();
    const strategy = factory.getStrategy('myget');

    expect(strategy).toBeInstanceOf(MyGetStrategy);
    expect(strategy.provider).toBe('myget');
  });

  test('returns default strategy for custom provider', () => {
    const factory = new ProviderStrategyFactory();
    const strategy = factory.getStrategy('custom');

    expect(strategy).toBeInstanceOf(DefaultStrategy);
    expect(strategy.provider).toBe('custom');
  });

  test('returns default strategy for unknown provider', () => {
    const factory = new ProviderStrategyFactory();
    // @ts-expect-error - testing fallback for unknown provider
    const strategy = factory.getStrategy('unknown-provider');

    expect(strategy).toBeInstanceOf(DefaultStrategy);
    expect(strategy.provider).toBe('custom');
  });

  test('allows registering custom strategy', () => {
    const factory = new ProviderStrategyFactory();
    const customStrategy = new DefaultStrategy();

    factory.register(customStrategy);

    expect(factory.hasStrategy('custom')).toBe(true);
    const retrieved = factory.getStrategy('custom');
    expect(retrieved).toBe(customStrategy);
  });

  test('getRegisteredProviders returns all provider types', () => {
    const factory = new ProviderStrategyFactory();
    const providers = factory.getRegisteredProviders();

    expect(providers).toContain('nuget.org');
    expect(providers).toContain('artifactory');
    expect(providers).toContain('azure-artifacts');
    expect(providers).toContain('github');
    expect(providers).toContain('myget');
    expect(providers).toContain('custom');
    expect(providers.length).toBe(6);
  });

  test('overrides existing strategy when registered again', () => {
    const factory = new ProviderStrategyFactory();
    const customArtifactory = new ArtifactoryStrategy();

    factory.register(customArtifactory);

    const retrieved = factory.getStrategy('artifactory');
    expect(retrieved).toBe(customArtifactory);
  });
});
