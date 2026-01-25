import { describe, it, expect, mock } from 'bun:test';
import { PackageBrowserCommand, type IWindow } from '../packageBrowserCommand';

// Mock window
const mockWindow: IWindow = {
  showErrorMessage: mock(() => {}),
};

describe('PackageBrowserCommand', () => {
  it('should have correct command ID', () => {
    expect(PackageBrowserCommand.id).toBe('opm.openPackageBrowser');
  });

  it('should create command instance', () => {
    const mockContext = {
      subscriptions: [],
      extensionUri: { fsPath: '/test' } as any,
    } as any;

    const mockLogger = {
      info: mock(() => {}),
      debug: mock(() => {}),
      error: mock(() => {}),
      warn: mock(() => {}),
      show: mock(() => {}),
      isDebugEnabled: mock(() => false),
      dispose: mock(() => {}),
    };

    const mockNugetClient = {
      searchPackages: mock(() => Promise.resolve({ success: true, result: [] })),
      getPackageMetadata: mock(() => Promise.resolve({ success: true, result: {} as any })),
    } as any;

    const mockProjectParser = {
      parseProject: mock(() => Promise.resolve({ success: true, metadata: {} as any })),
      parseProjects: mock(() => Promise.resolve(new Map())),
    } as any;

    const command = new PackageBrowserCommand(mockContext, mockLogger, mockNugetClient, mockProjectParser, mockWindow);

    expect(command).toBeDefined();
    expect(typeof command.execute).toBe('function');
  });
});
