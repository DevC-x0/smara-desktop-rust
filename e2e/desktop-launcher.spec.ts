import { expect, test } from '@playwright/test';

async function installMockTauri(
  page: import('@playwright/test').Page,
  providerOnline = true,
) {
  await page.addInitScript(({ providerOnline }) => {
    window.__SMARA_CHAT_SESSIONS__ = [];
    window.__SMARA_MEMORIES__ = [];
    window.__SMARA_WORKSPACES__ = [{ name: 'default', path: null, created_at_ms: Date.now() }];
    window.__SMARA_ACTIVE_WORKSPACE__ = 'default';
    window.__SMARA_SKILLS__ = [];
    window.__SMARA_WORKFLOWS__ = [];
    window.__SMARA_MCP_SERVERS__ = [];
    window.__SMARA_GRAPHIFY__ = null;
    window.__SMARA_MEDIA__ = [];
    window.__SMARA_CANCELLED_CHAT_STREAMS__ = new Set();
    window.__SMARA_E2E_EVENT_HANDLERS__ = {};
    window.__SMARA_E2E_TAURI__ = {
      async listen(event, handler) {
        window.__SMARA_E2E_EVENT_HANDLERS__[event] = [
          ...(window.__SMARA_E2E_EVENT_HANDLERS__[event] ?? []),
          handler,
        ];
        return () => {};
      },
      async invoke(command, args) {
        window.__SMARA_DESKTOP_COMMANDS__ = [
          ...(window.__SMARA_DESKTOP_COMMANDS__ ?? []),
          command,
        ];
        if (command === 'get_desktop_runtime_status') {
          return {
            ready: true,
            mode: 'rust-native',
            version: '0.3.0',
            uptime_ms: 2,
            native_ready: 14,
            migration_total: 14,
            capabilities: [
              { id: 'runtime', label: 'Application runtime', backend: 'rust', ready: true },
              { id: 'builtin-tools', label: 'Built-in workspace tools', backend: 'rust', ready: true },
              { id: 'chat', label: 'Chat sessions and provider completion', backend: 'rust', ready: true },
              { id: 'memory', label: 'Local memory store', backend: 'rust', ready: true },
              { id: 'skills', label: 'Reusable approval-gated skills', backend: 'rust', ready: true },
              { id: 'workflow', label: 'Approval-gated workflows', backend: 'rust', ready: true },
              { id: 'mcp', label: 'MCP stdio client', backend: 'rust', ready: true },
              { id: 'graphify', label: 'Local knowledge graph', backend: 'rust', ready: true },
              { id: 'media', label: 'Local media library', backend: 'rust', ready: true },
            ],
          };
        }
        if (command === 'check_desktop_provider_health') {
          return {
            provider: 'custom',
            model: 'test-model',
            endpoint: 'http://127.0.0.1:20128/v1',
            online: providerOnline,
            latency_ms: providerOnline ? 3 : 0,
            error: providerOnline ? undefined : 'connection refused',
          };
        }
        if (command === 'get_desktop_provider_config') {
          return {
            provider: 'custom',
            model: 'test-model',
            endpoint: 'http://127.0.0.1:20128/v1',
          };
        }
        if (command === 'save_desktop_provider_config') {
          return args.config;
        }
        if (command === 'list_desktop_chat_sessions') {
          return window.__SMARA_CHAT_SESSIONS__;
        }
        if (command === 'send_desktop_chat') {
          const timestamp = Date.now();
          const session = {
            id: args.request.session_id || `chat-${timestamp}`,
            title: args.request.message,
            created_at_ms: timestamp,
            updated_at_ms: timestamp,
            messages: [
              { id: 'user-1', role: 'user', content: args.request.message, attachments: args.request.attachments ?? [], created_at_ms: timestamp },
              { id: 'assistant-1', role: 'assistant', content: 'native mock reply', created_at_ms: timestamp },
            ],
            memory_context_count: window.__SMARA_MEMORIES__.length ? 1 : 0,
          };
          window.__SMARA_CHAT_SESSIONS__ = [
            session,
            ...window.__SMARA_CHAT_SESSIONS__.filter((item) => item.id !== session.id),
          ];
          return session;
        }
        if (command === 'stream_desktop_chat') {
          const timestamp = Date.now();
          const requestId = args.request.request_id;
          const existing = window.__SMARA_CHAT_SESSIONS__.find((session) => session.id === args.request.session_id);
          if (args.request.message.includes('cancel')) {
            await new Promise((resolve) => setTimeout(resolve, 600));
          }
          for (const handler of window.__SMARA_E2E_EVENT_HANDLERS__['desktop-chat-stream'] ?? []) {
            handler({ payload: { request_id: requestId, kind: 'thinking', delta: 'Mock thinking' } });
            handler({ payload: { request_id: requestId, kind: 'analysis', delta: 'Mock analysis' } });
            handler({ payload: { request_id: requestId, kind: 'tool_start', delta: 'Provider call: mock' } });
          }
          for (const delta of ['native ', 'streaming reply']) {
            if (window.__SMARA_CANCELLED_CHAT_STREAMS__.has(requestId)) {
              throw new Error('Streaming Chat request was cancelled.');
            }
            for (const handler of window.__SMARA_E2E_EVENT_HANDLERS__['desktop-chat-stream'] ?? []) {
              handler({ payload: { request_id: requestId, kind: 'delta', delta } });
            }
            await new Promise((resolve) => setTimeout(resolve, 15));
          }
          for (const handler of window.__SMARA_E2E_EVENT_HANDLERS__['desktop-chat-stream'] ?? []) {
            handler({ payload: { request_id: requestId, kind: 'tool_done', delta: 'Provider stream done' } });
          }
          const session = {
            id: existing?.id || `chat-${timestamp}`,
            title: existing?.title || args.request.message,
            workspace: args.request.workspace || existing?.workspace || window.__SMARA_ACTIVE_WORKSPACE__ || 'default',
            created_at_ms: existing?.created_at_ms || timestamp,
            updated_at_ms: timestamp,
            messages: [
              ...(existing?.messages ?? []),
              { id: 'user-stream', role: 'user', content: args.request.message, attachments: args.request.attachments ?? [], created_at_ms: timestamp },
              {
                id: 'assistant-stream',
                role: 'assistant',
                content: 'native streaming reply',
                processes: [
                  { kind: 'thinking', text: 'Mock thinking', created_at: timestamp },
                  { kind: 'analysis', text: 'Mock analysis', created_at: timestamp },
                  { kind: 'tool_start', text: 'Provider call: mock', created_at: timestamp },
                  { kind: 'tool_done', text: 'Provider stream done', created_at: timestamp },
                  { kind: 'complete', text: 'Respons selesai dan tersimpan di sesi lokal.', created_at: timestamp },
                ],
                created_at_ms: timestamp,
              },
            ],
            memory_context_count: window.__SMARA_MEMORIES__.length ? 1 : 0,
          };
          window.__SMARA_CHAT_SESSIONS__ = [
            session,
            ...window.__SMARA_CHAT_SESSIONS__.filter((item) => item.id !== session.id),
          ];
          return session;
        }
        if (command === 'cancel_desktop_chat_stream') {
          window.__SMARA_CANCELLED_CHAT_STREAMS__.add(args.requestId || args.request_id);
          return true;
        }
        if (command === 'delete_desktop_chat_session') {
          window.__SMARA_CHAT_SESSIONS__ = window.__SMARA_CHAT_SESSIONS__.filter((session) => session.id !== args.id);
          return true;
        }
        if (command === 'move_desktop_chat_session_workspace') {
          const session = window.__SMARA_CHAT_SESSIONS__.find((s) => s.id === args.sessionId);
          if (session) {
            session.workspace = args.targetWorkspace || undefined;
          }
          return session;
        }
        if (command === 'get_desktop_workspaces') {
          return {
            active: window.__SMARA_ACTIVE_WORKSPACE__ || 'default',
            workspaces: window.__SMARA_WORKSPACES__ || [{ name: 'default', path: null, created_at_ms: Date.now() }],
          };
        }
        if (command === 'create_desktop_workspace') {
          const ws = { name: args.name, path: args.path, created_at_ms: Date.now() };
          window.__SMARA_WORKSPACES__ = [...(window.__SMARA_WORKSPACES__ || [{ name: 'default', path: null, created_at_ms: Date.now() }]), ws];
          window.__SMARA_ACTIVE_WORKSPACE__ = args.name;
          return {
            active: args.name,
            workspaces: window.__SMARA_WORKSPACES__,
          };
        }
        if (command === 'delete_desktop_workspace') {
          window.__SMARA_WORKSPACES__ = (window.__SMARA_WORKSPACES__ || []).filter((w) => w.name !== args.name);
          window.__SMARA_ACTIVE_WORKSPACE__ = 'default';
          return {
            active: 'default',
            workspaces: window.__SMARA_WORKSPACES__,
          };
        }
        if (command === 'list_desktop_memories') {
          return window.__SMARA_MEMORIES__;
        }
        if (command === 'search_desktop_memories') {
          return window.__SMARA_MEMORIES__.filter((memory) =>
            memory.content.toLowerCase().includes(args.query.toLowerCase()));
        }
        if (command === 'search_desktop_memories_ranked') {
          return window.__SMARA_MEMORIES__
            .filter((memory) => memory.content.toLowerCase().includes(args.query.toLowerCase()))
            .map((memory) => ({
              memory,
              score: 0.88,
              matched_terms: [args.query.toLowerCase()],
              match_kind: 'semantic',
            }));
        }
        if (command === 'create_desktop_memory') {
          const memory = {
            id: `memory-${Date.now()}`,
            content: args.request.content,
            tags: args.request.tags,
            created_at_ms: Date.now(),
            updated_at_ms: Date.now(),
          };
          window.__SMARA_MEMORIES__ = [memory, ...window.__SMARA_MEMORIES__];
          return memory;
        }
        if (command === 'update_desktop_memory') {
          const existing = window.__SMARA_MEMORIES__.find((memory) => memory.id === args.request.id);
          const memory = {
            ...existing,
            ...args.request,
            updated_at_ms: Date.now(),
          };
          window.__SMARA_MEMORIES__ = [memory, ...window.__SMARA_MEMORIES__.filter((item) => item.id !== memory.id)];
          return memory;
        }
        if (command === 'delete_desktop_memory') {
          window.__SMARA_MEMORIES__ = window.__SMARA_MEMORIES__.filter((memory) => memory.id !== args.id);
          return true;
        }
        if (command === 'list_desktop_skills') {
          return window.__SMARA_SKILLS__;
        }
        if (command === 'save_desktop_skill') {
          const existing = window.__SMARA_SKILLS__.find((skill) => skill.name === args.request.name);
          const skill = {
            ...args.request,
            version: existing ? existing.version + 1 : 1,
            created_at_ms: existing?.created_at_ms ?? Date.now(),
            updated_at_ms: Date.now(),
          };
          window.__SMARA_SKILLS__ = [skill, ...window.__SMARA_SKILLS__.filter((item) => item.name !== skill.name)];
          return skill;
        }
        if (command === 'preview_desktop_skill') {
          const skill = window.__SMARA_SKILLS__.find((item) => item.name === args.request.name);
          const steps = skill.steps.map((step, index) => ({
            index: index + 1,
            tool: step.tool,
            args: step.args,
            risk_level: ['write_file', 'edit_file', 'delete_file'].includes(step.tool)
              ? 'workspace-mutation'
              : 'safe-readonly',
            requires_approval: ['write_file', 'edit_file', 'delete_file'].includes(step.tool),
          }));
          return {
            skill_name: skill.name,
            workspace_root: args.request.workspace_root,
            requires_approval: steps.some((step) => step.requires_approval),
            mutation_count: steps.filter((step) => step.requires_approval).length,
            steps,
          };
        }
        if (command === 'run_desktop_skill') {
          const skill = window.__SMARA_SKILLS__.find((item) => item.name === args.request.name);
          const mutating = skill.steps.some((step) => ['write_file', 'edit_file', 'delete_file'].includes(step.tool));
          if (mutating && !args.request.approval?.approved) {
            throw new Error('Skill requires explicit approval.');
          }
          return {
            skill_name: args.request.name,
            success: true,
            summary: `Completed 1 Desktop skill step(s), including ${mutating ? 1 : 0} workspace mutation(s).`,
            outputs: [{
              tool: skill.steps[0].tool,
              output: mutating ? 'Wrote approved.txt' : 'Files: 42',
              mutated: mutating,
            }],
          };
        }
        if (command === 'delete_desktop_skill') {
          window.__SMARA_SKILLS__ = window.__SMARA_SKILLS__.filter((skill) => skill.name !== args.name);
          return true;
        }
        if (command === 'list_desktop_workflows') {
          return window.__SMARA_WORKFLOWS__;
        }
        if (command === 'save_desktop_workflow') {
          const existing = window.__SMARA_WORKFLOWS__.find((workflow) => workflow.name === args.request.name);
          const workflow = {
            ...args.request,
            version: existing ? existing.version + 1 : 1,
            created_at_ms: existing?.created_at_ms ?? Date.now(),
            updated_at_ms: Date.now(),
          };
          window.__SMARA_WORKFLOWS__ = [workflow, ...window.__SMARA_WORKFLOWS__.filter((item) => item.name !== workflow.name)];
          return workflow;
        }
        if (command === 'preview_desktop_workflow') {
          const workflow = window.__SMARA_WORKFLOWS__.find((item) => item.name === args.request.name);
          const steps = workflow.steps.map((step, index) => ({
            ...step,
            index: index + 1,
            risk_level: step.kind === 'mcp' ? 'external-mcp' : 'safe-readonly',
            requires_approval: step.kind === 'mcp',
          }));
          return {
            workflow_name: workflow.name,
            workspace_root: args.request.workspace_root,
            requires_approval: steps.some((step) => step.requires_approval),
            risky_step_count: steps.filter((step) => step.requires_approval).length,
            steps,
          };
        }
        if (command === 'run_desktop_workflow') {
          const workflow = window.__SMARA_WORKFLOWS__.find((item) => item.name === args.request.name);
          const risky = workflow.steps.some((step) => step.kind === 'mcp');
          if (risky && !args.request.approval?.approved) throw new Error('Workflow requires explicit approval.');
          return {
            workflow_name: workflow.name,
            success: true,
            summary: `Completed ${workflow.steps.length} Desktop workflow step(s).`,
            outputs: workflow.steps.map((step, index) => ({
              index: index + 1,
              kind: step.kind,
              target: step.target,
              output: step.kind === 'mcp' ? 'MCP workflow output' : 'Files: 42',
              mutated: step.kind === 'mcp',
            })),
          };
        }
        if (command === 'delete_desktop_workflow') {
          window.__SMARA_WORKFLOWS__ = window.__SMARA_WORKFLOWS__.filter((workflow) => workflow.name !== args.name);
          return true;
        }
        if (command === 'list_desktop_mcp_servers') {
          return window.__SMARA_MCP_SERVERS__;
        }
        if (command === 'save_desktop_mcp_server') {
          const server = { ...args.request, created_at_ms: Date.now(), updated_at_ms: Date.now() };
          window.__SMARA_MCP_SERVERS__ = [server, ...window.__SMARA_MCP_SERVERS__.filter((item) => item.name !== server.name)];
          return server;
        }
        if (command === 'check_desktop_mcp_server') {
          return {
            server_name: args.name,
            online: true,
            latency_ms: 4,
            protocol_version: '2025-03-26',
            tools: [{ name: 'echo', description: 'Echo text', input_schema: { type: 'object' } }],
          };
        }
        if (command === 'call_desktop_mcp_tool') {
          return { server_name: args.request.server_name, tool: args.request.tool, content: [{ text: 'MCP echo result' }], is_error: false };
        }
        if (command === 'delete_desktop_mcp_server') {
          window.__SMARA_MCP_SERVERS__ = window.__SMARA_MCP_SERVERS__.filter((server) => server.name !== args.name);
          return true;
        }
        if (command === 'get_desktop_graphify') {
          return window.__SMARA_GRAPHIFY__;
        }
        if (command === 'build_desktop_graphify') {
          const graph = {
            workspace_root: args.request.workspace_root,
            generated_at_ms: Date.now(),
            file_count: 2,
            node_count: 4,
            edge_count: 3,
            nodes: [
              { id: 'file:src/main.ts:src/main.ts', label: 'src/main.ts', kind: 'file', path: 'src/main.ts', weight: 3 },
              { id: 'function:src/main.ts:startDesktop', label: 'startDesktop', kind: 'function', path: 'src/main.ts', weight: 2 },
              { id: 'concept::graphify', label: 'graphify', kind: 'concept', path: '', weight: 2 },
              { id: 'concept::workflow', label: 'workflow', kind: 'concept', path: '', weight: 1 },
            ],
            edges: [
              { source: 'file:src/main.ts:src/main.ts', target: 'function:src/main.ts:startDesktop', relation: 'contains', evidence: 'function startDesktop', weight: 1 },
              { source: 'file:src/main.ts:src/main.ts', target: 'concept::graphify', relation: 'mentions', evidence: 'graphify', weight: 1 },
              { source: 'file:src/main.ts:src/main.ts', target: 'concept::workflow', relation: 'mentions', evidence: 'workflow', weight: 1 },
            ],
            report: 'Graphify native selesai: 2 file, 4 node, 3 edge.',
          };
          window.__SMARA_GRAPHIFY__ = graph;
          return graph;
        }
        if (command === 'search_desktop_graphify') {
          const query = args.request.query.toLowerCase();
          return (window.__SMARA_GRAPHIFY__?.nodes ?? []).filter((node) =>
            node.label.toLowerCase().includes(query) || node.kind.toLowerCase().includes(query));
        }
        if (command === 'list_desktop_media') {
          return window.__SMARA_MEDIA__;
        }
        if (command === 'import_desktop_media') {
          const fileName = args.request.path.split('/').pop();
          const asset = {
            id: `media-${Date.now()}`,
            title: args.request.title || fileName,
            kind: fileName.endsWith('.wav') ? 'audio' : 'image',
            file_name: fileName,
            mime: fileName.endsWith('.wav') ? 'audio/wav' : 'image/png',
            source_path: args.request.path,
            stored_path: args.request.copy_to_library ? `/desktop/media/${fileName}` : args.request.path,
            bytes: 42,
            checksum: 'mock-checksum',
            tags: args.request.tags,
            created_at_ms: Date.now(),
            updated_at_ms: Date.now(),
          };
          window.__SMARA_MEDIA__ = [asset, ...window.__SMARA_MEDIA__];
          return asset;
        }
        if (command === 'search_desktop_media') {
          const query = args.request.query.toLowerCase();
          return window.__SMARA_MEDIA__.filter((asset) =>
            asset.title.toLowerCase().includes(query)
            || asset.kind.toLowerCase().includes(query)
            || asset.tags.some((tag) => tag.toLowerCase().includes(query)));
        }
        if (command === 'delete_desktop_media') {
          window.__SMARA_MEDIA__ = window.__SMARA_MEDIA__.filter((asset) => asset.id !== args.id);
          return true;
        }
        if (command === 'get_workspace_file_tree') {
          return [
            {
              name: 'src',
              path: '/mock/workspace/src',
              rel_path: 'src',
              is_dir: true,
              size: 0,
              extension: null,
              children: [
                {
                  name: 'main.rs',
                  path: '/mock/workspace/src/main.rs',
                  rel_path: 'src/main.rs',
                  is_dir: false,
                  size: 1024,
                  extension: 'rs',
                  children: null,
                },
                {
                  name: 'styles.css',
                  path: '/mock/workspace/src/styles.css',
                  rel_path: 'src/styles.css',
                  is_dir: false,
                  size: 512,
                  extension: 'css',
                  children: null,
                },
              ],
            },
            {
              name: 'index.html',
              path: '/mock/workspace/index.html',
              rel_path: 'index.html',
              is_dir: false,
              size: 2048,
              extension: 'html',
              children: null,
            },
          ];
        }
        if (command === 'get_workspace_git_status') {
          return {
            is_git: true,
            branch: 'main',
            staged_count: 1,
            modified_count: 2,
            untracked_count: 0,
            summary: '🌿 main (+1 staged, ~2 modified)',
          };
        }
        if (command === 'get_workspace_git_diff') {
          return {
            is_git: true,
            branch: 'main',
            total_files: 2,
            total_additions: 5,
            total_deletions: 2,
            files: [
              {
                path: 'src/main.ts',
                status: 'modified',
                additions: 4,
                deletions: 1,
                diff: '--- a/src/main.ts\n+++ b/src/main.ts\n@@ -1,3 +1,6 @@\n+// Smara Desktop\n-console.log("old");\n+console.log("new");\n+console.log("ready");\n',
              },
              {
                path: 'src/new_feature.ts',
                status: 'added',
                additions: 1,
                deletions: 1,
                diff: '--- /dev/null\n+++ b/src/new_feature.ts\n@@ -0,0 +1 @@\n+export const ready = true;\n',
              },
            ],
          };
        }
        if (command === 'read_workspace_file') {
          return {
            path: args.path,
            content: '// Mock file content\nfn main() {\n  println!("Hello Smara");\n}\n',
            size: 48,
            is_binary: false,
          };
        }
        if (command === 'apply_code_to_file') {
          return true;
        }
        if (command === 'detect_local_llm_models') {
          return [
            {
              provider: 'ollama',
              model: 'llama3:latest',
              endpoint: 'http://localhost:11434/v1',
              details: '4.7 GB',
            },
            {
              provider: 'lmstudio',
              model: 'qwen2.5-coder-7b',
              endpoint: 'http://localhost:1234/v1',
              details: 'local-server',
            },
          ];
        }
        if (command === 'switch_desktop_provider_model') {
          window.__SMARA_PROVIDER_CONFIG__ = {
            provider: args.provider,
            model: args.model,
            endpoint: args.endpoint || 'http://localhost:11434/v1',
          };
          return window.__SMARA_PROVIDER_CONFIG__;
        }
        if (command === 'export_desktop_chat_session') {
          const session = (window.__SMARA_CHAT_SESSIONS__ || []).find((s) => s.id === args.sessionId) || {
            id: args.sessionId,
            title: 'Mock Session',
            messages: [{ role: 'user', content: 'Mock user message' }],
          };
          const fmt = args.format || 'markdown';
          let content = `# ${session.title}\n\nUser: Mock user message`;
          if (fmt === 'json') {
            content = JSON.stringify(session, null, 2);
          } else if (fmt === 'html') {
            content = `<!DOCTYPE html><html><body><h1>${session.title}</h1></body></html>`;
          }
          return {
            session_id: session.id,
            title: session.title,
            format: fmt,
            content,
            file_name: `mock_export.${fmt === 'markdown' ? 'md' : fmt}`,
          };
        }
        if (command === 'save_exported_chat') {
          return true;
        }
        throw new Error(`Unexpected standalone Desktop command: ${command}`);
      },
    };
  }, { providerOnline });
}

async function openDesktopPage(page: import('@playwright/test').Page, target: string) {
  await page.locator(`.sidebar-nav a[data-page-target="${target}"]`).click();
  await expect(page.locator(`[data-page="${target}"]`)).toBeVisible();
}

test('starts standalone Rust runtime without CLI or web backend commands', async ({ page }) => {
  await installMockTauri(page);
  await page.goto('/');

  await expect(page.locator('#native-runtime')).toBeHidden();
  await expect(page.locator('#native-runtime-summary')).toContainText('14/14 native');
  await expect(page.locator('#native-capabilities')).toContainText('Built-in workspace tools');
  await openDesktopPage(page, 'chat');
  await expect(page.locator('#chat-section')).toBeVisible();
  await openDesktopPage(page, 'settings');
  await expect(page.locator('#provider-health')).toBeVisible();
  await expect(page.locator('#provider-state')).toHaveText('online');
  await expect(page.locator('#launcher-status')).toContainText('berjalan mandiri');

  const commands = await page.evaluate(() => window.__SMARA_DESKTOP_COMMANDS__ ?? []);
  expect(commands).toContain('list_desktop_chat_sessions');
  expect(commands).toContain('list_desktop_memories');
  expect(commands).toContain('list_desktop_skills');
  expect(commands).toContain('list_desktop_workflows');
  expect(commands).toContain('list_desktop_mcp_servers');
  expect(commands).toContain('get_desktop_graphify');
  expect(commands).toContain('list_desktop_media');
  expect(commands.every((command) => !command.includes('smara_cli') && !command.includes('web_backend'))).toBe(true);
});

test('streams chat through Rust-native Desktop events', async ({ page }) => {
  await installMockTauri(page);
  await page.goto('/');
  await openDesktopPage(page, 'chat');
  await page.locator('#chat-input').fill('hello native chat');
  await page.locator('#send-chat-button').click();

  await expect(page.locator('.chat-message-user .chat-message-body')).toHaveText('hello native chat');
  await expect(page.locator('.chat-message-assistant')).toHaveText('native streaming reply');
  await expect(page.locator('#chat-status')).toContainText('Streaming selesai');
  await expect(page.locator('.chat-process')).toContainText('Mock thinking');
  await expect(page.locator('.chat-process')).toContainText('Provider call: mock');
  await expect(page.locator('.chat-process')).toContainText('Complete');
  const commands = await page.evaluate(() => window.__SMARA_DESKTOP_COMMANDS__ ?? []);
  expect(commands).toContain('stream_desktop_chat');
  await page.locator('#delete-chat-button').click();
  await expect(page.locator('.chat-message-user')).toHaveCount(0);
  await expect(page.locator('#chat-status')).toContainText('dihapus');
});

test('lists existing chat sessions in the sidebar and opens them', async ({ page }) => {
  await installMockTauri(page);
  await page.goto('/');
  await openDesktopPage(page, 'chat');

  await page.locator('#chat-input').fill('Sesi pertama');
  await page.locator('#send-chat-button').click();
  await expect(page.locator('#sidebar-chat-session-list .sidebar-chat-session')).toHaveCount(1);
  await expect(page.locator('#sidebar-chat-session-list')).toContainText('Sesi pertama');

  await page.locator('#sidebar-new-chat-button').click();
  await page.locator('#chat-input').fill('Sesi kedua');
  await page.locator('#send-chat-button').click();
  await expect(page.locator('#sidebar-chat-session-list .sidebar-chat-session')).toHaveCount(2);
  await expect(page.locator('#sidebar-chat-session-list')).toContainText('Sesi kedua');

  await page.locator('#sidebar-chat-session-list .sidebar-chat-session').filter({ hasText: 'Sesi pertama' }).click();
  await expect(page.locator('.chat-message-user')).toContainText('Sesi pertama');
  await expect(page.locator('#sidebar-chat-session-list .sidebar-chat-session.active')).toContainText('Sesi pertama');
});

test('keeps long chat transcripts scrollable while composer stays visible', async ({ page }) => {
  await installMockTauri(page);
  await page.goto('/');
  await openDesktopPage(page, 'chat');

  for (let index = 0; index < 12; index += 1) {
    await page.locator('#chat-input').fill(`Prompt panjang ${index + 1}: ${'konteks tambahan '.repeat(14)}`);
    await page.locator('#send-chat-button').click();
    await expect(page.locator('.chat-message-assistant')).toHaveCount(index + 1);
  }

  const metrics = await page.locator('#chat-messages').evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
    overflowY: getComputedStyle(element).overflowY,
  }));
  expect(metrics.overflowY).toBe('auto');
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  expect(metrics.scrollHeight - metrics.clientHeight - metrics.scrollTop).toBeLessThanOrEqual(10);
  await expect(page.locator('#chat-form')).toBeVisible();

  await page.locator('#chat-messages').evaluate((element) => { element.scrollTop = 0; });
  await page.locator('.chat-message-user').first().hover();
  await page.mouse.wheel(0, 600);
  await expect.poll(() => page.locator('#chat-messages').evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});

test('cancels and retries a streaming chat request', async ({ page }) => {
  await installMockTauri(page);
  await page.goto('/');
  await openDesktopPage(page, 'chat');
  await page.locator('#chat-input').fill('cancel this chat');
  await page.locator('#send-chat-button').click();
  await expect(page.locator('#cancel-chat-stream-button')).toBeVisible();
  await page.locator('#cancel-chat-stream-button').click();
  await expect(page.locator('#chat-status')).toContainText('dibatalkan');
  await expect(page.locator('#retry-chat-button')).toBeEnabled();
  await page.locator('#retry-chat-button').click();
  await expect(page.locator('.chat-message-assistant')).toHaveText('native streaming reply');
});

test('uploads and pastes image attachments into chat', async ({ page }) => {
  await installMockTauri(page);
  await page.goto('/');
  await openDesktopPage(page, 'chat');
  await page.locator('#chat-file-input').setInputFiles([
    {
      name: 'diagram.png',
      mimeType: 'image/png',
      buffer: Buffer.from('mock-image'),
    },
    {
      name: 'notes.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# Attachment notes'),
    },
  ]);
  await page.locator('#chat-input').evaluate((input) => {
    const clipboard = new DataTransfer();
    clipboard.items.add(new File([new Uint8Array([1, 2, 3])], 'clipboard.png', { type: 'image/png' }));
    input.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: clipboard,
    }));
  });
  await page.evaluate(() => {
    const file = new File([new Uint8Array([4, 5, 6])], 'webkit-item.png', { type: 'image/png' });
    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', {
      value: {
        files: [],
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
        getData: () => '',
      },
    });
    document.dispatchEvent(event);
  });

  await expect(page.locator('#chat-attachments')).toContainText('diagram.png');
  await expect(page.locator('#chat-attachments')).toContainText('notes.md');
  await expect(page.locator('#chat-attachments')).toContainText('clipboard.png');
  await expect(page.locator('#chat-attachments')).toContainText('webkit-item.png');
  await expect(page.locator('#chat-attachments img')).toHaveCount(3);
  await page.locator('#chat-input').fill('Jelaskan gambar ini');
  await page.locator('#send-chat-button').click();

  await expect(page.locator('.chat-message-user .chat-attachment')).toContainText([
    'diagram.png',
    'notes.md',
    'clipboard.png',
    'webkit-item.png',
  ]);
  await expect(page.locator('.chat-message-user .chat-attachment img')).toHaveCount(3);
  await expect(page.locator('#chat-attachments')).toBeHidden();
});


test('creates edits searches and deletes local memory', async ({ page }) => {
  await installMockTauri(page);
  await page.goto('/');
  await openDesktopPage(page, 'memory');
  await page.locator('#memory-input').fill('Remember Rust native memory');
  await page.locator('#memory-tags-input').fill('rust, desktop');
  await page.locator('#save-memory-button').click();

  await expect(page.locator('.memory-item')).toContainText('Remember Rust native memory');
  await expect(page.locator('#memory-count')).toHaveText('1');
  await page.locator('.memory-item .secondary-button').click();
  await page.locator('#memory-input').fill('Updated Rust native memory');
  await page.locator('#save-memory-button').click();
  await expect(page.locator('.memory-item')).toContainText('Updated Rust native memory');
  await page.locator('#memory-search-input').fill('Rust');
  await expect(page.locator('.memory-item')).toHaveCount(1);
  await expect(page.locator('.memory-score')).toContainText('semantic');
  await expect(page.locator('#memory-search-mode')).toContainText('hybrid semantic');
  await page.locator('.memory-item .danger-button').click();
  await expect(page.locator('.memory-item')).toHaveCount(0);
});

test('creates edits runs and deletes a read-only Desktop skill', async ({ page }) => {
  await installMockTauri(page);
  await page.goto('/');
  await openDesktopPage(page, 'skill');
  await page.locator('#skill-name-input').fill('inspect workspace');
  await page.locator('#skill-steps-input').fill('[{"tool":"analyze_workspace","args":{"depth":2}}]');
  await page.locator('#save-skill-button').click();

  await expect(page.locator('.skill-item')).toContainText('inspect workspace');
  await page.locator('.skill-item .secondary-button').click();
  await page.locator('#skill-description-input').fill('Updated skill');
  await page.locator('#save-skill-button').click();
  await expect(page.locator('.skill-item')).toContainText('v2');
  await expect(page.locator('.skill-item')).toContainText('Updated skill');
  await page.locator('#skill-workspace-input').fill('/tmp/project');
  await page.locator('.skill-item button').first().click();
  await expect(page.locator('#skill-output')).toContainText('Files: 42');
  await page.locator('.skill-item .danger-button').click();
  await expect(page.locator('.skill-item')).toHaveCount(0);
});

test('requires explicit preview approval before a mutating Desktop skill runs', async ({ page }) => {
  await installMockTauri(page);
  await page.goto('/');
  await openDesktopPage(page, 'skill');
  await page.locator('#skill-name-input').fill('write approved file');
  await page.locator('#skill-steps-input').fill(
    '[{"tool":"write_file","args":{"path":"approved.txt","content":"approved"}}]',
  );
  await page.locator('#save-skill-button').click();

  await expect(page.locator('.risk-badge')).toContainText('1 mutasi');
  await page.locator('#skill-workspace-input').fill('/tmp/project');
  await page.locator('.skill-item button').first().click();
  await expect(page.locator('#skill-approval-panel')).toBeVisible();
  await expect(page.locator('#skill-approval-preview')).toContainText('write_file [MUTASI]');
  await expect(page.locator('#approve-skill-button')).toBeDisabled();
  await page.locator('#skill-approval-checkbox').check();
  await page.locator('#approve-skill-button').click();
  await expect(page.locator('#skill-output')).toContainText('Wrote approved.txt');
  await expect(page.locator('#skill-output')).toContainText('[MUTASI]');
});

test('shows provider offline state without falling back to Smara CLI', async ({ page }) => {
  await installMockTauri(page, false);
  await page.goto('/');
  await openDesktopPage(page, 'settings');

  await expect(page.locator('#provider-state')).toHaveText('offline');
  await expect(page.locator('#provider-detail')).toContainText('connection refused');
  await expect(page.locator('#launcher-status')).toContainText('berjalan mandiri');
});

test('saves provider config through Rust-native Desktop command', async ({ page }) => {
  await installMockTauri(page);
  await page.goto('/');
  await openDesktopPage(page, 'settings');
  await page.locator('#provider-model-input').fill('desktop-model');
  await page.locator('#save-provider-button').click();

  await expect(page.locator('#provider-model-input')).toHaveValue('desktop-model');
  await expect.poll(async () => {
    const commands = await page.evaluate(() => window.__SMARA_DESKTOP_COMMANDS__ ?? []);
    return commands.filter((command) => command === 'save_desktop_provider_config').length;
  }).toBe(1);
});

test('creates previews approves runs and deletes a Desktop workflow', async ({ page }) => {
  await installMockTauri(page);
  await page.goto('/');
  await openDesktopPage(page, 'workflow');
  await page.locator('#workflow-name-input').fill('native workflow');
  await page.locator('#workflow-steps-input').fill(
    '[{"kind":"mcp","server_name":"local","target":"echo","args":{"text":"hello"}}]',
  );
  await page.locator('#save-workflow-button').click();
  await expect(page.locator('#workflow-list')).toContainText('native workflow');
  await page.locator('#workflow-workspace-input').fill('/tmp/project');
  await page.locator('#workflow-list button').first().click();
  await expect(page.locator('#workflow-approval-panel')).toBeVisible();
  await page.locator('#workflow-approval-checkbox').check();
  await page.locator('#approve-workflow-button').click();
  await expect(page.locator('#workflow-output')).toContainText('MCP workflow output');
  await page.locator('#workflow-list .danger-button').click();
  await expect(page.locator('#workflow-list .automation-item')).toHaveCount(0);
});

test('configures discovers and calls an MCP server', async ({ page }) => {
  await installMockTauri(page);
  await page.goto('/');
  await openDesktopPage(page, 'mcp');
  await page.locator('#mcp-name-input').fill('local');
  await page.locator('#mcp-command-input').fill('node');
  await page.locator('#mcp-args-input').fill('["server.mjs"]');
  await page.locator('#save-mcp-button').click();
  await expect(page.locator('#mcp-list')).toContainText('local');
  await page.locator('#mcp-list button').first().click();
  await expect(page.locator('#mcp-output')).toContainText('echo');
  await page.locator('#mcp-tool-input').fill('echo');
  await page.locator('#call-mcp-tool-button').click();
  await expect(page.locator('#mcp-output')).toContainText('MCP echo result');
  await page.locator('#mcp-list .danger-button').click();
  await expect(page.locator('#mcp-list .automation-item')).toHaveCount(0);
});

test('builds and searches a Rust-native Graphify graph', async ({ page }) => {
  await installMockTauri(page);
  await page.goto('/');
  await openDesktopPage(page, 'graphify');
  await page.locator('#graphify-workspace-input').fill('/tmp/project');
  await page.locator('#build-graphify-button').click();
  await expect(page.locator('#graphify-summary')).toContainText('4 nodes');
  await expect(page.locator('#graphify-output')).toContainText('Graphify native selesai');
  await expect(page.locator('#graphify-canvas .graph-node')).toHaveCount(4);
  await page.locator('#graphify-search-input').fill('start');
  await expect(page.locator('#graphify-node-list')).toContainText('startDesktop');
  const commands = await page.evaluate(() => window.__SMARA_DESKTOP_COMMANDS__ ?? []);
  expect(commands).toContain('build_desktop_graphify');
  expect(commands).toContain('search_desktop_graphify');
});

test('imports searches inspects and deletes native media', async ({ page }) => {
  await installMockTauri(page);
  await page.goto('/');
  await openDesktopPage(page, 'media');
  await page.locator('#media-path-input').fill('/tmp/voice.wav');
  await page.locator('#media-title-input').fill('Voice sample');
  await page.locator('#media-tags-input').fill('voice, test');
  await page.locator('#import-media-button').click();
  await expect(page.locator('#media-list')).toContainText('Voice sample');
  await expect(page.locator('#media-count')).toHaveText('1');
  await page.locator('#media-search-input').fill('voice');
  await expect(page.locator('#media-list .automation-item')).toHaveCount(1);
  await page.locator('#media-list .secondary-button').click();
  await expect(page.locator('#media-output')).toContainText('audio/wav');
  await expect(page.locator('#media-preview audio')).toHaveCount(1);
  await page.locator('#media-list .danger-button').click();
  await expect(page.locator('#media-list .automation-item')).toHaveCount(0);
});

test('renders natural agent tree with clean hierarchy and collapsible drawers', async ({ page }) => {
  await installMockTauri(page);
  await page.goto('/');
  await openDesktopPage(page, 'chat');

  await page.locator('#chat-input').fill('analisis codebase dan cek unit test');
  await page.locator('#send-chat-button').click();

  // Root header should render natural "Worked for Xs ⌄"
  const treeContainer = page.locator('.agent-tree-container');
  await expect(treeContainer).toBeVisible();
  await expect(treeContainer.locator('.agent-tree-root')).toContainText('Worked for');

  // Verify tree body has action rows
  const treeBody = treeContainer.locator('.agent-tree-body');
  await expect(treeBody).toBeVisible();
  const rowCount = await treeBody.locator('.agent-tree-row').count();
  expect(rowCount).toBeGreaterThanOrEqual(3);

  // Test root collapse and expand
  await treeContainer.locator('.agent-tree-root').click();
  await expect(treeBody).toHaveClass(/collapsed/);
  await treeContainer.locator('.agent-tree-root').click();
  await expect(treeBody).not.toHaveClass(/collapsed/);

  // Test copy button
  await treeContainer.locator('.tree-copy-btn').click();
  await expect(treeContainer.locator('.tree-copy-btn')).toContainText('✓');
});

test('switches cleanly between chat, memory, and dashboard without layout overlap', async ({ page }) => {
  await installMockTauri(page);
  await page.goto('/');

  // 1. Open Chat page
  await openDesktopPage(page, 'chat');
  await expect(page.locator('#chat-section')).toBeVisible();
  await expect(page.locator('#dashboard-section')).toBeHidden();
  await expect(page.locator('#memory-section')).toBeHidden();

  // 2. Switch to Memory page
  await openDesktopPage(page, 'memory');
  await expect(page.locator('#memory-section')).toBeVisible();
  await expect(page.locator('#chat-section')).toBeHidden();
  await expect(page.locator('#dashboard-section')).toBeHidden();

  // 3. Switch to Dashboard page
  await openDesktopPage(page, 'dashboard');
  await expect(page.locator('#dashboard-section')).toBeVisible();
  await expect(page.locator('#chat-section')).toBeHidden();
  await expect(page.locator('#memory-section')).toBeHidden();

  // 4. Switch to Skill page
  await openDesktopPage(page, 'skill');
  await expect(page.locator('#skill-section')).toBeVisible();
  await expect(page.locator('#chat-section')).toBeHidden();
});

test('supports creating custom and randomized workspace folders with connected sessions', async ({ page }) => {
  await installMockTauri(page);
  await page.goto('/');

  await openDesktopPage(page, 'chat');
  await expect(page.locator('#active-workspace-name')).toHaveText('General');

  // Open Folder Modal
  await page.locator('#sidebar-new-folder-button').click();
  await expect(page.locator('#folder-modal')).toBeVisible();

  // Test Random Folder Name Generator
  await page.locator('#folder-random-btn').click();
  const generatedName = await page.locator('#folder-name-input').inputValue();
  expect(generatedName.length).toBeGreaterThan(3);

  // Set specific folder name and create
  await page.locator('#folder-name-input').fill('Project-Backend');
  await page.locator('#confirm-create-folder-button').click();
  await expect(page.locator('#folder-modal')).toBeHidden();

  // Header active workspace should now reflect Project-Backend
  await expect(page.locator('#active-workspace-name')).toHaveText('Project-Backend');

  // Send chat message in this folder
  await page.locator('#chat-input').fill('halo dari project backend');
  await page.locator('#send-chat-button').click();
  await expect(page.locator('.chat-message-assistant')).toBeVisible();

  // Check that sidebar grouped accordion renders Project-Backend
  const groupHeader = page.locator('.sidebar-workspace-group', { hasText: 'Project-Backend' });
  await expect(groupHeader).toBeVisible();
  await expect(groupHeader.locator('.sidebar-chat-session-btn')).toContainText('halo dari project backend');
});

test('supports moving chat sessions between folders', async ({ page }) => {
  await installMockTauri(page);
  await page.goto('/');

  await openDesktopPage(page, 'chat');

  // Create a session in default workspace
  await page.locator('#chat-input').fill('sesi pertama di general');
  await page.locator('#send-chat-button').click();
  await expect(page.locator('.chat-message-assistant')).toBeVisible();

  // Create folder Workspace-VPS
  await page.locator('#sidebar-new-folder-button').click();
  await page.locator('#folder-name-input').fill('Workspace-VPS');
  await page.locator('#confirm-create-folder-button').click();
  await expect(page.locator('#folder-modal')).toBeHidden();

  // Now click options on the first session to move it
  const sessionRow = page.locator('.sidebar-chat-session-row', { hasText: 'sesi pertama di general' });
  await sessionRow.locator('.session-options-btn').click();
  await expect(page.locator('#move-session-modal')).toBeVisible();

  // Select Workspace-VPS and confirm
  await page.locator('#move-folder-select').selectOption('Workspace-VPS');
  await page.locator('#confirm-move-session-button').click();
  await expect(page.locator('#move-session-modal')).toBeHidden();

  // Verify session is now listed under Workspace-VPS group
  const vpsGroup = page.locator('.sidebar-workspace-group', { hasText: 'Workspace-VPS' });
  await expect(vpsGroup.locator('.sidebar-chat-session-btn')).toContainText('sesi pertama di general');
});

test('persists agent execution trajectory in chat session and renders on session switch', async ({ page }) => {
  await installMockTauri(page);
  await page.goto('/');

  await openDesktopPage(page, 'chat');

  // Send message that triggers streaming
  await page.locator('#chat-input').fill('cek vps saya');
  await page.locator('#send-chat-button').click();
  await expect(page.locator('.chat-message-assistant')).toBeVisible();

  // Agent tree should be visible in chat
  const agentTree = page.locator('.agent-tree-container');
  await expect(agentTree).toBeVisible();
  await expect(agentTree.locator('.agent-tree-root')).toContainText('Worked for');

  // Create a second session
  await page.locator('#sidebar-new-chat-button').click();
  await page.locator('#chat-input').fill('pertanyaan kedua');
  await page.locator('#send-chat-button').click();
  await expect(page.locator('.chat-message-assistant')).toBeVisible();

  // Switch back to the first session 'cek vps saya'
  await page.locator('.sidebar-chat-session-btn').filter({ hasText: 'cek vps saya' }).click();

  // Verify agent tree is still fully present and rendered from message.processes
  await expect(page.locator('.agent-tree-container')).toBeVisible();
  await expect(page.locator('.agent-tree-root')).toContainText('Worked for');
});

test('displays workspace file explorer and git status in sidebar with file preview', async ({ page }) => {
  await installMockTauri(page);
  await page.goto('/');

  await openDesktopPage(page, 'chat');

  // Verify Git status pill in header
  const gitPill = page.locator('#active-workspace-git-pill');
  await expect(gitPill).toBeVisible();
  await expect(gitPill).toContainText('main');

  // Switch sidebar to "Files" tab
  await page.locator('#sidebar-tab-explorer').click();
  await expect(page.locator('#sidebar-file-explorer-list')).toBeVisible();
  await expect(page.locator('#sidebar-git-status-bar')).toBeVisible();
  await expect(page.locator('#sidebar-git-branch')).toHaveText('main');

  // Verify file tree nodes
  const srcDir = page.locator('.file-tree-row', { hasText: 'src' });
  await expect(srcDir).toBeVisible();
  const indexHtml = page.locator('.file-tree-row', { hasText: 'index.html' });
  await expect(indexHtml).toBeVisible();

  // Click on index.html to open preview modal
  await indexHtml.click();
  await expect(page.locator('#file-preview-modal')).toBeVisible();
  await expect(page.locator('#file-preview-content')).toContainText('Hello Smara');

  // Click "Lampirkan ke Chat"
  await page.locator('#file-preview-attach-btn').click();
  await expect(page.locator('#file-preview-modal')).toBeHidden();

  // Verify file is attached in chat composer
  await expect(page.locator('.chat-attachment')).toContainText('index.html');
});

test('quick model switcher switches models and detects local LLMs', async ({ page }) => {
  await installMockTauri(page);
  await page.goto('/');

  await openDesktopPage(page, 'chat');

  // Click model switcher dropdown
  await page.locator('#model-switcher-btn').click();
  const menu = page.locator('#model-switcher-menu');
  await expect(menu).toBeVisible();

  // Switch to Claude 3.7 Sonnet
  await menu.locator('.model-option-btn', { hasText: 'Claude 3.7 Sonnet' }).click();
  await expect(menu).toBeHidden();
  await expect(page.locator('#active-model-name')).toHaveText('claude-3-7-sonnet');

  // Open dropdown again and click "Deteksi"
  await page.locator('#model-switcher-btn').click();
  await expect(menu).toBeVisible();
  await page.locator('#detect-local-models-btn').click();

  // Verify detected local models appear
  const localModel = menu.locator('.model-option-btn', { hasText: 'llama3:latest' });
  await expect(localModel).toBeVisible();

  // Click the detected local model
  await localModel.click();
  await expect(menu).toBeHidden();
  await expect(page.locator('#active-model-name')).toHaveText('llama3:latest');
});

test('at-mention file autocomplete inserts file path into composer and attaches file', async ({ page }) => {
  await installMockTauri(page);
  await page.goto('/');

  await openDesktopPage(page, 'chat');

  const chatInput = page.locator('#chat-input');
  await chatInput.fill('tolong periksa @main');

  // Popover should appear with matching suggestions
  const popover = page.locator('#at-mention-popover');
  await expect(popover).toBeVisible();
  const suggestion = page.locator('.at-mention-item', { hasText: 'src/main.rs' });
  await expect(suggestion).toBeVisible();

  // Press Enter on the input to select the highlighted suggestion
  await chatInput.press('Enter');
  await expect(popover).toBeHidden();
  await expect(chatInput).toHaveValue('tolong periksa @src/main.rs ');

  // File should also be added to pending attachments
  await expect(page.locator('.chat-attachment')).toContainText('main.rs');
});

test('applies code from assistant code block and provides prompt edit button', async ({ page }) => {
  await installMockTauri(page);
  await page.goto('/');

  await openDesktopPage(page, 'chat');

  // Send message
  await page.locator('#chat-input').fill('buat file config');
  await page.locator('#send-chat-button').click();
  await expect(page.locator('.chat-message-assistant')).toBeVisible();

  // Hover over user message to see prompt edit button
  const userMsg = page.locator('.chat-message-user');
  const editBtn = userMsg.locator('.user-msg-edit-btn');
  await expect(editBtn).toBeVisible();

  // Click edit button
  await editBtn.click();
  await expect(page.locator('#chat-input')).toHaveValue('buat file config');
});

test('opens command palette with Ctrl+K, filters items, and executes action', async ({ page }) => {
  await installMockTauri(page);
  await page.goto('/');

  // Trigger command palette via topbar search button
  await page.locator('#topbar-search-btn').click();
  const modal = page.locator('#command-palette-modal');
  await expect(modal).toBeVisible();

  const paletteInput = page.locator('#command-palette-input');
  await expect(paletteInput).toBeFocused();

  // Search for Knowledge Graph action
  await paletteInput.fill('Graphify');
  const graphifyResult = page.locator('.palette-result-item', { hasText: 'Knowledge Graph' });
  await expect(graphifyResult).toBeVisible();

  // Press Enter to navigate to Graphify
  await paletteInput.press('Enter');
  await expect(modal).toBeHidden();
  await expect(page.locator('[data-page="graphify"]')).toBeVisible();

  // Open with keyboard shortcut Ctrl+K
  await page.keyboard.press('Control+KeyK');
  await expect(modal).toBeVisible();

  // Filter by "Files" chip
  await page.locator('.palette-filter-chip[data-filter="files"]').click();
  const fileResult = page.locator('.palette-result-item', { hasText: 'main.rs' });
  await expect(fileResult).toBeVisible();

  // Press Escape to close
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
});

test('exports active chat session to markdown, html, and json formats', async ({ page }) => {
  await installMockTauri(page);
  await page.goto('/');

  await openDesktopPage(page, 'chat');

  // Send a message first
  await page.locator('#chat-input').fill('analisis performa database');
  await page.locator('#send-chat-button').click();
  await expect(page.locator('.chat-message-assistant')).toBeVisible();

  // Click Ekspor button in chat header
  await page.locator('#chat-export-btn').click();
  const exportModal = page.locator('#chat-export-modal');
  await expect(exportModal).toBeVisible();

  // Verify Markdown preview is loaded by default
  const previewTextarea = page.locator('#export-preview-textarea');
  await expect(previewTextarea).toHaveValue(/analisis performa database/);

  // Switch to HTML format card
  await page.locator('.export-option-card[data-format="html"]').click();
  await expect(page.locator('#export-file-name-preview')).toContainText('.html');
  await expect(previewTextarea).toHaveValue(/<!DOCTYPE html>/);

  // Switch to JSON format card
  await page.locator('.export-option-card[data-format="json"]').click();
  await expect(page.locator('#export-file-name-preview')).toContainText('.json');
  await expect(previewTextarea).toHaveValue(/messages/);

  // Click Copy button
  await page.locator('#copy-chat-export-button').click();
  await expect(page.locator('#copy-chat-export-button')).toContainText('Disalin');

  // Close export modal
  await page.locator('#close-chat-export-modal-button').click();
  await expect(exportModal).toBeHidden();
});

test('captures chat page screenshot for redesign verification', async ({ page }) => {
  await installMockTauri(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await openDesktopPage(page, 'chat');
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/home/cahya/.gemini/antigravity/brain/9f9ccaa3-3e79-4763-8864-344f94eb7e24/chat_redesign_screenshot.png' });
});

test('opens and reviews file changes in git diff review modal', async ({ page }) => {
  await installMockTauri(page);
  await page.goto('/');
  await openDesktopPage(page, 'chat');

  // Verify review changes button exists
  const reviewBtn = page.locator('#open-git-diff-review-button');
  await expect(reviewBtn).toBeVisible();

  // Click Review Changes button
  await reviewBtn.click();

  const reviewModal = page.locator('#git-diff-review-modal');
  await expect(reviewModal).toBeVisible();

  // Check branch badge and files list
  await expect(page.locator('#git-review-branch-badge')).toContainText('🌿 main');
  await expect(page.locator('#git-review-files-list .git-review-file-item')).toHaveCount(2);

  // First file (src/main.ts) should be active by default
  await expect(page.locator('#git-diff-active-filename')).toContainText('src/main.ts');
  await expect(page.locator('#git-diff-viewer-content')).toContainText('// Smara Desktop');
  await expect(page.locator('#git-diff-viewer-content .diff-line-add')).toHaveCount(3);

  // Click second file (src/new_feature.ts)
  await page.locator('.git-review-file-item[data-path="src/new_feature.ts"]').click();
  await expect(page.locator('#git-diff-active-filename')).toContainText('src/new_feature.ts');
  await expect(page.locator('#git-diff-viewer-content')).toContainText('export const ready = true;');

  // Click Copy Diff button
  await page.locator('#copy-git-diff-button').click();
  await expect(page.locator('#copy-git-diff-button')).toContainText('Tersalin');

  // Close modal
  await page.locator('#close-git-diff-review-modal-button').click();
  await expect(reviewModal).toBeHidden();
});



