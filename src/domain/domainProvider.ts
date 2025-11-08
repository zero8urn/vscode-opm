export type DomainError =
  | { code: 'NotARepo'; message: string }
  | { code: 'Auth'; message: string; details?: any }
  | { code: 'Exec'; message: string; details?: string };

export type DomainResult<T> =
  | { success: true; result: T }
  | { success: false; error: DomainError };

export interface DomainProvider {
  getItems(repositoryPath: string, options?: { max?: number }): Promise<DomainResult<any[]>>;
  getRefs(repositoryPath: string): Promise<DomainResult<any[]>>;
}
