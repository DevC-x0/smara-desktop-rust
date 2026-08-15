// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { listDesktopBuiltinTools, runDesktopBuiltinTool } from './desktop-tools';

describe('desktop built-in tools client', () => {
  afterEach(() => {
    delete window.__SMARA_E2E_TAURI__;
  });

  it('uses the native Tauri catalog command', async () => {
    const invoke = vi.fn().mockResolvedValue([
      {
        name: 'read_file',
        description: 'Read file',
        risk_level: 'safe-readonly',
        requires_approval: false,
      },
    ]);
    window.__SMARA_E2E_TAURI__ = { invoke };

    const tools = await listDesktopBuiltinTools();

    expect(tools[0]?.name).toBe('read_file');
    expect(invoke).toHaveBeenCalledWith('list_desktop_builtin_tools', undefined);
  });

  it('passes workspace-scoped requests to the native executor', async () => {
    const invoke = vi.fn().mockResolvedValue({
      tool: 'read_file',
      workspace_root: '/tmp/project',
      output: 'hello',
      mutated: false,
    });
    window.__SMARA_E2E_TAURI__ = { invoke };
    const request = {
      tool: 'read_file',
      workspace_root: '/tmp/project',
      args: { path: 'README.md' },
    };

    const result = await runDesktopBuiltinTool(request);

    expect(result.output).toBe('hello');
    expect(invoke).toHaveBeenCalledWith('run_desktop_builtin_tool', { request });
  });
});
