import { fileAssetUrl, invokeCommand, listenCommand } from './tauri-client';
import { readImage as readClipboardImage } from '@tauri-apps/plugin-clipboard-manager';
import './styles.css';

type DesktopCapability = {
  id: string;
  label: string;
  backend: string;
  ready: boolean;
};

type DesktopRuntimeStatus = {
  ready: boolean;
  mode: string;
  version: string;
  uptime_ms: number;
  native_ready: number;
  migration_total: number;
  capabilities: DesktopCapability[];
};

type DesktopProviderHealth = {
  provider: string;
  model: string;
  endpoint: string;
  online: boolean;
  latency_ms: number;
  error?: string;
};

type DesktopProviderConfig = {
  provider: string;
  model: string;
  endpoint: string;
};

type DesktopChatMessage = {
  id: string;
  role: string;
  content: string;
  attachments?: DesktopChatAttachment[];
  created_at_ms: number;
};

type DesktopChatAttachment = {
  name: string;
  mime: string;
  data_base64: string;
  bytes: number;
};

type DesktopChatSession = {
  id: string;
  title: string;
  created_at_ms: number;
  updated_at_ms: number;
  messages: DesktopChatMessage[];
  memory_context_count: number;
};

type DesktopChatStreamEvent = {
  request_id: string;
  kind: string;
  delta: string;
};

type ChatProcessEntry = {
  kind: string;
  text: string;
  createdAt: number;
};

type DesktopMemory = {
  id: string;
  content: string;
  tags: string[];
  created_at_ms: number;
  updated_at_ms: number;
};

type DesktopMemorySearchResult = {
  memory: DesktopMemory;
  score: number;
  matched_terms: string[];
  match_kind: string;
};

type DesktopSkillStep = {
  tool: string;
  args: Record<string, unknown>;
};

type DesktopSkill = {
  name: string;
  description: string;
  version: number;
  tags: string[];
  steps: DesktopSkillStep[];
  created_at_ms: number;
  updated_at_ms: number;
};

type DesktopSkillRunResult = {
  skill_name: string;
  success: boolean;
  outputs: Array<{ tool: string; output: string; mutated: boolean }>;
  summary: string;
};

type DesktopSkillPreview = {
  skill_name: string;
  workspace_root: string;
  requires_approval: boolean;
  mutation_count: number;
  steps: Array<{
    index: number;
    tool: string;
    args: Record<string, unknown>;
    risk_level: string;
    requires_approval: boolean;
  }>;
};

type DesktopWorkflowStep = {
  kind: 'builtin' | 'mcp';
  target: string;
  server_name?: string | null;
  args: Record<string, unknown>;
  run_if?: string | null;
  parallel_group?: string | null;
};

type DesktopWorkflow = {
  name: string;
  description: string;
  version: number;
  steps: DesktopWorkflowStep[];
  created_at_ms: number;
  updated_at_ms: number;
};

type DesktopWorkflowPreview = {
  workflow_name: string;
  workspace_root: string;
  requires_approval: boolean;
  risky_step_count: number;
  steps: Array<DesktopWorkflowStep & {
    index: number;
    risk_level: string;
    requires_approval: boolean;
    skipped: boolean;
  }>;
};

type DesktopWorkflowRunResult = {
  workflow_name: string;
  success: boolean;
  summary: string;
  outputs: Array<{ index: number; kind: string; target: string; output: string; mutated: boolean }>;
};

type DesktopMcpServer = {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  created_at_ms: number;
  updated_at_ms: number;
};

type DesktopMcpHealth = {
  server_name: string;
  online: boolean;
  latency_ms: number;
  protocol_version: string;
  tools: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>;
  error?: string;
};

type DesktopMcpToolResult = {
  server_name: string;
  tool: string;
  content: unknown;
  is_error: boolean;
};

type DesktopGraphNode = {
  id: string;
  label: string;
  kind: string;
  path: string;
  weight: number;
};

type DesktopGraphEdge = {
  source: string;
  target: string;
  relation: string;
  evidence: string;
  weight: number;
};

type DesktopGraphifyGraph = {
  workspace_root: string;
  generated_at_ms: number;
  file_count: number;
  node_count: number;
  edge_count: number;
  nodes: DesktopGraphNode[];
  edges: DesktopGraphEdge[];
  report: string;
};

type DesktopMediaAsset = {
  id: string;
  title: string;
  kind: string;
  file_name: string;
  mime: string;
  source_path: string;
  stored_path: string;
  bytes: number;
  checksum: string;
  tags: string[];
  created_at_ms: number;
  updated_at_ms: number;
};

const statusText = document.querySelector<HTMLElement>('#launcher-status');
const progress = document.querySelector<HTMLElement>('#launcher-progress');
const nativeRuntime = document.querySelector<HTMLElement>('#native-runtime');
const nativeRuntimeSummary = document.querySelector<HTMLElement>('#native-runtime-summary');
const nativeCapabilities = document.querySelector<HTMLElement>('#native-capabilities');
const providerHealthPanel = document.querySelector<HTMLElement>('#provider-health');
const providerIndicator = document.querySelector<HTMLElement>('#provider-indicator');
const providerName = document.querySelector<HTMLElement>('#provider-name');
const providerState = document.querySelector<HTMLElement>('#provider-state');
const providerDetail = document.querySelector<HTMLElement>('#provider-detail');
const providerSelect = document.querySelector<HTMLSelectElement>('#provider-select');
const providerModelInput = document.querySelector<HTMLInputElement>('#provider-model-input');
const providerEndpointInput = document.querySelector<HTMLInputElement>('#provider-endpoint-input');
const saveProviderButton = document.querySelector<HTMLButtonElement>('#save-provider-button');
const refreshProviderButton = document.querySelector<HTMLButtonElement>('#refresh-provider-button');
const errorPanel = document.querySelector<HTMLElement>('#launcher-error');
const errorMessage = document.querySelector<HTMLElement>('#launcher-error-message');
const chatSessionSelect = document.querySelector<HTMLSelectElement>('#chat-session-select');
const sidebarNewChatButton = document.querySelector<HTMLButtonElement>('#sidebar-new-chat-button');
const sidebarChatSessionList = document.querySelector<HTMLElement>('#sidebar-chat-session-list');
const chatMessages = document.querySelector<HTMLElement>('#chat-messages');
const chatForm = document.querySelector<HTMLFormElement>('#chat-form');
const chatAttachments = document.querySelector<HTMLElement>('#chat-attachments');
const attachChatButton = document.querySelector<HTMLButtonElement>('#attach-chat-button');
const chatFileInput = document.querySelector<HTMLInputElement>('#chat-file-input');
const chatInput = document.querySelector<HTMLTextAreaElement>('#chat-input');
const sendChatButton = document.querySelector<HTMLButtonElement>('#send-chat-button');
const newChatButton = document.querySelector<HTMLButtonElement>('#new-chat-button');
const retryChatButton = document.querySelector<HTMLButtonElement>('#retry-chat-button');
const cancelChatStreamButton = document.querySelector<HTMLButtonElement>('#cancel-chat-stream-button');
const deleteChatButton = document.querySelector<HTMLButtonElement>('#delete-chat-button');
const chatStatus = document.querySelector<HTMLElement>('#chat-status');
const chatMemoryContext = document.querySelector<HTMLElement>('#chat-memory-context');
const memoryForm = document.querySelector<HTMLFormElement>('#memory-form');
const memoryInput = document.querySelector<HTMLTextAreaElement>('#memory-input');
const memoryTagsInput = document.querySelector<HTMLInputElement>('#memory-tags-input');
const saveMemoryButton = document.querySelector<HTMLButtonElement>('#save-memory-button');
const cancelMemoryEditButton = document.querySelector<HTMLButtonElement>('#cancel-memory-edit-button');
const memorySearchInput = document.querySelector<HTMLInputElement>('#memory-search-input');
const memoryList = document.querySelector<HTMLElement>('#memory-list');
const memoryCount = document.querySelector<HTMLElement>('#memory-count');
const memoryStatus = document.querySelector<HTMLElement>('#memory-status');
const memorySearchMode = document.querySelector<HTMLElement>('#memory-search-mode');
const skillForm = document.querySelector<HTMLFormElement>('#skill-form');
const skillNameInput = document.querySelector<HTMLInputElement>('#skill-name-input');
const skillDescriptionInput = document.querySelector<HTMLInputElement>('#skill-description-input');
const skillTagsInput = document.querySelector<HTMLInputElement>('#skill-tags-input');
const skillStepsInput = document.querySelector<HTMLTextAreaElement>('#skill-steps-input');
const saveSkillButton = document.querySelector<HTMLButtonElement>('#save-skill-button');
const clearSkillButton = document.querySelector<HTMLButtonElement>('#clear-skill-button');
const skillWorkspaceInput = document.querySelector<HTMLInputElement>('#skill-workspace-input');
const skillParamsInput = document.querySelector<HTMLTextAreaElement>('#skill-params-input');
const skillList = document.querySelector<HTMLElement>('#skill-list');
const skillOutput = document.querySelector<HTMLElement>('#skill-output');
const skillCount = document.querySelector<HTMLElement>('#skill-count');
const skillStatus = document.querySelector<HTMLElement>('#skill-status');
const skillApprovalPanel = document.querySelector<HTMLElement>('#skill-approval-panel');
const skillApprovalSummary = document.querySelector<HTMLElement>('#skill-approval-summary');
const skillApprovalPreview = document.querySelector<HTMLElement>('#skill-approval-preview');
const skillApprovalCheckbox = document.querySelector<HTMLInputElement>('#skill-approval-checkbox');
const approveSkillButton = document.querySelector<HTMLButtonElement>('#approve-skill-button');
const cancelSkillApprovalButton = document.querySelector<HTMLButtonElement>('#cancel-skill-approval-button');
const workflowForm = document.querySelector<HTMLFormElement>('#workflow-form');
const workflowNameInput = document.querySelector<HTMLInputElement>('#workflow-name-input');
const workflowDescriptionInput = document.querySelector<HTMLInputElement>('#workflow-description-input');
const workflowStepsInput = document.querySelector<HTMLTextAreaElement>('#workflow-steps-input');
const saveWorkflowButton = document.querySelector<HTMLButtonElement>('#save-workflow-button');
const clearWorkflowButton = document.querySelector<HTMLButtonElement>('#clear-workflow-button');
const workflowWorkspaceInput = document.querySelector<HTMLInputElement>('#workflow-workspace-input');
const workflowParamsInput = document.querySelector<HTMLTextAreaElement>('#workflow-params-input');
const workflowList = document.querySelector<HTMLElement>('#workflow-list');
const workflowOutput = document.querySelector<HTMLElement>('#workflow-output');
const workflowCount = document.querySelector<HTMLElement>('#workflow-count');
const workflowStatus = document.querySelector<HTMLElement>('#workflow-status');
const workflowApprovalPanel = document.querySelector<HTMLElement>('#workflow-approval-panel');
const workflowApprovalSummary = document.querySelector<HTMLElement>('#workflow-approval-summary');
const workflowApprovalPreview = document.querySelector<HTMLElement>('#workflow-approval-preview');
const workflowApprovalCheckbox = document.querySelector<HTMLInputElement>('#workflow-approval-checkbox');
const approveWorkflowButton = document.querySelector<HTMLButtonElement>('#approve-workflow-button');
const cancelWorkflowApprovalButton = document.querySelector<HTMLButtonElement>('#cancel-workflow-approval-button');
const mcpForm = document.querySelector<HTMLFormElement>('#mcp-form');
const mcpNameInput = document.querySelector<HTMLInputElement>('#mcp-name-input');
const mcpCommandInput = document.querySelector<HTMLInputElement>('#mcp-command-input');
const mcpArgsInput = document.querySelector<HTMLTextAreaElement>('#mcp-args-input');
const mcpEnvInput = document.querySelector<HTMLTextAreaElement>('#mcp-env-input');
const saveMcpButton = document.querySelector<HTMLButtonElement>('#save-mcp-button');
const clearMcpButton = document.querySelector<HTMLButtonElement>('#clear-mcp-button');
const mcpList = document.querySelector<HTMLElement>('#mcp-list');
const mcpCount = document.querySelector<HTMLElement>('#mcp-count');
const mcpStatus = document.querySelector<HTMLElement>('#mcp-status');
const mcpToolInput = document.querySelector<HTMLInputElement>('#mcp-tool-input');
const mcpToolArgsInput = document.querySelector<HTMLTextAreaElement>('#mcp-tool-args-input');
const callMcpToolButton = document.querySelector<HTMLButtonElement>('#call-mcp-tool-button');
const mcpOutput = document.querySelector<HTMLElement>('#mcp-output');
const graphifyForm = document.querySelector<HTMLFormElement>('#graphify-form');
const graphifyWorkspaceInput = document.querySelector<HTMLInputElement>('#graphify-workspace-input');
const graphifyMaxFilesInput = document.querySelector<HTMLInputElement>('#graphify-max-files-input');
const buildGraphifyButton = document.querySelector<HTMLButtonElement>('#build-graphify-button');
const loadGraphifyButton = document.querySelector<HTMLButtonElement>('#load-graphify-button');
const graphifySearchInput = document.querySelector<HTMLInputElement>('#graphify-search-input');
const graphifySummary = document.querySelector<HTMLElement>('#graphify-summary');
const graphifyCanvas = document.querySelector<SVGSVGElement>('#graphify-canvas');
const graphifyNodeList = document.querySelector<HTMLElement>('#graphify-node-list');
const graphifyOutput = document.querySelector<HTMLElement>('#graphify-output');
const graphifyCount = document.querySelector<HTMLElement>('#graphify-count');
const graphifyStatus = document.querySelector<HTMLElement>('#graphify-status');
const mediaForm = document.querySelector<HTMLFormElement>('#media-form');
const mediaPathInput = document.querySelector<HTMLInputElement>('#media-path-input');
const mediaTitleInput = document.querySelector<HTMLInputElement>('#media-title-input');
const mediaTagsInput = document.querySelector<HTMLInputElement>('#media-tags-input');
const mediaCopyCheckbox = document.querySelector<HTMLInputElement>('#media-copy-checkbox');
const importMediaButton = document.querySelector<HTMLButtonElement>('#import-media-button');
const clearMediaButton = document.querySelector<HTMLButtonElement>('#clear-media-button');
const mediaSearchInput = document.querySelector<HTMLInputElement>('#media-search-input');
const mediaPreview = document.querySelector<HTMLElement>('#media-preview');
const mediaList = document.querySelector<HTMLElement>('#media-list');
const mediaOutput = document.querySelector<HTMLElement>('#media-output');
const mediaCount = document.querySelector<HTMLElement>('#media-count');
const mediaStatus = document.querySelector<HTMLElement>('#media-status');
const pageNavLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('.sidebar-nav a[data-page-target]'));
const pageSections = Array.from(document.querySelectorAll<HTMLElement>('[data-page]'));

let chatSessions: DesktopChatSession[] = [];
let activeChatSessionId = '';
let activeChatStreamRequestId = '';
let activeChatStreamRollbackSession: DesktopChatSession | null = null;
let activeChatStreamTemporarySessionId = '';
let lastChatRetry: { sessionId: string; message: string; attachments: DesktopChatAttachment[] } | null = null;
let pendingChatAttachments: DesktopChatAttachment[] = [];
let activeChatProcesses: ChatProcessEntry[] = [];
const chatProcessHistory = new Map<string, Map<string, ChatProcessEntry[]>>();
let memories: DesktopMemory[] = [];
let memorySearchResults = new Map<string, DesktopMemorySearchResult>();
let memorySearchTimer: number | undefined;
let skills: DesktopSkill[] = [];
let workflows: DesktopWorkflow[] = [];
let mcpServers: DesktopMcpServer[] = [];
let selectedMcpServerName = '';
let graphifyGraph: DesktopGraphifyGraph | null = null;
let mediaAssets: DesktopMediaAsset[] = [];
let editingMemoryId = '';
let pendingSkillRun: {
  name: string;
  workspaceRoot: string;
  params: Record<string, unknown>;
  preview: DesktopSkillPreview;
} | null = null;
let pendingWorkflowRun: {
  name: string;
  workspaceRoot: string;
  params: Record<string, unknown>;
  preview: DesktopWorkflowPreview;
} | null = null;

function showDesktopPage(page: string) {
  const fallback = pageSections.some((section) => section.dataset.page === page) ? page : 'dashboard';
  for (const section of pageSections) {
    const active = section.dataset.page === fallback;
    section.classList.toggle('page-active', active);
    if (active) {
      section.removeAttribute('hidden');
      section.style.removeProperty('display');
      section.style.removeProperty('visibility');
      section.style.removeProperty('opacity');
    } else {
      section.setAttribute('hidden', '');
      section.style.display = 'none';
    }
  }
  for (const link of pageNavLinks) {
    link.classList.toggle('active', link.dataset.pageTarget === fallback);
    link.setAttribute('aria-current', link.dataset.pageTarget === fallback ? 'page' : 'false');
  }
  try {
    window.localStorage.setItem('smara_desktop_active_page', fallback);
  } catch {
    // Local storage is optional in test harnesses and locked-down webviews.
  }
}

function forceVisibleDesktopContent() {
  const pages = document.querySelector<HTMLElement>('.desktop-pages');
  const launcher = document.querySelector<HTMLElement>('.launcher-card');
  const active = document.querySelector<HTMLElement>('.feature-panel.page-active')
    ?? document.querySelector<HTMLElement>('#dashboard-section');
  if (launcher) {
    launcher.style.display = 'flex';
    launcher.style.flexDirection = 'column';
    launcher.style.minHeight = '0';
  }
  if (pages) {
    pages.style.display = 'block';
    pages.style.flex = '1 1 auto';
    pages.style.minHeight = '0';
    pages.style.overflow = 'auto';
  }
  if (active) {
    active.classList.add('page-active');
    active.removeAttribute('hidden');
    active.style.display = 'block';
    active.style.visibility = 'visible';
    active.style.opacity = '1';
  }
}

function initialDesktopPage() {
  const hash = window.location.hash.replace('#', '').replace('-section', '');
  if (hash && pageSections.some((section) => section.dataset.page === hash)) return hash;
  try {
    const saved = window.localStorage.getItem('smara_desktop_active_page') ?? '';
    if (saved && pageSections.some((section) => section.dataset.page === saved)) return saved;
  } catch {
    // ignore
  }
  return 'dashboard';
}

function setStatus(message: string, percent?: number) {
  if (statusText) statusText.textContent = message;
  const dashboardStatus = document.querySelector<HTMLElement>('#dashboard-status');
  if (dashboardStatus) dashboardStatus.textContent = message;
  if (progress && typeof percent === 'number') progress.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

function renderRuntime(runtime: DesktopRuntimeStatus) {
  if (nativeRuntimeSummary) {
    nativeRuntimeSummary.textContent = `${runtime.mode} · ${runtime.native_ready}/${runtime.migration_total} native · v${runtime.version}`;
  }
  if (nativeCapabilities) {
    nativeCapabilities.replaceChildren(...runtime.capabilities.map((capability) => {
      const item = document.createElement('span');
      item.className = capability.ready ? 'capability-ready' : 'capability-pending';
      item.textContent = capability.label;
      return item;
    }));
  }
  if (nativeRuntime) nativeRuntime.hidden = false;
}

function renderProviderConfig(config: DesktopProviderConfig) {
  if (providerSelect) providerSelect.value = config.provider;
  if (providerModelInput) providerModelInput.value = config.model;
  if (providerEndpointInput) providerEndpointInput.value = config.endpoint;
}

async function loadProviderConfig() {
  try {
    const config = await invokeCommand<DesktopProviderConfig>('get_desktop_provider_config');
    renderProviderConfig(config);
  } catch {
    // Provider config is optional during startup.
  }
}

async function saveProviderConfig() {
  const provider = providerSelect?.value || 'custom';
  const model = providerModelInput?.value || '';
  const endpoint = providerEndpointInput?.value || '';
  await invokeCommand<DesktopProviderConfig>('save_desktop_provider_config', { config: { provider, model, endpoint } });
  await refreshProviderHealth();
}

async function refreshProviderHealth() {
  if (providerHealthPanel) providerHealthPanel.hidden = false;
  if (providerState) providerState.textContent = 'memeriksa...';
  if (providerIndicator) providerIndicator.className = 'provider-indicator provider-checking';
  if (refreshProviderButton) refreshProviderButton.disabled = true;

  try {
    const health = await invokeCommand<DesktopProviderHealth>('check_desktop_provider_health');
    if (providerName) providerName.textContent = `${health.provider} · ${health.model}`;
    if (providerState) providerState.textContent = health.online ? 'online' : 'offline';
    if (providerIndicator) {
      providerIndicator.className = `provider-indicator ${health.online ? 'provider-online' : 'provider-offline'}`;
    }
    if (providerDetail) {
      providerDetail.textContent = health.online
        ? `${health.endpoint} · ${health.latency_ms} ms`
        : `${health.endpoint} · ${health.error || 'tidak dapat terhubung'}`;
    }
  } catch (error) {
    if (providerState) providerState.textContent = 'error';
    if (providerIndicator) providerIndicator.className = 'provider-indicator provider-offline';
    if (providerDetail) providerDetail.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    if (refreshProviderButton) refreshProviderButton.disabled = false;
  }
}


function renderChatSessions() {
  if (chatSessionSelect) {
    chatSessionSelect.replaceChildren(new Option('Sesi baru', ''));
    for (const session of chatSessions) {
      chatSessionSelect.append(new Option(session.title, session.id));
    }
    chatSessionSelect.value = activeChatSessionId;
  }
  renderSidebarChatSessions();
  if (deleteChatButton) deleteChatButton.disabled = !activeChatSessionId;
}

function formatSessionTime(timestamp: number) {
  const elapsed = Math.max(0, Date.now() - timestamp);
  if (elapsed < 60_000) return 'baru saja';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}j`;
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(timestamp));
}

function openChatSession(sessionId: string) {
  activeChatSessionId = sessionId;
  showDesktopPage('chat');
  forceVisibleDesktopContent();
  renderChatSessions();
  renderChatMessages();
  chatInput?.focus();
}

function renderSidebarChatSessions() {
  if (!sidebarChatSessionList) return;
  if (chatSessions.length === 0) {
    sidebarChatSessionList.innerHTML = '<p class="sidebar-chat-empty">Belum ada sesi.</p>';
    return;
  }
  sidebarChatSessionList.replaceChildren(...chatSessions.map((session) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sidebar-chat-session';
    button.classList.toggle('active', session.id === activeChatSessionId);
    button.setAttribute('aria-current', session.id === activeChatSessionId ? 'true' : 'false');
    button.title = session.title;
    const title = document.createElement('span');
    title.textContent = session.title || 'Sesi tanpa judul';
    const meta = document.createElement('small');
    meta.textContent = `${session.messages.length} pesan · ${formatSessionTime(session.updated_at_ms)}`;
    button.append(title, meta);
    button.addEventListener('click', () => openChatSession(session.id));
    return button;
  }));
}

function renderChatMessages() {
  if (!chatMessages) return;
  const session = chatSessions.find((item) => item.id === activeChatSessionId);
  if (!session || session.messages.length === 0) {
    chatMessages.innerHTML = '<p class="empty-copy">Kirim pesan untuk memulai sesi Desktop.</p>';
    if (chatMemoryContext) chatMemoryContext.textContent = '';
    return;
  }
  const activeProcessTargetId = activeChatStreamRequestId ? `stream-${activeChatStreamRequestId}` : '';
  const sessionProcessHistory = chatProcessHistory.get(session.id);
  const messageNodes: HTMLElement[] = [];
  for (const message of session.messages) {
    const historicalProcesses = sessionProcessHistory?.get(message.id) ?? [];
    if (historicalProcesses.length > 0) {
      messageNodes.push(renderChatProcess(historicalProcesses, false));
    }
    if (activeChatProcesses.length > 0 && message.id === activeProcessTargetId) {
      messageNodes.push(renderChatProcess(activeChatProcesses, true));
    }
    const item = document.createElement('div');
    item.className = `chat-message chat-message-${message.role}`;
    if (message.id === `stream-${activeChatStreamRequestId}`) {
      item.classList.add('chat-message-streaming');
    }
    const body = document.createElement('div');
    body.className = 'chat-message-body';
    body.textContent = message.content || (message.id === `stream-${activeChatStreamRequestId}` ? 'Menyiapkan jawaban...' : '');
    item.append(body);
    if (message.attachments?.length) {
      item.append(renderChatAttachmentList(message.attachments, false));
    }
    messageNodes.push(item);
  }
  chatMessages.replaceChildren(...messageNodes);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  if (chatMemoryContext) {
    chatMemoryContext.textContent = session.memory_context_count
      ? `${session.memory_context_count} memory relevan dipakai sebagai konteks respons terakhir.`
      : 'Respons terakhir tidak memakai memory.';
  }
}

function attachmentDataUrl(attachment: DesktopChatAttachment) {
  return `data:${attachment.mime};base64,${attachment.data_base64}`;
}

function formatAttachmentBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function renderChatAttachmentList(attachments: DesktopChatAttachment[], removable: boolean) {
  const list = document.createElement('div');
  list.className = removable ? 'chat-attachment-list chat-attachment-list-pending' : 'chat-attachment-list';
  attachments.forEach((attachment, index) => {
    const item = document.createElement('div');
    item.className = 'chat-attachment';
    if (attachment.mime.startsWith('image/')) {
      const image = document.createElement('img');
      image.src = attachmentDataUrl(attachment);
      image.alt = attachment.name;
      item.append(image);
    } else {
      const icon = document.createElement('span');
      icon.className = 'chat-attachment-icon';
      icon.textContent = attachment.name.split('.').pop()?.slice(0, 4).toUpperCase() || 'FILE';
      item.append(icon);
    }
    const meta = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = attachment.name;
    const size = document.createElement('span');
    size.textContent = `${attachment.mime} · ${formatAttachmentBytes(attachment.bytes)}`;
    meta.append(name, size);
    item.append(meta);
    if (removable) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'chat-attachment-remove';
      remove.setAttribute('aria-label', `Hapus ${attachment.name}`);
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        pendingChatAttachments.splice(index, 1);
        renderPendingChatAttachments();
      });
      item.append(remove);
    }
    list.append(item);
  });
  return list;
}

function renderPendingChatAttachments() {
  if (!chatAttachments) return;
  chatAttachments.hidden = pendingChatAttachments.length === 0;
  chatAttachments.replaceChildren(...(pendingChatAttachments.length
    ? [renderChatAttachmentList(pendingChatAttachments, true)]
    : []));
}

function inferAttachmentMime(file: File) {
  if (file.type) return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase();
  const textMimes: Record<string, string> = {
    txt: 'text/plain',
    md: 'text/markdown',
    csv: 'text/csv',
    log: 'text/plain',
    json: 'application/json',
    xml: 'application/xml',
    js: 'application/javascript',
    ts: 'text/plain',
    tsx: 'text/plain',
    jsx: 'text/plain',
    css: 'text/css',
    html: 'text/html',
  };
  return (extension && textMimes[extension]) || 'application/octet-stream';
}

function fileToChatAttachment(file: File): Promise<DesktopChatAttachment> {
  return new Promise((resolve, reject) => {
    if (file.size > 10 * 1024 * 1024) {
      reject(new Error(`${file.name} melebihi batas 10 MB.`));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Gagal membaca ${file.name}.`));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const dataBase64 = result.split(',', 2)[1];
      if (!dataBase64) {
        reject(new Error(`Data ${file.name} tidak valid.`));
        return;
      }
      resolve({
        name: file.name || `clipboard-image-${Date.now()}.png`,
        mime: inferAttachmentMime(file),
        data_base64: dataBase64,
        bytes: file.size,
      });
    };
    reader.readAsDataURL(file);
  });
}

async function addChatFiles(files: File[]) {
  const remaining = Math.max(0, 5 - pendingChatAttachments.length);
  if (remaining === 0) {
    if (chatStatus) chatStatus.textContent = 'Maksimal 5 attachment per pesan.';
    return;
  }
  try {
    const attachments = await Promise.all(files.slice(0, remaining).map(fileToChatAttachment));
    const totalBytes = [...pendingChatAttachments, ...attachments].reduce((total, attachment) => total + attachment.bytes, 0);
    if (totalBytes > 20 * 1024 * 1024) {
      throw new Error('Total attachment melebihi batas 20 MB.');
    }
    pendingChatAttachments.push(...attachments);
    renderPendingChatAttachments();
    if (chatStatus) chatStatus.textContent = `${pendingChatAttachments.length} attachment siap dikirim.`;
  } catch (error) {
    if (chatStatus) chatStatus.textContent = error instanceof Error ? error.message : String(error);
  }
}

function dataUrlToFile(dataUrl: string, name: string) {
  const match = dataUrl.match(/^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;
  try {
    const binary = window.atob(match[2].replace(/\s/g, ''));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new File([bytes], name, { type: match[1] });
  } catch {
    return null;
  }
}

function filesFromClipboard(clipboard: DataTransfer | null) {
  if (!clipboard) return [];
  const files = Array.from(clipboard.files);
  for (const item of Array.from(clipboard.items)) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file && !files.includes(file)) files.push(file);
  }
  if (files.length > 0) return files;

  const html = clipboard.getData('text/html');
  const dataUrl = html.match(/src=["'](data:image\/[^"']+)["']/i)?.[1];
  const image = dataUrl ? dataUrlToFile(dataUrl, `clipboard-image-${Date.now()}.png`) : null;
  return image ? [image] : [];
}

function canvasToPngFile(canvas: HTMLCanvasElement, name: string) {
  return new Promise<File>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Gagal mengubah gambar clipboard menjadi PNG.'));
        return;
      }
      resolve(new File([blob], name, { type: 'image/png' }));
    }, 'image/png');
  });
}

async function readNativeClipboardImage() {
  if (window.__SMARA_E2E_TAURI__) return null;
  try {
    const image = await readClipboardImage();
    const [rgba, size] = await Promise.all([image.rgba(), image.size()]);
    if (!rgba.length || !size.width || !size.height) return null;
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.putImageData(new ImageData(new Uint8ClampedArray(rgba), size.width, size.height), 0, 0);
    return await canvasToPngFile(canvas, `clipboard-image-${Date.now()}.png`);
  } catch {
    return null;
  }
}

async function handleChatPaste(event: ClipboardEvent) {
  const chatPage = document.querySelector<HTMLElement>('#chat-section');
  if (!chatPage?.classList.contains('page-active')) return;
  const files = filesFromClipboard(event.clipboardData);
  if (files.length > 0) {
    event.preventDefault();
    if (chatStatus) chatStatus.textContent = 'Membaca gambar dari clipboard...';
    await addChatFiles(files);
    return;
  }
  const nativeImage = await readNativeClipboardImage();
  if (!nativeImage) return;
  if (chatStatus) chatStatus.textContent = 'Membaca gambar dari clipboard...';
  await addChatFiles([nativeImage]);
}

function chatProcessLabel(kind: string) {
  const labels: Record<string, string> = {
    thinking: 'Thinking',
    analysis: 'Analysis',
    memory: 'Memory',
    skill: 'Skill',
    skill_start: 'Skill',
    skill_done: 'Skill',
    tool_start: 'Tool',
    tool_done: 'Tool',
    complete: 'Complete',
    error: 'Error',
    cancelled: 'Cancelled',
  };
  return labels[kind] ?? kind.replace(/_/g, ' ');
}

function renderChatProcess(processes: ChatProcessEntry[], running: boolean) {
  const details = document.createElement('details');
  details.className = `chat-process${running ? ' chat-process-running' : ''}`;
  details.open = running;

  const summary = document.createElement('summary');
  const state = document.createElement('span');
  state.className = 'chat-process-state';
  state.textContent = running ? chatProcessLabel(processes[processes.length - 1]?.kind ?? 'thinking') : 'Process';
  const count = document.createElement('span');
  count.className = 'chat-process-count';
  count.textContent = running ? 'sedang berjalan' : `${processes.length} langkah`;
  summary.append(state, count);

  const list = document.createElement('div');
  list.className = 'chat-process-list';
  for (const process of processes) {
    const item = document.createElement('div');
    item.className = `chat-process-item chat-process-${process.kind.replace(/_/g, '-')}`;
    const marker = document.createElement('span');
    marker.className = 'chat-process-marker';
    const content = document.createElement('div');
    const label = document.createElement('strong');
    label.textContent = chatProcessLabel(process.kind);
    const body = document.createElement('p');
    body.textContent = process.text;
    content.append(label, body);
    item.append(marker, content);
    list.append(item);
  }
  details.append(summary, list);
  return details;
}

function resetChatProcess() {
  activeChatProcesses = [];
}

function appendChatProcess(kind: string, text: string) {
  const content = text.trim();
  if (!content) return;
  activeChatProcesses.push({ kind, text: content, createdAt: Date.now() });
  activeChatProcesses = activeChatProcesses.slice(-24);
}

function applyChatStreamEvent(event: DesktopChatStreamEvent) {
  if (!activeChatStreamRequestId || event.request_id !== activeChatStreamRequestId) {
    return;
  }

  if (event.kind !== 'delta') {
    appendChatProcess(event.kind, event.delta);
    if (chatStatus) {
      if (event.kind === 'thinking') chatStatus.textContent = 'Thinking...';
      if (event.kind === 'analysis') chatStatus.textContent = 'Menganalisis konteks...';
      if (event.kind === 'memory') chatStatus.textContent = 'Menyimpan self-improvement memory...';
      if (event.kind === 'skill') chatStatus.textContent = 'Memperbarui skill hasil pembelajaran...';
      if (event.kind === 'tool_start') chatStatus.textContent = 'Memanggil tool/provider...';
      if (event.kind === 'tool_done') chatStatus.textContent = 'Tool/provider selesai, menunggu hasil akhir...';
      if (event.kind === 'error') chatStatus.textContent = event.delta;
    }
    renderChatMessages();
    return;
  }

  const session = chatSessions.find((item) => item.id === activeChatSessionId);
  const message = session?.messages.find((item) => item.id === `stream-${event.request_id}`);
  if (!message) return;
  message.content += event.delta;
  renderChatMessages();
  if (chatStatus) chatStatus.textContent = 'Menerima respons streaming...';
}

async function loadChatSessions() {
  chatSessions = await invokeCommand<DesktopChatSession[]>('list_desktop_chat_sessions');
  if (activeChatSessionId && !chatSessions.some((session) => session.id === activeChatSessionId)) {
    activeChatSessionId = '';
  }
  renderChatSessions();
  renderChatMessages();
}

async function sendChatMessage() {
  const message = chatInput?.value.trim();
  if ((!message && pendingChatAttachments.length === 0) || !chatInput) return;
  await sendChatMessageText(message ?? '', activeChatSessionId, [...pendingChatAttachments]);
}

async function sendChatMessageText(message: string, sessionId: string, attachments: DesktopChatAttachment[] = []) {
  if (!chatInput) return;
  if (sendChatButton) sendChatButton.disabled = true;
  if (retryChatButton) retryChatButton.disabled = true;
  if (cancelChatStreamButton) {
    cancelChatStreamButton.hidden = false;
    cancelChatStreamButton.disabled = false;
  }
  const requestId = `chat-stream-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let controlsOwner = true;
  activeChatStreamRequestId = requestId;
  resetChatProcess();
  appendChatProcess('thinking', 'Menyiapkan sesi, memory context, dan koneksi provider.');
  const timestamp = Date.now();
  const temporarySessionId = sessionId || `pending-${requestId}`;
  const existing = chatSessions.find((session) => session.id === sessionId);
  activeChatStreamRollbackSession = existing ?? null;
  activeChatStreamTemporarySessionId = temporarySessionId;
  lastChatRetry = { sessionId: existing?.id ?? '', message, attachments };
  const temporarySession: DesktopChatSession = existing
    ? {
        ...existing,
        messages: [
          ...existing.messages,
          { id: `user-${requestId}`, role: 'user', content: message, attachments, created_at_ms: timestamp },
          { id: `stream-${requestId}`, role: 'assistant', content: '', created_at_ms: timestamp },
        ],
      }
    : {
        id: temporarySessionId,
        title: (message || attachments[0]?.name || 'Attachment').slice(0, 60),
        created_at_ms: timestamp,
        updated_at_ms: timestamp,
        memory_context_count: 0,
        messages: [
          { id: `user-${requestId}`, role: 'user', content: message, attachments, created_at_ms: timestamp },
          { id: `stream-${requestId}`, role: 'assistant', content: '', created_at_ms: timestamp },
        ],
      };
  chatSessions = [temporarySession, ...chatSessions.filter((session) => session.id !== temporarySession.id)];
  activeChatSessionId = temporarySession.id;
  renderChatSessions();
  renderChatMessages();
  chatInput.value = '';
  pendingChatAttachments = [];
  renderPendingChatAttachments();
  if (chatStatus) chatStatus.textContent = 'Menghubungi provider streaming...';
  try {
    const session = await invokeCommand<DesktopChatSession>('stream_desktop_chat', {
      request: {
        session_id: existing?.id ?? null,
        message,
        request_id: requestId,
        attachments,
      },
    });
    if (activeChatStreamRequestId !== requestId) {
      controlsOwner = false;
      return;
    }
    activeChatSessionId = session.id;
    appendChatProcess('complete', 'Respons selesai dan tersimpan di sesi lokal.');
    const assistantMessageId = [...session.messages].reverse().find((message) => message.role === 'assistant')?.id;
    if (assistantMessageId) {
      const sessionHistory = chatProcessHistory.get(session.id) ?? new Map<string, ChatProcessEntry[]>();
      sessionHistory.set(assistantMessageId, [...activeChatProcesses]);
      chatProcessHistory.set(session.id, sessionHistory);
    }
    activeChatStreamRequestId = '';
    activeChatStreamRollbackSession = null;
    await Promise.all([loadChatSessions(), loadMemories(), loadSkills()]);
    if (chatStatus) chatStatus.textContent = 'Streaming selesai dan respons tersimpan secara lokal.';
    if (retryChatButton) retryChatButton.disabled = false;
  } catch (error) {
    if (activeChatStreamRequestId && activeChatStreamRequestId !== requestId) {
      controlsOwner = false;
      return;
    }
    activeChatStreamRequestId = '';
    chatSessions = existing
      ? [existing, ...chatSessions.filter((session) => session.id !== existing.id)]
      : chatSessions.filter((session) => session.id !== temporarySessionId);
    activeChatSessionId = existing?.id ?? '';
    pendingChatAttachments = attachments;
    renderPendingChatAttachments();
    renderChatSessions();
    renderChatMessages();
    const messageText = error instanceof Error ? error.message : String(error);
    if (chatStatus) {
      chatStatus.textContent = /cancelled|dibatalkan/i.test(messageText)
        ? 'Streaming dibatalkan. Pesan terakhir bisa dicoba ulang.'
        : messageText;
    }
    if (retryChatButton) retryChatButton.disabled = !lastChatRetry;
  } finally {
    if (controlsOwner) {
      if (sendChatButton) sendChatButton.disabled = false;
      if (cancelChatStreamButton) {
        cancelChatStreamButton.hidden = true;
        cancelChatStreamButton.disabled = false;
      }
    }
  }
}

async function cancelActiveChatStream() {
  const requestId = activeChatStreamRequestId;
  if (!requestId) return;
  if (cancelChatStreamButton) cancelChatStreamButton.disabled = true;
  try {
    await invokeCommand<boolean>('cancel_desktop_chat_stream', { requestId });
  } catch {
    await invokeCommand<boolean>('cancel_desktop_chat_stream', { request_id: requestId }).catch(() => false);
  }
  activeChatStreamRequestId = '';
  chatSessions = activeChatStreamRollbackSession
    ? [activeChatStreamRollbackSession, ...chatSessions.filter((session) => session.id !== activeChatStreamRollbackSession?.id)]
    : chatSessions.filter((session) => session.id !== activeChatStreamTemporarySessionId);
  activeChatSessionId = activeChatStreamRollbackSession?.id ?? '';
  pendingChatAttachments = lastChatRetry?.attachments ?? [];
  renderPendingChatAttachments();
  activeChatStreamRollbackSession = null;
  activeChatStreamTemporarySessionId = '';
  renderChatSessions();
  renderChatMessages();
  if (chatStatus) chatStatus.textContent = 'Streaming dibatalkan. Pesan terakhir bisa dicoba ulang.';
  if (retryChatButton) retryChatButton.disabled = !lastChatRetry;
  if (sendChatButton) sendChatButton.disabled = false;
  if (cancelChatStreamButton) cancelChatStreamButton.hidden = true;
}

async function retryLastChat() {
  if (!lastChatRetry) return;
  activeChatSessionId = lastChatRetry.sessionId;
  await sendChatMessageText(lastChatRetry.message, lastChatRetry.sessionId, lastChatRetry.attachments);
}

async function deleteActiveChatSession() {
  if (!activeChatSessionId) return;
  if (deleteChatButton) deleteChatButton.disabled = true;
  try {
    await invokeCommand<boolean>('delete_desktop_chat_session', { id: activeChatSessionId });
    activeChatSessionId = '';
    await loadChatSessions();
    if (chatStatus) chatStatus.textContent = 'Sesi Chat dihapus dari Desktop.';
  } catch (error) {
    if (chatStatus) chatStatus.textContent = error instanceof Error ? error.message : String(error);
  }
}

function resetMemoryForm() {
  editingMemoryId = '';
  if (memoryInput) memoryInput.value = '';
  if (memoryTagsInput) memoryTagsInput.value = '';
  if (saveMemoryButton) saveMemoryButton.textContent = 'Simpan memory';
  if (cancelMemoryEditButton) cancelMemoryEditButton.hidden = true;
}

function editMemory(memory: DesktopMemory) {
  editingMemoryId = memory.id;
  if (memoryInput) memoryInput.value = memory.content;
  if (memoryTagsInput) memoryTagsInput.value = memory.tags.join(', ');
  if (saveMemoryButton) saveMemoryButton.textContent = 'Perbarui memory';
  if (cancelMemoryEditButton) cancelMemoryEditButton.hidden = false;
  memoryInput?.focus();
}

function renderMemories() {
  if (memoryCount) memoryCount.textContent = String(memories.length);
  if (!memoryList) return;
  if (memories.length === 0) {
    memoryList.innerHTML = '<p class="empty-copy">Belum ada memory tersimpan.</p>';
    return;
  }
  memoryList.replaceChildren(
    ...memories.map((memory) => {
      const item = document.createElement('article');
      item.className = 'memory-item';
      const searchResult = memorySearchResults.get(memory.id);
      if (searchResult) {
        const relevance = document.createElement('span');
        relevance.className = `memory-score memory-score-${searchResult.match_kind}`;
        relevance.textContent = `${searchResult.match_kind} · ${Math.round(searchResult.score * 100)}%`;
        item.append(relevance);
      }
      const content = document.createElement('p');
      content.textContent = memory.content;
      const footer = document.createElement('footer');
      const tags = document.createElement('span');
      tags.textContent = memory.tags.length ? memory.tags.join(' · ') : 'tanpa tag';
      const actions = document.createElement('div');
      actions.className = 'item-actions';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'secondary-button';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => editMemory(memory));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'danger-button';
      remove.textContent = 'Hapus';
      remove.addEventListener('click', () => void deleteMemory(memory.id));
      actions.append(edit, remove);
      footer.append(tags, actions);
      item.append(content, footer);
      return item;
    }),
  );
}

async function loadMemories(query = '') {
  if (query.trim()) {
    const results = await invokeCommand<DesktopMemorySearchResult[]>('search_desktop_memories_ranked', { query });
    memories = results.map((result) => result.memory);
    memorySearchResults = new Map(results.map((result) => [result.memory.id, result]));
    if (memorySearchMode) {
      memorySearchMode.textContent = `${results.length} hasil hybrid semantic lokal, diurutkan berdasarkan relevansi.`;
    }
  } else {
    memories = await invokeCommand<DesktopMemory[]>('list_desktop_memories');
    memorySearchResults.clear();
    if (memorySearchMode) {
      memorySearchMode.textContent = 'Urutan terbaru. Ketik pertanyaan untuk hybrid semantic ranking lokal.';
    }
  }
  renderMemories();
}

function scheduleMemorySearch(query: string) {
  window.clearTimeout(memorySearchTimer);
  memorySearchTimer = window.setTimeout(() => {
    void loadMemories(query).catch((error) => {
      if (memoryStatus) memoryStatus.textContent = error instanceof Error ? error.message : String(error);
    });
  }, 180);
}

async function saveMemory() {
  const content = memoryInput?.value.trim();
  if (!content || !memoryInput) return;
  if (saveMemoryButton) saveMemoryButton.disabled = true;
  try {
    const request = {
      content,
      tags: memoryTagsInput?.value.split(',').map((tag) => tag.trim()).filter(Boolean) ?? [],
    };
    if (editingMemoryId) {
      await invokeCommand<DesktopMemory>('update_desktop_memory', {
        request: { id: editingMemoryId, ...request },
      });
    } else {
      await invokeCommand<DesktopMemory>('create_desktop_memory', { request });
    }
    resetMemoryForm();
    if (memorySearchInput) memorySearchInput.value = '';
    await loadMemories();
    if (memoryStatus) memoryStatus.textContent = 'Memory tersimpan secara lokal.';
  } catch (error) {
    if (memoryStatus) memoryStatus.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    if (saveMemoryButton) saveMemoryButton.disabled = false;
  }
}

async function deleteMemory(id: string) {
  await invokeCommand<boolean>('delete_desktop_memory', { id });
  if (editingMemoryId === id) resetMemoryForm();
  await loadMemories(memorySearchInput?.value ?? '');
}

function parseJsonObject(raw: string, label: string): Record<string, unknown> {
  const parsed = JSON.parse(raw || '{}');
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error(`${label} harus berupa JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function renderSkills() {
  if (skillCount) skillCount.textContent = String(skills.length);
  if (!skillList) return;
  if (skills.length === 0) {
    skillList.innerHTML = '<p class="empty-copy">Belum ada skill tersimpan.</p>';
    return;
  }
  skillList.replaceChildren(
    ...skills.map((skill) => {
      const item = document.createElement('article');
      item.className = 'skill-item';
      const detail = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = `${skill.name} · v${skill.version}`;
      const mutatingTools = skill.steps.filter((step) =>
        ['write_file', 'edit_file', 'delete_file'].includes(step.tool),
      );
      if (mutatingTools.length) {
        const risk = document.createElement('span');
        risk.className = 'risk-badge';
        risk.textContent = `${mutatingTools.length} mutasi`;
        detail.append(title, risk);
      } else {
        detail.append(title);
      }
      const description = document.createElement('p');
      description.textContent = `${skill.description || 'Tanpa deskripsi'} · ${skill.steps.map((step) => step.tool).join(' → ')}`;
      detail.append(description);
      const actions = document.createElement('div');
      const run = document.createElement('button');
      run.type = 'button';
      run.textContent = 'Jalankan';
      run.addEventListener('click', () => void runSkill(skill.name));
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'secondary-button';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => editSkill(skill));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'danger-button';
      remove.textContent = 'Hapus';
      remove.addEventListener('click', () => void deleteSkill(skill.name));
      actions.append(run, edit, remove);
      item.append(detail, actions);
      return item;
    }),
  );
}

function clearSkillForm() {
  if (skillNameInput) skillNameInput.value = '';
  if (skillDescriptionInput) skillDescriptionInput.value = '';
  if (skillTagsInput) skillTagsInput.value = '';
  if (skillStepsInput) skillStepsInput.value = '[]';
  if (saveSkillButton) saveSkillButton.textContent = 'Simpan skill';
}

function editSkill(skill: DesktopSkill) {
  if (skillNameInput) skillNameInput.value = skill.name;
  if (skillDescriptionInput) skillDescriptionInput.value = skill.description;
  if (skillTagsInput) skillTagsInput.value = skill.tags.join(', ');
  if (skillStepsInput) skillStepsInput.value = JSON.stringify(skill.steps, null, 2);
  if (saveSkillButton) saveSkillButton.textContent = `Perbarui ${skill.name}`;
  skillNameInput?.focus();
}

async function loadSkills() {
  skills = await invokeCommand<DesktopSkill[]>('list_desktop_skills');
  renderSkills();
}

async function saveSkill() {
  const name = skillNameInput?.value.trim();
  if (!name || !skillStepsInput) return;
  if (saveSkillButton) saveSkillButton.disabled = true;
  try {
    const steps = JSON.parse(skillStepsInput.value);
    if (!Array.isArray(steps)) throw new Error('Steps harus berupa JSON array.');
    await invokeCommand<DesktopSkill>('save_desktop_skill', {
      request: {
        name,
        description: skillDescriptionInput?.value ?? '',
        tags: skillTagsInput?.value.split(',').map((tag) => tag.trim()).filter(Boolean) ?? [],
        steps,
      },
    });
    await loadSkills();
    if (skillStatus) skillStatus.textContent = 'Skill tersimpan di storage Desktop.';
  } catch (error) {
    if (skillStatus) skillStatus.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    if (saveSkillButton) saveSkillButton.disabled = false;
  }
}

function closeSkillApproval() {
  pendingSkillRun = null;
  if (skillApprovalPanel) skillApprovalPanel.hidden = true;
  if (skillApprovalCheckbox) skillApprovalCheckbox.checked = false;
  if (approveSkillButton) approveSkillButton.disabled = true;
}

function showSkillApproval(
  name: string,
  workspaceRoot: string,
  params: Record<string, unknown>,
  preview: DesktopSkillPreview,
) {
  pendingSkillRun = { name, workspaceRoot, params, preview };
  if (skillApprovalSummary) {
    skillApprovalSummary.textContent =
      `${preview.mutation_count} langkah akan mengubah workspace ${preview.workspace_root}. Receipt terikat ke Skill/workspace dan kedaluwarsa maksimal lima menit.`;
  }
  if (skillApprovalPreview) {
    skillApprovalPreview.textContent = preview.steps
      .map((step) => `${step.index}. ${step.tool}${step.requires_approval ? ' [MUTASI]' : ''}\n${JSON.stringify(step.args, null, 2)}`)
      .join('\n\n');
  }
  if (skillApprovalPanel) skillApprovalPanel.hidden = false;
  if (skillApprovalCheckbox) skillApprovalCheckbox.checked = false;
  if (approveSkillButton) approveSkillButton.disabled = true;
}

async function executeSkill(
  name: string,
  workspaceRoot: string,
  params: Record<string, unknown>,
  approved: boolean,
) {
  const approval = approved
    ? {
        skill_name: name,
        workspace_root: workspaceRoot,
        approved: true,
        approved_at_ms: Date.now(),
        summary: `User approved workspace mutations for Desktop skill '${name}'.`,
      }
    : null;
  const result = await invokeCommand<DesktopSkillRunResult>('run_desktop_skill', {
    request: { name, workspace_root: workspaceRoot, params, approval },
  });
  if (skillOutput) {
    skillOutput.textContent = result.outputs
      .map((output, index) => `# ${index + 1} ${output.tool}${output.mutated ? ' [MUTASI]' : ''}\n${output.output || '(tanpa output)'}`)
      .join('\n\n');
  }
  if (skillStatus) skillStatus.textContent = result.summary;
}

async function runSkill(name: string) {
  const workspaceRoot = skillWorkspaceInput?.value.trim();
  if (!workspaceRoot) {
    if (skillStatus) skillStatus.textContent = 'Isi path absolut workspace sebelum menjalankan skill.';
    return;
  }
  if (skillStatus) skillStatus.textContent = `Menjalankan ${name}...`;
  try {
    const params = parseJsonObject(skillParamsInput?.value ?? '{}', 'Params');
    const preview = await invokeCommand<DesktopSkillPreview>('preview_desktop_skill', {
      request: {
        name,
        workspace_root: workspaceRoot,
        params,
        approval: null,
      },
    });
    if (preview.requires_approval) {
      showSkillApproval(name, workspaceRoot, params, preview);
      if (skillStatus) skillStatus.textContent = 'Tinjau perubahan workspace sebelum memberikan persetujuan.';
      return;
    }
    await executeSkill(name, workspaceRoot, params, false);
  } catch (error) {
    if (skillStatus) skillStatus.textContent = error instanceof Error ? error.message : String(error);
  }
}

async function deleteSkill(name: string) {
  await invokeCommand<boolean>('delete_desktop_skill', { name });
  await loadSkills();
}

function clearWorkflowForm() {
  if (workflowNameInput) workflowNameInput.value = '';
  if (workflowDescriptionInput) workflowDescriptionInput.value = '';
  if (workflowStepsInput) workflowStepsInput.value = '[]';
  if (saveWorkflowButton) saveWorkflowButton.textContent = 'Simpan workflow';
}

function editWorkflow(workflow: DesktopWorkflow) {
  if (workflowNameInput) workflowNameInput.value = workflow.name;
  if (workflowDescriptionInput) workflowDescriptionInput.value = workflow.description;
  if (workflowStepsInput) workflowStepsInput.value = JSON.stringify(workflow.steps, null, 2);
  if (saveWorkflowButton) saveWorkflowButton.textContent = `Perbarui ${workflow.name}`;
  workflowNameInput?.focus();
}

function renderWorkflows() {
  if (workflowCount) workflowCount.textContent = String(workflows.length);
  if (!workflowList) return;
  if (!workflows.length) {
    workflowList.innerHTML = '<p class="empty-copy">Belum ada workflow tersimpan.</p>';
    return;
  }
  workflowList.replaceChildren(...workflows.map((workflow) => {
    const item = document.createElement('article');
    item.className = 'automation-item';
    const detail = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = `${workflow.name} · v${workflow.version}`;
    const description = document.createElement('p');
    description.textContent = `${workflow.description || 'Tanpa deskripsi'} · ${workflow.steps.map((step) =>
      step.kind === 'mcp' ? `${step.server_name}:${step.target}` : step.target).join(' → ')}`;
    detail.append(title, description);
    const actions = document.createElement('div');
    const run = document.createElement('button');
    run.type = 'button';
    run.textContent = 'Jalankan';
    run.addEventListener('click', () => void runWorkflow(workflow.name));
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'secondary-button';
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => editWorkflow(workflow));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'danger-button';
    remove.textContent = 'Hapus';
    remove.addEventListener('click', () => void deleteWorkflow(workflow.name));
    actions.append(run, edit, remove);
    item.append(detail, actions);
    return item;
  }));
}

async function loadWorkflows() {
  workflows = await invokeCommand<DesktopWorkflow[]>('list_desktop_workflows');
  renderWorkflows();
}

async function saveWorkflow() {
  const name = workflowNameInput?.value.trim();
  if (!name || !workflowStepsInput) return;
  if (saveWorkflowButton) saveWorkflowButton.disabled = true;
  try {
    const steps = JSON.parse(workflowStepsInput.value);
    if (!Array.isArray(steps)) throw new Error('Workflow steps harus berupa JSON array.');
    await invokeCommand<DesktopWorkflow>('save_desktop_workflow', {
      request: { name, description: workflowDescriptionInput?.value ?? '', steps },
    });
    await loadWorkflows();
    if (workflowStatus) workflowStatus.textContent = 'Workflow tersimpan secara lokal.';
  } catch (error) {
    if (workflowStatus) workflowStatus.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    if (saveWorkflowButton) saveWorkflowButton.disabled = false;
  }
}

function closeWorkflowApproval() {
  pendingWorkflowRun = null;
  if (workflowApprovalPanel) workflowApprovalPanel.hidden = true;
  if (workflowApprovalCheckbox) workflowApprovalCheckbox.checked = false;
  if (approveWorkflowButton) approveWorkflowButton.disabled = true;
}

function showWorkflowApproval(
  name: string,
  workspaceRoot: string,
  params: Record<string, unknown>,
  preview: DesktopWorkflowPreview,
) {
  pendingWorkflowRun = { name, workspaceRoot, params, preview };
  if (workflowApprovalSummary) {
    workflowApprovalSummary.textContent =
      `${preview.risky_step_count} langkah memerlukan persetujuan untuk workspace ${preview.workspace_root}.`;
  }
  if (workflowApprovalPreview) {
    workflowApprovalPreview.textContent = preview.steps.map((step) =>
      `${step.index}. ${step.kind}:${step.server_name ? `${step.server_name}:` : ''}${step.target}` +
      `${step.parallel_group ? ` [parallel:${step.parallel_group}]` : ''}` +
      `${step.skipped ? ' [SKIP]' : step.requires_approval ? ' [PERSETUJUAN]' : ''}\n${JSON.stringify(step.args, null, 2)}`,
    ).join('\n\n');
  }
  if (workflowApprovalPanel) workflowApprovalPanel.hidden = false;
}

async function executeWorkflow(
  name: string,
  workspaceRoot: string,
  params: Record<string, unknown>,
  approved: boolean,
) {
  const approval = approved ? {
    workflow_name: name,
    workspace_root: workspaceRoot,
    approved: true,
    approved_at_ms: Date.now(),
    summary: `User approved Desktop workflow '${name}'.`,
  } : null;
  const result = await invokeCommand<DesktopWorkflowRunResult>('run_desktop_workflow', {
    request: { name, workspace_root: workspaceRoot, params, approval },
  });
  if (workflowOutput) {
    workflowOutput.textContent = result.outputs.map((output) =>
      `# ${output.index} ${output.kind}:${output.target}${output.mutated ? ' [BERISIKO]' : ''}\n${output.output || '(tanpa output)'}`,
    ).join('\n\n');
  }
  if (workflowStatus) workflowStatus.textContent = result.summary;
}

async function runWorkflow(name: string) {
  const workspaceRoot = workflowWorkspaceInput?.value.trim();
  if (!workspaceRoot) {
    if (workflowStatus) workflowStatus.textContent = 'Isi path absolut workspace sebelum menjalankan workflow.';
    return;
  }
  try {
    const params = parseJsonObject(workflowParamsInput?.value ?? '{}', 'Workflow params');
    const preview = await invokeCommand<DesktopWorkflowPreview>('preview_desktop_workflow', {
      request: { name, workspace_root: workspaceRoot, params, approval: null },
    });
    if (preview.requires_approval) {
      showWorkflowApproval(name, workspaceRoot, params, preview);
      if (workflowStatus) workflowStatus.textContent = 'Tinjau langkah berisiko sebelum menjalankan workflow.';
      return;
    }
    await executeWorkflow(name, workspaceRoot, params, false);
  } catch (error) {
    if (workflowStatus) workflowStatus.textContent = error instanceof Error ? error.message : String(error);
  }
}

async function deleteWorkflow(name: string) {
  await invokeCommand<boolean>('delete_desktop_workflow', { name });
  await loadWorkflows();
}

function clearMcpForm() {
  if (mcpNameInput) mcpNameInput.value = '';
  if (mcpCommandInput) mcpCommandInput.value = '';
  if (mcpArgsInput) mcpArgsInput.value = '[]';
  if (mcpEnvInput) mcpEnvInput.value = '{}';
  if (saveMcpButton) saveMcpButton.textContent = 'Simpan server';
}

function editMcpServer(server: DesktopMcpServer) {
  if (mcpNameInput) mcpNameInput.value = server.name;
  if (mcpCommandInput) mcpCommandInput.value = server.command;
  if (mcpArgsInput) mcpArgsInput.value = JSON.stringify(server.args, null, 2);
  if (mcpEnvInput) mcpEnvInput.value = JSON.stringify(server.env, null, 2);
  if (saveMcpButton) saveMcpButton.textContent = `Perbarui ${server.name}`;
}

function renderMcpServers() {
  if (mcpCount) mcpCount.textContent = String(mcpServers.length);
  if (!mcpList) return;
  if (!mcpServers.length) {
    mcpList.innerHTML = '<p class="empty-copy">Belum ada MCP server tersimpan.</p>';
    return;
  }
  mcpList.replaceChildren(...mcpServers.map((server) => {
    const item = document.createElement('article');
    item.className = 'automation-item';
    const detail = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = server.name;
    const command = document.createElement('p');
    command.textContent = [server.command, ...server.args].join(' ');
    detail.append(title, command);
    const actions = document.createElement('div');
    const check = document.createElement('button');
    check.type = 'button';
    check.textContent = 'Hubungkan';
    check.addEventListener('click', () => void checkMcpServer(server.name));
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'secondary-button';
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => editMcpServer(server));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'danger-button';
    remove.textContent = 'Hapus';
    remove.addEventListener('click', () => void deleteMcpServer(server.name));
    actions.append(check, edit, remove);
    item.append(detail, actions);
    return item;
  }));
}

async function loadMcpServers() {
  mcpServers = await invokeCommand<DesktopMcpServer[]>('list_desktop_mcp_servers');
  if (selectedMcpServerName && !mcpServers.some((server) => server.name === selectedMcpServerName)) {
    selectedMcpServerName = '';
    if (callMcpToolButton) callMcpToolButton.disabled = true;
  }
  renderMcpServers();
}

async function saveMcpServer() {
  const name = mcpNameInput?.value.trim();
  const command = mcpCommandInput?.value.trim();
  if (!name || !command) return;
  if (saveMcpButton) saveMcpButton.disabled = true;
  try {
    const args = JSON.parse(mcpArgsInput?.value || '[]');
    const env = parseJsonObject(mcpEnvInput?.value ?? '{}', 'MCP env');
    if (!Array.isArray(args) || !args.every((value) => typeof value === 'string')) {
      throw new Error('MCP args harus berupa JSON array berisi string.');
    }
    await invokeCommand<DesktopMcpServer>('save_desktop_mcp_server', {
      request: { name, command, args, env },
    });
    await loadMcpServers();
    if (mcpStatus) mcpStatus.textContent = 'Konfigurasi MCP tersimpan secara lokal.';
  } catch (error) {
    if (mcpStatus) mcpStatus.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    if (saveMcpButton) saveMcpButton.disabled = false;
  }
}

async function checkMcpServer(name: string) {
  selectedMcpServerName = name;
  if (mcpStatus) mcpStatus.textContent = `Menghubungkan ${name}...`;
  const health = await invokeCommand<DesktopMcpHealth>('check_desktop_mcp_server', { name });
  if (mcpOutput) {
    mcpOutput.textContent = health.online
      ? `ONLINE · ${health.protocol_version} · ${health.latency_ms} ms\n\n${health.tools.map((tool) =>
          `${tool.name}\n${tool.description || 'Tanpa deskripsi'}`).join('\n\n') || 'Server tidak menyediakan tools.'}`
      : `OFFLINE\n${health.error || 'Tidak dapat terhubung.'}`;
  }
  if (mcpStatus) mcpStatus.textContent = health.online
    ? `${name} online dengan ${health.tools.length} tool.`
    : `${name} offline.`;
  if (callMcpToolButton) callMcpToolButton.disabled = !health.online;
}

async function callMcpTool() {
  const tool = mcpToolInput?.value.trim();
  if (!selectedMcpServerName || !tool) return;
  try {
    const argumentsValue = parseJsonObject(mcpToolArgsInput?.value ?? '{}', 'MCP tool arguments');
    const result = await invokeCommand<DesktopMcpToolResult>('call_desktop_mcp_tool', {
      request: { server_name: selectedMcpServerName, tool, arguments: argumentsValue },
    });
    if (mcpOutput) mcpOutput.textContent = JSON.stringify(result.content, null, 2);
    if (mcpStatus) mcpStatus.textContent = result.is_error ? 'MCP tool mengembalikan error.' : 'MCP tool selesai.';
  } catch (error) {
    if (mcpStatus) mcpStatus.textContent = error instanceof Error ? error.message : String(error);
  }
}

async function deleteMcpServer(name: string) {
  await invokeCommand<boolean>('delete_desktop_mcp_server', { name });
  await loadMcpServers();
}

function renderGraphify(nodes: DesktopGraphNode[] = graphifyGraph?.nodes.slice(0, 50) ?? []) {
  if (graphifyCount) graphifyCount.textContent = `${graphifyGraph?.node_count ?? 0} nodes`;
  if (graphifySummary) {
    graphifySummary.textContent = graphifyGraph
      ? `${graphifyGraph.file_count} file · ${graphifyGraph.node_count} nodes · ${graphifyGraph.edge_count} edges · ${graphifyGraph.workspace_root}`
      : 'Belum ada graph.';
  }
  if (graphifyOutput) graphifyOutput.textContent = graphifyGraph?.report ?? 'Report Graphify akan tampil di sini.';
  renderGraphifyCanvas(nodes);
  if (!graphifyNodeList) return;
  if (!nodes.length) {
    graphifyNodeList.innerHTML = '<p class="empty-copy">Tidak ada node yang cocok.</p>';
    return;
  }
  graphifyNodeList.replaceChildren(...nodes.map((node) => {
    const item = document.createElement('article');
    item.className = 'automation-item';
    const detail = document.createElement('div');
    const title = document.createElement('strong');
    const kind = document.createElement('span');
    kind.className = 'graph-node-kind';
    kind.textContent = node.kind;
    title.append(kind, node.label);
    const meta = document.createElement('p');
    meta.textContent = `${node.path || 'global'} · weight ${node.weight}`;
    detail.append(title, meta);
    item.append(detail);
    return item;
  }));
}

function renderGraphifyCanvas(nodes: DesktopGraphNode[]) {
  if (!graphifyCanvas) return;
  graphifyCanvas.replaceChildren();
  if (!graphifyGraph || !nodes.length) return;
  const visibleNodes = nodes.slice(0, 28);
  const ids = new Set(visibleNodes.map((node) => node.id));
  const width = 720;
  const height = 280;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = 105;
  const positions = new Map<string, { x: number; y: number }>();
  visibleNodes.forEach((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(visibleNodes.length, 1);
    positions.set(node.id, {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    });
  });
  const namespace = 'http://www.w3.org/2000/svg';
  for (const edge of graphifyGraph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)).slice(0, 60)) {
    const source = positions.get(edge.source);
    const target = positions.get(edge.target);
    if (!source || !target) continue;
    const line = document.createElementNS(namespace, 'line');
    line.setAttribute('class', 'graph-edge');
    line.setAttribute('x1', String(source.x));
    line.setAttribute('y1', String(source.y));
    line.setAttribute('x2', String(target.x));
    line.setAttribute('y2', String(target.y));
    graphifyCanvas.append(line);
  }
  for (const node of visibleNodes) {
    const position = positions.get(node.id);
    if (!position) continue;
    const group = document.createElementNS(namespace, 'g');
    group.setAttribute('class', `graph-node graph-node-${node.kind}`);
    const circle = document.createElementNS(namespace, 'circle');
    circle.setAttribute('cx', String(position.x));
    circle.setAttribute('cy', String(position.y));
    circle.setAttribute('r', String(Math.min(16, 6 + node.weight)));
    const text = document.createElementNS(namespace, 'text');
    text.setAttribute('x', String(position.x + 10));
    text.setAttribute('y', String(position.y + 4));
    text.textContent = node.label.slice(0, 22);
    group.append(circle, text);
    graphifyCanvas.append(group);
  }
}

async function loadGraphify() {
  graphifyGraph = await invokeCommand<DesktopGraphifyGraph | null>('get_desktop_graphify');
  if (graphifyGraph && graphifyWorkspaceInput && !graphifyWorkspaceInput.value) {
    graphifyWorkspaceInput.value = graphifyGraph.workspace_root;
  }
  renderGraphify();
}

async function buildGraphify() {
  const workspaceRoot = graphifyWorkspaceInput?.value.trim();
  if (!workspaceRoot) return;
  if (buildGraphifyButton) buildGraphifyButton.disabled = true;
  if (graphifyStatus) graphifyStatus.textContent = 'Membangun knowledge graph lokal...';
  try {
    const maxFilesRaw = Number(graphifyMaxFilesInput?.value || 0);
    graphifyGraph = await invokeCommand<DesktopGraphifyGraph>('build_desktop_graphify', {
      request: {
        workspace_root: workspaceRoot,
        max_files: Number.isFinite(maxFilesRaw) && maxFilesRaw > 0 ? maxFilesRaw : null,
      },
    });
    renderGraphify();
    if (graphifyStatus) graphifyStatus.textContent = 'Graphify native selesai.';
  } catch (error) {
    if (graphifyStatus) graphifyStatus.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    if (buildGraphifyButton) buildGraphifyButton.disabled = false;
  }
}

async function searchGraphify() {
  const workspaceRoot = graphifyWorkspaceInput?.value.trim();
  const query = graphifySearchInput?.value.trim() ?? '';
  if (!workspaceRoot || !graphifyGraph) {
    renderGraphify();
    return;
  }
  try {
    const nodes = await invokeCommand<DesktopGraphNode[]>('search_desktop_graphify', {
      request: { workspace_root: workspaceRoot, query },
    });
    renderGraphify(nodes);
  } catch {
    const needle = query.toLowerCase();
    renderGraphify(graphifyGraph.nodes.filter((node) =>
      node.label.toLowerCase().includes(needle)
      || node.kind.toLowerCase().includes(needle)
      || node.path.toLowerCase().includes(needle),
    ).slice(0, 50));
  }
}

function renderMediaPreview(asset: DesktopMediaAsset) {
  if (!mediaPreview) return;
  mediaPreview.replaceChildren();
  const source = fileAssetUrl(asset.stored_path || asset.source_path);
  if (asset.kind === 'image') {
    const image = document.createElement('img');
    image.src = source;
    image.alt = asset.title;
    mediaPreview.append(image);
  } else if (asset.kind === 'audio') {
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = source;
    mediaPreview.append(audio);
  } else if (asset.kind === 'video') {
    const video = document.createElement('video');
    video.controls = true;
    video.src = source;
    mediaPreview.append(video);
  } else {
    const documentPreview = document.createElement('p');
    documentPreview.textContent = `Dokumen: ${asset.file_name}\n${asset.stored_path || asset.source_path}`;
    mediaPreview.append(documentPreview);
  }
}

function renderMedia(items = mediaAssets) {
  if (mediaCount) mediaCount.textContent = String(mediaAssets.length);
  if (!mediaList) return;
  if (!items.length) {
    mediaList.innerHTML = '<p class="empty-copy">Belum ada media yang cocok.</p>';
    return;
  }
  mediaList.replaceChildren(...items.map((asset) => {
    const item = document.createElement('article');
    item.className = 'automation-item';
    const detail = document.createElement('div');
    const title = document.createElement('strong');
    const kind = document.createElement('span');
    kind.className = 'media-kind';
    kind.textContent = asset.kind;
    title.append(kind, asset.title);
    const meta = document.createElement('p');
    meta.textContent = `${asset.file_name} · ${asset.mime} · ${asset.bytes} bytes · ${asset.tags.join(', ') || 'tanpa tag'}`;
    detail.append(title, meta);
    const actions = document.createElement('div');
    const inspect = document.createElement('button');
    inspect.type = 'button';
    inspect.className = 'secondary-button';
    inspect.textContent = 'Detail';
    inspect.addEventListener('click', () => {
      renderMediaPreview(asset);
      if (mediaOutput) mediaOutput.textContent = JSON.stringify(asset, null, 2);
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'danger-button';
    remove.textContent = 'Hapus';
    remove.addEventListener('click', () => void deleteMedia(asset.id));
    actions.append(inspect, remove);
    item.append(detail, actions);
    return item;
  }));
}

async function loadMedia() {
  mediaAssets = await invokeCommand<DesktopMediaAsset[]>('list_desktop_media');
  renderMedia();
}

function clearMediaForm() {
  if (mediaPathInput) mediaPathInput.value = '';
  if (mediaTitleInput) mediaTitleInput.value = '';
  if (mediaTagsInput) mediaTagsInput.value = '';
  if (mediaCopyCheckbox) mediaCopyCheckbox.checked = true;
}

async function importMedia() {
  const path = mediaPathInput?.value.trim();
  if (!path) return;
  if (importMediaButton) importMediaButton.disabled = true;
  try {
    const asset = await invokeCommand<DesktopMediaAsset>('import_desktop_media', {
      request: {
        path,
        title: mediaTitleInput?.value ?? '',
        tags: mediaTagsInput?.value.split(',').map((tag) => tag.trim()).filter(Boolean) ?? [],
        copy_to_library: mediaCopyCheckbox?.checked ?? true,
      },
    });
    renderMediaPreview(asset);
    if (mediaOutput) mediaOutput.textContent = JSON.stringify(asset, null, 2);
    clearMediaForm();
    await loadMedia();
    if (mediaStatus) mediaStatus.textContent = 'Media berhasil diimpor ke Desktop.';
  } catch (error) {
    if (mediaStatus) mediaStatus.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    if (importMediaButton) importMediaButton.disabled = false;
  }
}

async function searchMedia() {
  const query = mediaSearchInput?.value ?? '';
  try {
    const items = await invokeCommand<DesktopMediaAsset[]>('search_desktop_media', {
      request: { query },
    });
    renderMedia(items);
  } catch {
    const needle = query.toLowerCase();
    renderMedia(mediaAssets.filter((asset) =>
      asset.title.toLowerCase().includes(needle)
      || asset.kind.toLowerCase().includes(needle)
      || asset.tags.some((tag) => tag.includes(needle)),
    ));
  }
}

async function deleteMedia(id: string) {
  await invokeCommand<boolean>('delete_desktop_media', { id });
  await loadMedia();
  if (mediaStatus) mediaStatus.textContent = 'Media dihapus dari library Desktop.';
}

async function startDesktop() {
  setStatus('Memulai runtime Rust-native...', 35);
  try {
    const runtime = await invokeCommand<DesktopRuntimeStatus>('get_desktop_runtime_status');
    renderRuntime(runtime);
    await loadProviderConfig();
    await Promise.all([loadChatSessions(), loadMemories(), loadSkills(), loadWorkflows(), loadMcpServers(), loadGraphify(), loadMedia()]);
    await listenCommand<DesktopChatStreamEvent>('desktop-chat-stream', (event) => {
      applyChatStreamEvent(event.payload);
    });
    void refreshProviderHealth();
    setStatus('Runtime Smara Desktop Rust siap dan berjalan mandiri.', 100);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus('Runtime Desktop gagal dimulai.', 100);
    if (errorMessage) errorMessage.textContent = message;
    if (errorPanel) errorPanel.hidden = false;
  }
}

showDesktopPage(initialDesktopPage());
forceVisibleDesktopContent();
window.addEventListener('DOMContentLoaded', () => {
  showDesktopPage(initialDesktopPage());
  forceVisibleDesktopContent();
});

for (const link of pageNavLinks) {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    showDesktopPage(link.dataset.pageTarget ?? 'dashboard');
    forceVisibleDesktopContent();
  });
}

for (const shortcut of Array.from(document.querySelectorAll<HTMLElement>('[data-page-shortcut]'))) {
  shortcut.addEventListener('click', () => {
    showDesktopPage(shortcut.dataset.pageShortcut ?? 'dashboard');
    forceVisibleDesktopContent();
  });
}
saveProviderButton?.addEventListener('click', () => void saveProviderConfig());
refreshProviderButton?.addEventListener('click', () => {
  showDesktopPage('settings');
  void refreshProviderHealth();
});
chatForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  void sendChatMessage();
});
attachChatButton?.addEventListener('click', () => chatFileInput?.click());
chatFileInput?.addEventListener('change', () => {
  void addChatFiles(Array.from(chatFileInput.files ?? []));
  chatFileInput.value = '';
});
document.addEventListener('paste', (event) => void handleChatPaste(event));
function startNewChat() {
  activeChatSessionId = '';
  pendingChatAttachments = [];
  showDesktopPage('chat');
  forceVisibleDesktopContent();
  renderChatSessions();
  renderChatMessages();
  renderPendingChatAttachments();
  resetChatProcess();
  chatInput?.focus();
}

newChatButton?.addEventListener('click', startNewChat);
sidebarNewChatButton?.addEventListener('click', startNewChat);
retryChatButton?.addEventListener('click', () => void retryLastChat());
cancelChatStreamButton?.addEventListener('click', () => void cancelActiveChatStream());
deleteChatButton?.addEventListener('click', () => void deleteActiveChatSession());
chatSessionSelect?.addEventListener('change', () => {
  openChatSession(chatSessionSelect.value);
});
memoryForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  void saveMemory();
});
memorySearchInput?.addEventListener('input', () => scheduleMemorySearch(memorySearchInput.value));
cancelMemoryEditButton?.addEventListener('click', resetMemoryForm);
skillForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  void saveSkill();
});
clearSkillButton?.addEventListener('click', clearSkillForm);
skillApprovalCheckbox?.addEventListener('change', () => {
  if (approveSkillButton) approveSkillButton.disabled = !skillApprovalCheckbox.checked;
});
approveSkillButton?.addEventListener('click', () => {
  if (!pendingSkillRun || !skillApprovalCheckbox?.checked) return;
  const request = pendingSkillRun;
  closeSkillApproval();
  void executeSkill(request.name, request.workspaceRoot, request.params, true).catch((error) => {
    if (skillStatus) skillStatus.textContent = error instanceof Error ? error.message : String(error);
  });
});
cancelSkillApprovalButton?.addEventListener('click', closeSkillApproval);
workflowForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  void saveWorkflow();
});
clearWorkflowButton?.addEventListener('click', clearWorkflowForm);
workflowApprovalCheckbox?.addEventListener('change', () => {
  if (approveWorkflowButton) approveWorkflowButton.disabled = !workflowApprovalCheckbox.checked;
});
approveWorkflowButton?.addEventListener('click', () => {
  if (!pendingWorkflowRun || !workflowApprovalCheckbox?.checked) return;
  const request = pendingWorkflowRun;
  closeWorkflowApproval();
  void executeWorkflow(request.name, request.workspaceRoot, request.params, true).catch((error) => {
    if (workflowStatus) workflowStatus.textContent = error instanceof Error ? error.message : String(error);
  });
});
cancelWorkflowApprovalButton?.addEventListener('click', closeWorkflowApproval);
mcpForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  void saveMcpServer();
});
clearMcpButton?.addEventListener('click', clearMcpForm);
callMcpToolButton?.addEventListener('click', () => void callMcpTool());
graphifyForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  void buildGraphify();
});
loadGraphifyButton?.addEventListener('click', () => void loadGraphify());
graphifySearchInput?.addEventListener('input', () => void searchGraphify());
mediaForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  void importMedia();
});
clearMediaButton?.addEventListener('click', clearMediaForm);
mediaSearchInput?.addEventListener('input', () => void searchMedia());

void startDesktop();
