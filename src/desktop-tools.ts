import { invokeCommand } from './tauri-client';

export interface DesktopBuiltinTool {
  name: string;
  description: string;
  risk_level: string;
  requires_approval: boolean;
}

export interface DesktopToolApproval {
  action: string;
  approved: boolean;
  approved_at_ms: number;
  summary: string;
}

export interface DesktopBuiltinToolRequest {
  tool: string;
  workspace_root: string;
  args?: Record<string, unknown>;
  approval?: DesktopToolApproval;
}

export interface DesktopBuiltinToolResult {
  tool: string;
  workspace_root: string;
  output: string;
  mutated: boolean;
}

export function listDesktopBuiltinTools(): Promise<DesktopBuiltinTool[]> {
  return invokeCommand<DesktopBuiltinTool[]>('list_desktop_builtin_tools');
}

export function runDesktopBuiltinTool(
  request: DesktopBuiltinToolRequest,
): Promise<DesktopBuiltinToolResult> {
  return invokeCommand<DesktopBuiltinToolResult>('run_desktop_builtin_tool', { request });
}
