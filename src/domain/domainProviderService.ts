import type { DomainProvider } from './domainProvider';

export class DomainProviderService {
  private provider: DomainProvider | undefined;

  constructor() {
    // minimal stub: no provider registered
  }

  register(provider: DomainProvider) {
    this.provider = provider;
  }

  getItems(repositoryPath: string) {
    if (!this.provider) return Promise.resolve({ success: false, error: { code: 'NotARepo', message: 'No provider' } });
    return this.provider.getItems(repositoryPath);
  }

  getRefs(repositoryPath: string) {
    if (!this.provider) return Promise.resolve({ success: false, error: { code: 'NotARepo', message: 'No provider' } });
    return this.provider.getRefs(repositoryPath);
  }
}
