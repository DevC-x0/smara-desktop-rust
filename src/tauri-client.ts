import { convertFileSrc, invoke as tauriInvoke } from '@tauri-apps/api/core';
import { listen as tauriListen } from '@tauri-apps/api/event';
import { open as tauriOpenDialog, save as tauriSaveDialog, type OpenDialogOptions, type SaveDialogOptions } from '@tauri-apps/plugin-dialog';

type TauriEvent<T> = { payload: T };
type UnlistenFn = () => void;
type ListenHandler<T> = (event: TauriEvent<T>) => void;

declare global {
  interface Window {
    __SMARA_DESKTOP_COMMANDS__?: string[];
    __SMARA_CHAT_SESSIONS__?: unknown[];
    __SMARA_MEMORIES__?: Array<{ id: string; content: string; tags: string[]; created_at_ms: number; updated_at_ms: number }>;
    __SMARA_SKILLS__?: unknown[];
    __SMARA_WORKFLOWS__?: unknown[];
    __SMARA_MCP_SERVERS__?: unknown[];
    __SMARA_GRAPHIFY__?: unknown;
    __SMARA_MEDIA__?: unknown[];
    __SMARA_E2E_EVENT_HANDLERS__?: Record<string, Array<ListenHandler<unknown>>>;
    __SMARA_E2E_TAURI__?: {
      invoke?: <T>(command: string, args?: unknown) => Promise<T>;
      listen?: <T>(event: string, handler: ListenHandler<T>) => Promise<UnlistenFn>;
      dialog?: {
        save?: (options?: SaveDialogOptions) => Promise<string | null>;
        open?: (options?: OpenDialogOptions) => Promise<string | string[] | null>;
      };
    };
  }
}

export function invokeCommand<T>(command: string, args?: unknown): Promise<T> {
  const mockInvoke = window.__SMARA_E2E_TAURI__?.invoke;
  if (mockInvoke) return mockInvoke<T>(command, args);
  return tauriInvoke<T>(command, args as Record<string, unknown> | undefined);
}

export function listenCommand<T>(event: string, handler: ListenHandler<T>): Promise<UnlistenFn> {
  const mockListen = window.__SMARA_E2E_TAURI__?.listen;
  if (mockListen) return mockListen<T>(event, handler);
  return tauriListen<T>(event, handler);
}

export function saveDialog(options?: SaveDialogOptions): Promise<string | null> {
  const mockSave = window.__SMARA_E2E_TAURI__?.dialog?.save;
  if (mockSave) return mockSave(options);
  return tauriSaveDialog(options);
}

export function openDialog(options?: OpenDialogOptions): Promise<string | string[] | null> {
  const mockOpen = window.__SMARA_E2E_TAURI__?.dialog?.open;
  if (mockOpen) return mockOpen(options);
  return tauriOpenDialog(options);
}

export function fileAssetUrl(path: string): string {
  if (window.__SMARA_E2E_TAURI__) return path;
  return convertFileSrc(path);
}
