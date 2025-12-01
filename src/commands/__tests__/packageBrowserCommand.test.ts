import { describe, it, expect, mock } from 'bun:test';
import { PackageBrowserCommand } from '../packageBrowserCommand';

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

    const command = new PackageBrowserCommand(mockContext, mockLogger);

    expect(command).toBeDefined();
    expect(typeof command.execute).toBe('function');
  });
});
