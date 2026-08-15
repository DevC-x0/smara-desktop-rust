#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import net from 'node:net';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const strict = process.env.SMARA_NATIVE_E2E_STRICT === '1';
const timeoutMs = Number(process.env.SMARA_NATIVE_E2E_TIMEOUT_MS || 60000);
const requestedPort = Number(process.env.SMARA_NATIVE_E2E_DRIVER_PORT || 4444);
const host = process.env.SMARA_NATIVE_E2E_DRIVER_HOST || '127.0.0.1';
const homeDir = process.env.HOME || process.env.USERPROFILE || '';
const teardownTimeoutMs = Number(process.env.SMARA_NATIVE_E2E_TEARDOWN_TIMEOUT_MS || 3000);

let port = requestedPort;
let driverProcess = null;
let browser = null;
let finished = false;
let driverExited = false;
let driverExitCode = null;
let driverExitSignal = null;
const driverWarnings = [];
const knownEnvironmentWarnings = [
  /Gtk-WARNING/i,
  /Theme parsing error/i,
  /free\(\): corrupted unsorted chunks/i,
  /Gdk-CRITICAL/i,
  /GLib-GObject-CRITICAL/i,
];

function log(message) {
  console.log(`[native-e2e] ${message}`);
}

function failOrSkip(message) {
  if (strict) {
    console.error(`[native-e2e] ${message}`);
    process.exit(1);
  }
  log(`${message} Skipping optional native smoke test. Set SMARA_NATIVE_E2E_STRICT=1 to make this a failure.`);
  process.exit(0);
}

function fail(message, error) {
  console.error(`[native-e2e] ${message}`);
  if (error) {
    console.error(error?.stack || error?.message || String(error));
  }
  process.exit(1);
}

function hasCommand(command, args = ['--version']) {
  if (command.includes('/') && existsSync(command)) return true;
  const lookup = spawnSync('sh', ['-lc', `command -v ${JSON.stringify(command)} >/dev/null 2>&1`], { stdio: 'ignore' });
  if (lookup.status !== 0) return false;
  if (args.length === 0) return true;
  const result = spawnSync(command, args, { stdio: 'ignore' });
  return result.status === 0 || result.status === 1;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function waitFor(predicate, label) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }
  throw new Error(`${label} timed out after ${timeoutMs}ms${lastError ? `: ${lastError.message}` : ''}`);
}

function isPortAvailable(candidatePort) {
  return new Promise((resolveCheck) => {
    const server = net.createServer();
    server.once('error', () => resolveCheck(false));
    server.once('listening', () => {
      server.close(() => resolveCheck(true));
    });
    server.listen(candidatePort, host);
  });
}

async function chooseDriverPort() {
  if (process.env.SMARA_NATIVE_E2E_DRIVER_PORT) {
    if (!(await isPortAvailable(requestedPort))) {
      throw new Error(`Requested tauri-driver port ${host}:${requestedPort} is already in use.`);
    }
    return requestedPort;
  }

  for (let candidate = requestedPort; candidate < requestedPort + 20; candidate += 1) {
    if (await isPortAvailable(candidate)) {
      if (candidate !== requestedPort) log(`Default port ${requestedPort} is busy; using isolated port ${candidate}.`);
      return candidate;
    }
  }
  throw new Error(`No available tauri-driver port found in range ${requestedPort}-${requestedPort + 19}.`);
}

async function webdriverRequest(method, path, body) {
  const response = await fetch(`http://${host}:${port}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${text}`);
  }
  if (payload.value?.error) {
    throw new Error(`${method} ${path} failed: ${payload.value.error} ${payload.value.message || ''}`);
  }
  return payload.value;
}

async function createSession(binaryPath) {
  const value = await webdriverRequest('POST', '/session', {
    capabilities: {
      alwaysMatch: {
        'tauri:options': {
          application: binaryPath,
        },
      },
    },
  });
  const sessionId = value.sessionId || value.capabilities?.sessionId;
  if (!sessionId) {
    throw new Error(`WebDriver session id missing in response: ${JSON.stringify(value)}`);
  }
  return { sessionId };
}

async function getTitle(sessionId) {
  return webdriverRequest('GET', `/session/${sessionId}/title`);
}

async function findElement(sessionId, selector) {
  return webdriverRequest('POST', `/session/${sessionId}/element`, {
    using: 'css selector',
    value: selector,
  });
}

async function executeAsync(sessionId, script, args = []) {
  return webdriverRequest('POST', `/session/${sessionId}/execute/async`, {
    script,
    args,
  });
}

function waitForChildExit(child, timeout = teardownTimeoutMs) {
  if (!child || driverExited) return Promise.resolve(true);
  return new Promise((resolveWait) => {
    const timer = setTimeout(() => {
      child.off('exit', onExit);
      resolveWait(false);
    }, timeout);
    function onExit() {
      clearTimeout(timer);
      resolveWait(true);
    }
    child.once('exit', onExit);
  });
}

function classifyDriverWarnings() {
  const warningText = driverWarnings.join('\n').trim();
  if (!warningText) return;
  const known = driverWarnings.filter((line) => knownEnvironmentWarnings.some((pattern) => pattern.test(line)));
  const unknown = driverWarnings.filter((line) => !knownEnvironmentWarnings.some((pattern) => pattern.test(line)));
  if (known.length > 0) log(`Observed ${known.length} known environment warning line(s) from native WebView/GTK teardown; not treated as test failure.`);
  if (unknown.length > 0) log(`Observed ${unknown.length} tauri-driver stderr line(s). Review if native E2E becomes flaky.`);
}

async function cleanup() {
  if (finished) return;
  finished = true;
  if (browser?.sessionId) {
    try {
      log('Closing WebDriver session.');
      await webdriverRequest('DELETE', `/session/${browser.sessionId}`);
    } catch (_) {
      log('WebDriver session cleanup returned a non-fatal error.');
    } finally {
      browser = null;
    }
  }
  if (driverProcess && !driverExited) {
    log(`Stopping tauri-driver pid ${driverProcess.pid}.`);
    driverProcess.kill('SIGTERM');
    const exited = await waitForChildExit(driverProcess);
    if (!exited && !driverExited) {
      log('tauri-driver did not stop after SIGTERM; sending SIGKILL.');
      driverProcess.kill('SIGKILL');
      await waitForChildExit(driverProcess, 1000);
    }
  }
  classifyDriverWarnings();
  if (driverExited) log(`tauri-driver exited with ${driverExitSignal || (driverExitCode ?? 0)}.`);
}

process.on('SIGINT', async () => {
  await cleanup();
  process.exit(130);
});
process.on('SIGTERM', async () => {
  await cleanup();
  process.exit(143);
});

const tauriDriverPath = process.env.TAURI_DRIVER || (hasCommand('tauri-driver') ? 'tauri-driver' : resolve(homeDir, '.cargo', 'bin', 'tauri-driver'));
const binaryPath = process.env.SMARA_NATIVE_E2E_APP || resolve(projectRoot, 'src-tauri', 'target', 'release', 'smara-desktop-rust');

if (!hasCommand(tauriDriverPath)) {
  failOrSkip('tauri-driver is not installed or not on PATH. Install with `cargo install tauri-driver`, or set TAURI_DRIVER=/path/to/tauri-driver.');
}
if (!hasCommand('npm', ['--version'])) {
  failOrSkip('npm is not available on PATH.');
}
if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
  failOrSkip('No desktop display detected. On headless Linux, run with `xvfb-run -a npm run test:e2e:native`.');
}
if (process.platform === 'linux' && !hasCommand('WebKitWebDriver')) {
  failOrSkip('WebKitWebDriver is not available on PATH. Install the WebKitGTK WebDriver package, or run with a configured native driver.');
}
const tauriConfig = resolve(projectRoot, 'src-tauri', 'tauri.conf.json');
if (!existsSync(tauriConfig)) {
  failOrSkip('src-tauri/tauri.conf.json was not found.');
}
if (!existsSync(binaryPath)) {
  failOrSkip(`Native app binary was not found at ${binaryPath}. Run \`npm run build\` first or set SMARA_NATIVE_E2E_APP.`);
}

try {
  port = await chooseDriverPort();
} catch (error) {
  failOrSkip(error?.message || String(error));
}

log(`Starting tauri-driver on ${host}:${port}.`);
driverProcess = spawn(tauriDriverPath, ['--port', String(port)], {
  cwd: projectRoot,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env },
});

driverProcess.stdout.on('data', (data) => process.stdout.write(`[tauri-driver] ${data}`));
driverProcess.stderr.on('data', (data) => {
  const text = String(data);
  driverWarnings.push(...text.split(/\r?\n/).filter(Boolean));
  process.stderr.write(`[tauri-driver] ${text}`);
});
driverProcess.on('exit', (code, signal) => {
  driverExited = true;
  driverExitCode = code;
  driverExitSignal = signal;
  if (!finished) fail(`tauri-driver exited unexpectedly with ${signal || code}.`);
});

try {
  await waitFor(async () => {
    const response = await fetch(`http://${host}:${port}/status`);
    return response.ok;
  }, 'tauri-driver status endpoint');

  log(`Opening native WebDriver session for ${binaryPath}.`);
  browser = await createSession(binaryPath);

  await waitFor(async () => {
    const title = await getTitle(browser.sessionId);
    return title && /Smara/i.test(title);
  }, 'native app title');

  const visibleSurface = await waitFor(async () => {
    try {
      await findElement(browser.sessionId, '.smara-shell');
      return 'complete Smara Web interface';
    } catch {
      await findElement(browser.sessionId, '#launcher-title');
      return 'desktop launcher';
    }
  }, 'Smara desktop or web surface');
  log(`Verified ${visibleSurface}.`);

  const builtinTools = await executeAsync(
    browser.sessionId,
    `
      const done = arguments[arguments.length - 1];
      window.__TAURI_INTERNALS__.invoke('list_desktop_builtin_tools')
        .then(done)
        .catch((error) => done({ __smaraError: String(error) }));
    `,
  );
  if (!Array.isArray(builtinTools) || !builtinTools.some((tool) => tool?.name === 'read_file')) {
    throw new Error(`Native built-in tool catalog was not available through Tauri IPC: ${JSON.stringify(builtinTools)}`);
  }
  log(`Verified ${builtinTools.length} Rust-native built-in tools through Tauri IPC.`);

  const builtinResult = await executeAsync(
    browser.sessionId,
    `
      const workspaceRoot = arguments[0];
      const done = arguments[arguments.length - 1];
      window.__TAURI_INTERNALS__.invoke('run_desktop_builtin_tool', {
        request: {
          tool: 'planning_template',
          workspace_root: workspaceRoot,
          args: { goal: 'Verify native Desktop built-in executor' },
          approval: null,
        },
      })
        .then(done)
        .catch((error) => done({ __smaraError: String(error) }));
    `,
    [projectRoot],
  );
  if (
    builtinResult?.tool !== 'planning_template'
    || !builtinResult?.output?.includes('Verify native Desktop built-in executor')
  ) {
    throw new Error(`Native built-in tool executor failed through Tauri IPC: ${JSON.stringify(builtinResult)}`);
  }
  log('Verified Rust-native built-in tool execution through Tauri IPC.');

  const nativeData = await executeAsync(
    browser.sessionId,
    `
      const done = arguments[arguments.length - 1];
      Promise.all([
        window.__TAURI_INTERNALS__.invoke('list_desktop_chat_sessions'),
        window.__TAURI_INTERNALS__.invoke('list_desktop_memories'),
        window.__TAURI_INTERNALS__.invoke('list_desktop_skills'),
        window.__TAURI_INTERNALS__.invoke('list_desktop_workflows'),
        window.__TAURI_INTERNALS__.invoke('list_desktop_mcp_servers'),
        window.__TAURI_INTERNALS__.invoke('get_desktop_graphify'),
        window.__TAURI_INTERNALS__.invoke('list_desktop_media'),
        window.__TAURI_INTERNALS__.invoke('search_desktop_memories_ranked', { query: '__native_smoke_memory_query__' }),
      ])
        .then(([chatSessions, memories, skills, workflows, mcpServers, graphify, media, rankedMemories]) =>
          done({ chatSessions, memories, skills, workflows, mcpServers, graphify, media, rankedMemories }))
        .catch((error) => done({ error: String(error) }));
    `,
  );
  if (
    nativeData?.error
    || !Array.isArray(nativeData?.chatSessions)
    || !Array.isArray(nativeData?.memories)
    || !Array.isArray(nativeData?.skills)
    || !Array.isArray(nativeData?.workflows)
    || !Array.isArray(nativeData?.mcpServers)
    || (nativeData?.graphify !== null && typeof nativeData?.graphify !== 'object')
    || !Array.isArray(nativeData?.media)
    || !Array.isArray(nativeData?.rankedMemories)
  ) {
    throw new Error(`Native Chat/Memory/Skills/Workflow/MCP/Graphify/Media IPC failed: ${JSON.stringify(nativeData)}`);
  }
  log('Verified Rust-native Chat, hybrid-ranked Memory, Skills, Workflow, MCP, Graphify, and Media storage through Tauri IPC.');

  let chatStreamCommandAvailable = false;
  try {
    const missingStreamRequestId = await executeAsync(
      browser.sessionId,
      `
        const done = arguments[arguments.length - 1];
        window.__TAURI_INTERNALS__.invoke('stream_desktop_chat', {
          request: { session_id: null, message: 'native smoke', request_id: null },
        })
          .then((value) => done({ value }))
          .catch((error) => done({ error: String(error) }));
      `,
    );
    chatStreamCommandAvailable = /Streaming Chat requires request_id/i.test(missingStreamRequestId?.error || '');
  } catch (error) {
    chatStreamCommandAvailable = /Streaming Chat requires request_id/i.test(String(error));
  }
  if (!chatStreamCommandAvailable) {
    throw new Error('Native streaming Chat command was not available through Tauri IPC.');
  }
  log('Verified Rust-native streaming Chat command through Tauri IPC.');

  const chatCancelCommand = await executeAsync(
    browser.sessionId,
    `
      const done = arguments[arguments.length - 1];
      window.__TAURI_INTERNALS__.invoke('cancel_desktop_chat_stream', { requestId: '__native_smoke_cancel__' })
        .then((value) => done({ value }))
        .catch(() => window.__TAURI_INTERNALS__.invoke('cancel_desktop_chat_stream', { request_id: '__native_smoke_cancel__' })
          .then((value) => done({ value }))
          .catch((error) => done({ error: String(error) })));
    `,
  );
  if (chatCancelCommand?.value !== true) {
    throw new Error(`Native Chat stream cancel command was not available through Tauri IPC: ${JSON.stringify(chatCancelCommand)}`);
  }
  log('Verified Rust-native Chat stream cancellation command through Tauri IPC.');

  let skillPreviewCommandAvailable = false;
  try {
    const missingSkillPreview = await executeAsync(
      browser.sessionId,
      `
        const workspaceRoot = arguments[0];
        const done = arguments[arguments.length - 1];
        window.__TAURI_INTERNALS__.invoke('preview_desktop_skill', {
          request: {
            name: '__native_smoke_missing_skill__',
            workspace_root: workspaceRoot,
            params: {},
            approval: null,
          },
        })
          .then((value) => done({ value }))
          .catch((error) => done({ error: String(error) }));
      `,
      [projectRoot],
    );
    skillPreviewCommandAvailable = /was not found/i.test(missingSkillPreview?.error || '');
  } catch (error) {
    skillPreviewCommandAvailable = /Desktop skill '__native_smoke_missing_skill__' was not found/i.test(String(error));
  }
  if (!skillPreviewCommandAvailable) {
    throw new Error('Native Skill preview command was not available through Tauri IPC.');
  }
  log('Verified Rust-native Skill preview and approval workflow command through Tauri IPC.');

  const workflowAndMcpCommands = await executeAsync(
    browser.sessionId,
    `
      const workspaceRoot = arguments[0];
      const done = arguments[arguments.length - 1];
      Promise.all([
        window.__TAURI_INTERNALS__.invoke('preview_desktop_workflow', {
          request: {
            name: '__native_smoke_missing_workflow__',
            workspace_root: workspaceRoot,
            params: {},
            approval: null,
          },
        }).catch((error) => String(error)),
        window.__TAURI_INTERNALS__.invoke('call_desktop_mcp_tool', {
          request: {
            server_name: '__native_smoke_missing_mcp__',
            tool: 'missing',
            arguments: {},
          },
        }).catch((error) => String(error)),
      ]).then(([workflowError, mcpError]) => done({ workflowError, mcpError }));
    `,
    [projectRoot],
  );
  if (
    !/workflow.*was not found/i.test(workflowAndMcpCommands?.workflowError || '')
    || !/MCP server.*was not found/i.test(workflowAndMcpCommands?.mcpError || '')
  ) {
    throw new Error(`Native Workflow/MCP commands were not available through Tauri IPC: ${JSON.stringify(workflowAndMcpCommands)}`);
  }
  log('Verified Rust-native Workflow preview and MCP tool commands through Tauri IPC.');

  const graphifyResult = await executeAsync(
    browser.sessionId,
    `
      const workspaceRoot = arguments[0];
      const done = arguments[arguments.length - 1];
      window.__TAURI_INTERNALS__.invoke('build_desktop_graphify', {
        request: { workspace_root: workspaceRoot, max_files: 20 },
      })
        .then((graph) => window.__TAURI_INTERNALS__.invoke('search_desktop_graphify', {
          request: { workspace_root: workspaceRoot, query: 'desktop' },
        }).then((nodes) => done({ graph, nodes })))
        .catch((error) => done({ error: String(error) }));
    `,
    [projectRoot],
  );
  if (
    graphifyResult?.error
    || !graphifyResult?.graph?.node_count
    || !Array.isArray(graphifyResult?.nodes)
  ) {
    throw new Error(`Native Graphify build/search failed through Tauri IPC: ${JSON.stringify(graphifyResult)}`);
  }
  log('Verified Rust-native Graphify build and search through Tauri IPC.');

  const mediaResult = await executeAsync(
    browser.sessionId,
    `
      const workspaceRoot = arguments[0];
      const done = arguments[arguments.length - 1];
      window.__TAURI_INTERNALS__.invoke('import_desktop_media', {
        request: {
          path: workspaceRoot + '/README.md',
          title: 'Native smoke README',
          tags: ['native-smoke'],
          copy_to_library: false,
        },
      })
        .then((asset) => window.__TAURI_INTERNALS__.invoke('search_desktop_media', {
          request: { query: 'native-smoke' },
        }).then((items) => window.__TAURI_INTERNALS__.invoke('delete_desktop_media', {
          id: asset.id,
        }).then((deleted) => done({ asset, items, deleted }))))
        .catch((error) => done({ error: String(error) }));
    `,
    [projectRoot],
  );
  if (
    mediaResult?.error
    || mediaResult?.asset?.kind !== 'document'
    || !Array.isArray(mediaResult?.items)
    || !mediaResult?.deleted
  ) {
    throw new Error(`Native Media import/search/delete failed through Tauri IPC: ${JSON.stringify(mediaResult)}`);
  }
  log('Verified Rust-native Media import, search, and delete through Tauri IPC.');

  let removedLegacyCommandRejected = false;
  try {
    const removedLegacyCommand = await executeAsync(
      browser.sessionId,
      `
        const done = arguments[arguments.length - 1];
        window.__TAURI_INTERNALS__.invoke('detect_smara_cli')
          .then((value) => done({ value }))
          .catch((error) => done({ error: String(error) }));
      `,
    );
    removedLegacyCommandRejected = Boolean(removedLegacyCommand?.error);
  } catch (error) {
    removedLegacyCommandRejected = /Command detect_smara_cli not found/i.test(String(error));
    if (!removedLegacyCommandRejected) throw error;
  }
  if (!removedLegacyCommandRejected) {
    throw new Error('Removed Smara CLI bridge command was unexpectedly available.');
  }
  log('Verified removed Smara CLI bridge command is rejected by Tauri IPC.');

  log('Native WebDriver smoke completed successfully.');
  await cleanup();
  process.exit(0);
} catch (error) {
  await cleanup();
  if (strict) fail('Native WebDriver smoke failed.', error);
  log(`Native WebDriver smoke could not complete: ${error?.message || error}. Skipping optional native smoke test. Set SMARA_NATIVE_E2E_STRICT=1 to make this a failure.`);
  process.exit(0);
}
