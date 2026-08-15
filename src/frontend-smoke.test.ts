import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

const requiredDomIds = [
  'launcher-title',
  'launcher-status',
  'launcher-progress',
  'launcher-error',
  'launcher-error-message',
  'native-runtime',
  'native-runtime-summary',
  'native-capabilities',
  'provider-health',
  'provider-indicator',
  'provider-name',
  'provider-state',
  'provider-detail',
  'provider-select',
  'provider-model-input',
  'provider-endpoint-input',
  'save-provider-button',
  'refresh-provider-button',
  'chat-session-select',
  'sidebar-new-chat-button',
  'sidebar-chat-session-list',
  'chat-messages',
  'chat-form',
  'chat-attachments',
  'attach-chat-button',
  'chat-file-input',
  'chat-input',
  'send-chat-button',
  'new-chat-button',
  'retry-chat-button',
  'cancel-chat-stream-button',
  'delete-chat-button',
  'chat-status',
  'chat-memory-context',
  'memory-form',
  'memory-input',
  'memory-tags-input',
  'save-memory-button',
  'cancel-memory-edit-button',
  'memory-search-input',
  'memory-search-mode',
  'memory-list',
  'memory-count',
  'memory-status',
  'skill-form',
  'skill-name-input',
  'skill-steps-input',
  'save-skill-button',
  'clear-skill-button',
  'skill-workspace-input',
  'skill-params-input',
  'skill-list',
  'skill-output',
  'skill-count',
  'skill-status',
  'skill-approval-panel',
  'skill-approval-summary',
  'skill-approval-preview',
  'skill-approval-checkbox',
  'approve-skill-button',
  'cancel-skill-approval-button',
  'workflow-form',
  'workflow-name-input',
  'workflow-description-input',
  'workflow-steps-input',
  'save-workflow-button',
  'clear-workflow-button',
  'workflow-workspace-input',
  'workflow-params-input',
  'workflow-list',
  'workflow-output',
  'workflow-count',
  'workflow-status',
  'workflow-approval-panel',
  'workflow-approval-summary',
  'workflow-approval-preview',
  'workflow-approval-checkbox',
  'approve-workflow-button',
  'cancel-workflow-approval-button',
  'mcp-form',
  'mcp-name-input',
  'mcp-command-input',
  'mcp-args-input',
  'mcp-env-input',
  'save-mcp-button',
  'clear-mcp-button',
  'mcp-list',
  'mcp-count',
  'mcp-status',
  'mcp-tool-input',
  'mcp-tool-args-input',
  'call-mcp-tool-button',
  'mcp-output',
  'graphify-form',
  'graphify-workspace-input',
  'graphify-max-files-input',
  'build-graphify-button',
  'load-graphify-button',
  'graphify-search-input',
  'graphify-summary',
  'graphify-canvas',
  'graphify-node-list',
  'graphify-output',
  'graphify-count',
  'graphify-status',
  'media-form',
  'media-path-input',
  'media-title-input',
  'media-tags-input',
  'media-copy-checkbox',
  'import-media-button',
  'clear-media-button',
  'media-search-input',
  'media-preview',
  'media-list',
  'media-output',
  'media-count',
  'media-status',
  'settings-section',
];

describe('desktop launcher DOM contract', () => {
  it('keeps the stable launcher controls', () => {
    const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
    const dom = new JSDOM(html);

    for (const id of requiredDomIds) {
      expect(dom.window.document.getElementById(id), `#${id}`).not.toBeNull();
    }
  });

  it('explains the standalone native feature surface', () => {
    const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
    expect(html).toContain('Standalone Rust');
    expect(html).toContain('Built-in Tools');
    expect(html).toContain('Chat');
    expect(html).toContain('Memory');
    expect(html).toContain('Skills');
    expect(html).toContain('Workflow');
    expect(html).toContain('MCP');
    expect(html).toContain('Graphify');
    expect(html).toContain('Media');
    expect(html).toContain('Settings');
    expect(html).not.toContain('smara web');
    expect(html).not.toContain('legacy');
  });
});
