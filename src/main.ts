import { fileAssetUrl, invokeCommand, listenCommand } from './tauri-client';
import { readImage as readClipboardImage } from '@tauri-apps/plugin-clipboard-manager';
import { marked } from 'marked';
import DOMPurifyFactory from 'dompurify';
import './styles.css';

if (typeof window !== 'undefined') {
  const dpInstance = DOMPurifyFactory(window);
  Object.assign(DOMPurifyFactory, dpInstance);
  (window as any).DOMPurify = DOMPurifyFactory;
}

marked.setOptions({
  gfm: true,
  breaks: true,
});

let mermaidInstance: any = null;
let isMermaidInitialized = false;

async function getMermaid() {
  if (!mermaidInstance) {
    try {
      const mod = await import('mermaid');
      mermaidInstance = mod.default || mod;
    } catch (err) {
      console.warn('[Mermaid Load Error]', err);
      return null;
    }
  }
  if (!isMermaidInitialized && mermaidInstance) {
    try {
      mermaidInstance.initialize({
        startOnLoad: false,
        suppressErrorRendering: true,
        securityLevel: 'loose',
        theme: 'dark',
        darkMode: true,
        flowchart: {
          useMaxWidth: true,
          htmlLabels: true,
          curve: 'basis',
        },
        er: {
          useMaxWidth: true,
        },
        sequence: {
          useMaxWidth: true,
        },
        gantt: {
          useMaxWidth: true,
        },
        themeVariables: {
          darkMode: true,
          background: '#050805',
          primaryColor: '#1A291A',
          primaryTextColor: '#E2E8F0',
          primaryBorderColor: '#BEF264',
          lineColor: '#BEF264',
          secondaryColor: '#142014',
          tertiaryColor: '#0E170E',
          fontFamily: 'Inter, system-ui, sans-serif',
        },
      });
      isMermaidInitialized = true;
      if (typeof window !== 'undefined') {
        (window as any).mermaid = mermaidInstance;
      }
    } catch (err) {
      console.warn('[Mermaid Init Warning]', err);
    }
  }
  return mermaidInstance;
}

if (typeof window !== 'undefined') {
  (window as any).getMermaid = getMermaid;
}

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

type DetectedLocalModel = {
  provider: string;
  model: string;
  endpoint: string;
  details?: string | null;
};

type WorkspaceFileNode = {
  name: string;
  path: string;
  rel_path: string;
  is_dir: boolean;
  size: number;
  extension?: string | null;
  children?: WorkspaceFileNode[] | null;
};

type WorkspaceGitStatus = {
  is_git: boolean;
  branch?: string | null;
  staged_count: number;
  modified_count: number;
  untracked_count: number;
  summary: string;
};

type WorkspaceFileContent = {
  path: string;
  content: string;
  size: number;
  is_binary: boolean;
};

type DesktopExportResult = {
  session_id: string;
  title: string;
  format: string;
  content: string;
  file_name: string;
};

type CommandPaletteItem = {
  id: string;
  category: 'action' | 'session' | 'file' | 'memory';
  title: string;
  description: string;
  icon: string;
  badge: string;
  onSelect: () => void | Promise<void>;
};

type DesktopChatMessage = {
  id: string;
  role: string;
  content: string;
  attachments?: DesktopChatAttachment[];
  processes?: ChatProcessEntry[];
  created_at_ms: number;
};

type DesktopChatAttachment = {
  name: string;
  mime: string;
  data_base64: string;
  bytes: number;
};

type DesktopWorkspace = {
  name: string;
  path?: string | null;
  created_at_ms: number;
};

type DesktopWorkspaceState = {
  active: string;
  workspaces: DesktopWorkspace[];
};

type DesktopChatSession = {
  id: string;
  title: string;
  workspace?: string;
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
  workspace?: string;
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
const sessionDropdown = document.querySelector<HTMLElement>('#session-dropdown');
const sessionDropdownTrigger = document.querySelector<HTMLButtonElement>('#session-dropdown-trigger');
const sessionDropdownMenu = document.querySelector<HTMLElement>('#session-dropdown-menu');
const sessionDropdownActiveTitle = document.querySelector<HTMLElement>('#session-dropdown-active-title');
const sessionDropdownCountBadge = document.querySelector<HTMLElement>('#session-dropdown-count-badge');
const sessionDropdownItems = document.querySelector<HTMLElement>('#session-dropdown-items');
const sessionSearchInput = document.querySelector<HTMLInputElement>('#session-search-input');
const dropdownNewSessionBtn = document.querySelector<HTMLButtonElement>('#dropdown-new-session-btn');
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
const pageNavLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[data-page-target], .sidebar-menu a[data-page-target], .sidebar-nav a[data-page-target]'));
const pageSections = Array.from(document.querySelectorAll<HTMLElement>('[data-page]'));

const sidebarNewFolderButton = document.querySelector<HTMLButtonElement>('#sidebar-new-folder-button');
const folderModal = document.querySelector<HTMLElement>('#folder-modal');
const folderNameInput = document.querySelector<HTMLInputElement>('#folder-name-input');
const folderRandomBtn = document.querySelector<HTMLButtonElement>('#folder-random-btn');
const cancelFolderButton = document.querySelector<HTMLButtonElement>('#cancel-folder-button');
const confirmCreateFolderButton = document.querySelector<HTMLButtonElement>('#confirm-create-folder-button');
const closeFolderModalButton = document.querySelector<HTMLButtonElement>('#close-folder-modal-button');
const moveSessionModal = document.querySelector<HTMLElement>('#move-session-modal');
const moveSessionTitleLabel = document.querySelector<HTMLElement>('#move-session-title-label');
const moveFolderSelect = document.querySelector<HTMLSelectElement>('#move-folder-select');
const cancelMoveSessionButton = document.querySelector<HTMLButtonElement>('#cancel-move-session-button');
const confirmMoveSessionButton = document.querySelector<HTMLButtonElement>('#confirm-move-session-button');
const closeMoveModalButton = document.querySelector<HTMLButtonElement>('#close-move-modal-button');
const activeWorkspaceBadge = document.querySelector<HTMLElement>('#active-workspace-badge');
const activeWorkspaceNameEl = document.querySelector<HTMLElement>('#active-workspace-name');
const activeWorkspaceMemoryPill = document.querySelector<HTMLElement>('#active-workspace-memory-pill');
const activeWorkspaceGitPill = document.querySelector<HTMLElement>('#active-workspace-git-pill');

const sidebarTabSessions = document.querySelector<HTMLButtonElement>('#sidebar-tab-sessions');
const sidebarTabExplorer = document.querySelector<HTMLButtonElement>('#sidebar-tab-explorer');
const sidebarFileExplorerList = document.querySelector<HTMLElement>('#sidebar-file-explorer-list');
const sidebarGitStatusBar = document.querySelector<HTMLElement>('#sidebar-git-status-bar');
const sidebarGitBranch = document.querySelector<HTMLElement>('#sidebar-git-branch');
const sidebarGitStats = document.querySelector<HTMLElement>('#sidebar-git-stats');
const sidebarRefreshFilesButton = document.querySelector<HTMLButtonElement>('#sidebar-refresh-files-button');
const sidebarPanelTitleText = document.querySelector<HTMLElement>('#sidebar-panel-title-text');

const modelSwitcherDropdown = document.querySelector<HTMLElement>('#model-switcher-dropdown');
const modelSwitcherBtn = document.querySelector<HTMLButtonElement>('#model-switcher-btn');
const modelSwitcherMenu = document.querySelector<HTMLElement>('#model-switcher-menu');
const modelSearchInput = document.querySelector<HTMLInputElement>('#model-search-input');
const activeModelNameEl = document.querySelector<HTMLElement>('#active-model-name');
const detectLocalModelsBtn = document.querySelector<HTMLButtonElement>('#detect-local-models-btn');
const detectedLocalModelsList = document.querySelector<HTMLElement>('#detected-local-models-list');
const chatTokenGauge = document.querySelector<HTMLElement>('#chat-token-gauge');

const atMentionPopover = document.querySelector<HTMLElement>('#at-mention-popover');
const atMentionList = document.querySelector<HTMLElement>('#at-mention-list');

const filePreviewModal = document.querySelector<HTMLElement>('#file-preview-modal');
const filePreviewTitle = document.querySelector<HTMLElement>('#file-preview-title');
const filePreviewPath = document.querySelector<HTMLElement>('#file-preview-path');
const filePreviewContent = document.querySelector<HTMLElement>('#file-preview-content');
const filePreviewAttachBtn = document.querySelector<HTMLButtonElement>('#file-preview-attach-btn');
const filePreviewCopyBtn = document.querySelector<HTMLButtonElement>('#file-preview-copy-btn');
const closeFilePreviewModalButton = document.querySelector<HTMLButtonElement>('#close-file-preview-modal-button');
const closeFilePreviewButton = document.querySelector<HTMLButtonElement>('#close-file-preview-button');

const topbarSearchBtn = document.querySelector<HTMLButtonElement>('#topbar-search-btn');
const commandPaletteModal = document.querySelector<HTMLElement>('#command-palette-modal');
const commandPaletteInput = document.querySelector<HTMLInputElement>('#command-palette-input');
const commandPaletteResults = document.querySelector<HTMLElement>('#command-palette-results');
const commandPaletteFilterChips = document.querySelectorAll<HTMLButtonElement>('.palette-filter-chip');

const chatExportBtn = document.querySelector<HTMLButtonElement>('#chat-export-btn');
const chatExportModal = document.querySelector<HTMLElement>('#chat-export-modal');
const closeChatExportModalButton = document.querySelector<HTMLButtonElement>('#close-chat-export-modal-button');
const cancelChatExportButton = document.querySelector<HTMLButtonElement>('#cancel-chat-export-button');
const copyChatExportButton = document.querySelector<HTMLButtonElement>('#copy-chat-export-button');
const downloadChatExportButton = document.querySelector<HTMLButtonElement>('#download-chat-export-button');
const exportSessionTitleBadge = document.querySelector<HTMLElement>('#export-session-title-badge');
const exportPreviewLabel = document.querySelector<HTMLElement>('#export-preview-label');
const exportFileNamePreview = document.querySelector<HTMLElement>('#export-file-name-preview');
const exportPreviewTextarea = document.querySelector<HTMLTextAreaElement>('#export-preview-textarea');
const exportOptionCards = document.querySelectorAll<HTMLElement>('.export-option-card');

let activePaletteFilter: 'all' | 'actions' | 'sessions' | 'files' | 'memories' = 'all';
let paletteSelectedIndex = 0;
let currentPaletteItems: CommandPaletteItem[] = [];

let activeExportFormat: 'markdown' | 'html' | 'json' = 'markdown';
let activeExportResult: DesktopExportResult | null = null;

let activeSidebarView: 'sessions' | 'explorer' = 'sessions';
let workspaceFileTree: WorkspaceFileNode[] = [];
let workspaceGitStatus: WorkspaceGitStatus | null = null;
let currentProviderConfig: DesktopProviderConfig | null = null;
let detectedLocalModels: DetectedLocalModel[] = [];
let previewingFileNode: WorkspaceFileNode | null = null;
let atMentionSelectedIndex = 0;

let workspacesList: DesktopWorkspace[] = [];
let activeWorkspaceName = 'default';
const collapsedWorkspaces = new Set<string>();
const expandedTreeDirs = new Set<string>();
let pendingMoveSessionId: string | null = null;

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
    pages.style.removeProperty('display');
    pages.style.removeProperty('overflow');
    pages.style.removeProperty('flex');
    pages.style.removeProperty('min-height');
  }
  if (active) {
    active.classList.add('page-active');
    active.removeAttribute('hidden');
    active.style.removeProperty('display');
    active.style.removeProperty('visibility');
    active.style.removeProperty('opacity');
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
  currentProviderConfig = config;
  if (providerSelect) providerSelect.value = config.provider;
  if (providerModelInput) providerModelInput.value = config.model;
  if (providerEndpointInput) providerEndpointInput.value = config.endpoint;
  if (activeModelNameEl) activeModelNameEl.textContent = config.model;
  updateActiveModelSelection();
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
  renderCustomSessionDropdown();
  renderSidebarChatSessions();
  if (deleteChatButton) deleteChatButton.disabled = !activeChatSessionId;
}

function renderCustomSessionDropdown() {
  if (!sessionDropdown) return;
  const activeSession = chatSessions.find((s) => s.id === activeChatSessionId);
  if (sessionDropdownActiveTitle) {
    sessionDropdownActiveTitle.textContent = activeSession ? (activeSession.title || 'Sesi Tanpa Judul') : 'Sesi Baru';
  }
  if (sessionDropdownCountBadge) {
    const msgCount = activeSession ? activeSession.messages.length : 0;
    sessionDropdownCountBadge.textContent = `${msgCount} pesan`;
  }
  renderCustomSessionDropdownList();
}

function renderCustomSessionDropdownList() {
  if (!sessionDropdownItems) return;
  const query = sessionSearchInput?.value.trim().toLowerCase() || '';
  const filtered = query
    ? chatSessions.filter((s) => (s.title || '').toLowerCase().includes(query))
    : chatSessions;

  if (filtered.length === 0) {
    sessionDropdownItems.innerHTML = query
      ? `<div class="session-empty-notice">Tidak ada sesi cocok dengan "${query}"</div>`
      : `<div class="session-empty-notice">Belum ada sesi percakapan.</div>`;
    return;
  }

  sessionDropdownItems.replaceChildren(...filtered.map((session) => {
    const item = document.createElement('div');
    item.className = 'session-dropdown-item';
    const isActive = session.id === activeChatSessionId;
    if (isActive) item.classList.add('active');

    const mainCol = document.createElement('div');
    mainCol.className = 'session-item-main';

    const titleRow = document.createElement('div');
    titleRow.className = 'session-item-title-row';
    const titleSpan = document.createElement('span');
    titleSpan.className = 'session-item-title';
    titleSpan.textContent = session.title || 'Sesi Tanpa Judul';
    titleRow.appendChild(titleSpan);

    const metaRow = document.createElement('div');
    metaRow.className = 'session-item-meta';
    metaRow.innerHTML = `<span>${session.messages.length} pesan</span><span>•</span><span>${formatSessionTime(session.updated_at_ms)}</span>`;

    mainCol.append(titleRow, metaRow);

    const actionsCol = document.createElement('div');
    actionsCol.className = 'session-item-actions';
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'session-item-delete-btn';
    deleteBtn.title = 'Hapus sesi ini';
    deleteBtn.textContent = '🗑️';

    actionsCol.appendChild(deleteBtn);
    item.append(mainCol, actionsCol);

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      openChatSession(session.id);
      closeSessionDropdown();
    });

    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Hapus sesi "${session.title || 'Sesi Tanpa Judul'}"?`)) {
        await deleteSessionById(session.id);
      }
    });

    return item;
  }));
}

function toggleSessionDropdown() {
  if (!sessionDropdownMenu) return;
  const isOpen = !sessionDropdownMenu.hidden;
  if (isOpen) {
    closeSessionDropdown();
  } else {
    openSessionDropdown();
  }
}

function openSessionDropdown() {
  if (!sessionDropdownMenu || !sessionDropdownTrigger) return;
  sessionDropdownMenu.hidden = false;
  sessionDropdownTrigger.classList.add('active');
  sessionDropdownTrigger.setAttribute('aria-expanded', 'true');
  if (sessionSearchInput) {
    sessionSearchInput.value = '';
    renderCustomSessionDropdownList();
    setTimeout(() => sessionSearchInput.focus(), 60);
  }
}

function closeSessionDropdown() {
  if (!sessionDropdownMenu || !sessionDropdownTrigger) return;
  sessionDropdownMenu.hidden = true;
  sessionDropdownTrigger.classList.remove('active');
  sessionDropdownTrigger.setAttribute('aria-expanded', 'false');
}

async function deleteSessionById(sessionId: string) {
  try {
    await invokeCommand<boolean>('delete_desktop_chat_session', { id: sessionId });
    if (activeChatSessionId === sessionId) {
      activeChatSessionId = '';
    }
    await loadChatSessions();
    if (chatStatus) chatStatus.textContent = 'Sesi Chat dihapus.';
  } catch (error) {
    if (chatStatus) chatStatus.textContent = error instanceof Error ? error.message : String(error);
  }
}

function generateRandomWorkspaceName(): string {
  const prefixes = ['Nova', 'Apex', 'Cyber', 'Nexus', 'Starlight', 'Quantum', 'Hyper', 'Orion', 'Pulse', 'Zenith', 'Echo', 'Vortex', 'Stitch', 'Aura', 'Solar', 'Titan'];
  const nouns = ['Workspace', 'Project', 'Studio', 'Lab', 'Engine', 'Backend', 'Flow', 'Core', 'Hub'];
  const p = prefixes[Math.floor(Math.random() * prefixes.length)];
  const n = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 90 + 10);
  return `${p}-${n}-${num}`;
}

function updateChatHeaderWorkspaceInfo() {
  if (activeWorkspaceNameEl) {
    activeWorkspaceNameEl.textContent = activeWorkspaceName === 'default' ? 'General' : activeWorkspaceName;
  }
  if (activeWorkspaceMemoryPill) {
    const wsMemories = memories.filter((m) => !m.workspace || m.workspace === activeWorkspaceName);
    activeWorkspaceMemoryPill.textContent = `${wsMemories.length} memori`;
  }
  if (activeWorkspaceBadge) {
    activeWorkspaceBadge.title = `Folder Workspace: ${activeWorkspaceName} (Shared Cache & Memory)`;
  }
}

async function loadWorkspaces() {
  try {
    const state = await invokeCommand<DesktopWorkspaceState>('get_desktop_workspaces');
    workspacesList = state.workspaces;
    if (!activeWorkspaceName || activeWorkspaceName === 'default') {
      activeWorkspaceName = state.active || 'default';
    }
    updateChatHeaderWorkspaceInfo();
    renderSidebarChatSessions();
    void loadWorkspaceFiles();
    void loadWorkspaceGitStatus();
  } catch (error) {
    console.error('Failed to load workspaces:', error);
  }
}

let isLoadingWorkspaceFiles = false;

function initSidebarViewTabs() {
  sidebarTabSessions?.addEventListener('click', () => {
    if (activeSidebarView === 'sessions') return;
    activeSidebarView = 'sessions';
    sidebarTabSessions.classList.add('active');
    sidebarTabExplorer?.classList.remove('active');
    if (sidebarPanelTitleText) sidebarPanelTitleText.textContent = 'Workspaces & Sessions';
    if (sidebarChatSessionList) sidebarChatSessionList.hidden = false;
    if (sidebarFileExplorerList) sidebarFileExplorerList.hidden = true;
    if (sidebarRefreshFilesButton) sidebarRefreshFilesButton.hidden = true;
  });

  sidebarTabExplorer?.addEventListener('click', () => {
    if (activeSidebarView === 'explorer') return;
    activeSidebarView = 'explorer';
    sidebarTabExplorer.classList.add('active');
    sidebarTabSessions?.classList.remove('active');
    if (sidebarPanelTitleText) sidebarPanelTitleText.textContent = 'Workspace Files';
    if (sidebarChatSessionList) sidebarChatSessionList.hidden = true;
    if (sidebarFileExplorerList) sidebarFileExplorerList.hidden = false;
    if (sidebarRefreshFilesButton) sidebarRefreshFilesButton.hidden = false;

    // Zero-lag instant switch: only load from backend if not already cached
    if (workspaceFileTree.length === 0) {
      void loadWorkspaceFiles();
    }
  });

  sidebarRefreshFilesButton?.addEventListener('click', () => {
    void loadWorkspaceFiles(true);
    void loadWorkspaceGitStatus();
  });
}

async function loadWorkspaceGitStatus() {
  try {
    const status = await invokeCommand<WorkspaceGitStatus>('get_workspace_git_status', {
      workspace: activeWorkspaceName === 'default' ? null : activeWorkspaceName,
    });
    workspaceGitStatus = status;
    if (sidebarGitStatusBar) {
      sidebarGitStatusBar.hidden = !status.is_git;
    }
    if (sidebarGitBranch) {
      sidebarGitBranch.textContent = status.branch || 'main';
    }
    if (sidebarGitStats) {
      sidebarGitStats.textContent = `+${status.staged_count} ~${status.modified_count} ?${status.untracked_count}`;
    }
    if (activeWorkspaceGitPill) {
      activeWorkspaceGitPill.hidden = !status.is_git;
      activeWorkspaceGitPill.textContent = `🌿 ${status.branch || 'main'}`;
      activeWorkspaceGitPill.title = status.summary;
    }
  } catch (error) {
    console.error('Failed to load git status:', error);
  }
}

async function loadWorkspaceFiles(force = false) {
  if (!sidebarFileExplorerList) return;
  if (isLoadingWorkspaceFiles) return;
  if (!force && workspaceFileTree.length > 0) {
    // If not forced and already cached, reuse rendered list immediately
    return;
  }

  isLoadingWorkspaceFiles = true;
  if (sidebarRefreshFilesButton) {
    sidebarRefreshFilesButton.classList.add('rotating');
  }

  try {
    const nodes = await invokeCommand<WorkspaceFileNode[]>('get_workspace_file_tree', {
      workspace: activeWorkspaceName === 'default' ? null : activeWorkspaceName,
      maxDepth: 3,
    });
    workspaceFileTree = nodes;
    renderWorkspaceFileTree();
  } catch (error) {
    sidebarFileExplorerList.innerHTML = `<p class="sidebar-chat-empty">Gagal memuat file: ${error instanceof Error ? error.message : String(error)}</p>`;
  } finally {
    isLoadingWorkspaceFiles = false;
    if (sidebarRefreshFilesButton) {
      sidebarRefreshFilesButton.classList.remove('rotating');
    }
  }
}

function getFileIcon(node: WorkspaceFileNode): string {
  if (node.is_dir) return '📁';
  const ext = node.extension?.toLowerCase() || '';
  if (['ts', 'tsx'].includes(ext)) return '🔷';
  if (['js', 'jsx', 'mjs'].includes(ext)) return '🟨';
  if (['rs'].includes(ext)) return '🦀';
  if (['json'].includes(ext)) return '📜';
  if (['md', 'txt'].includes(ext)) return '📝';
  if (['html', 'htm'].includes(ext)) return '🌐';
  if (['css', 'scss', 'sass'].includes(ext)) return '🎨';
  if (['py'].includes(ext)) return '🐍';
  if (['go'].includes(ext)) return '🔵';
  if (['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif'].includes(ext)) return '🖼️';
  if (['sh', 'bash', 'zsh'].includes(ext)) return '⚡';
  return '📄';
}

function renderFileNodeElement(node: WorkspaceFileNode): HTMLElement {
  const container = document.createElement('div');
  container.className = 'file-tree-node';

  const row = document.createElement('div');
  row.className = 'file-tree-row';
  row.title = node.rel_path;

  const isExpanded = expandedTreeDirs.has(node.path);

  const iconSpan = document.createElement('span');
  iconSpan.className = 'file-tree-icon';
  iconSpan.textContent = node.is_dir ? (isExpanded ? '📂' : '📁') : getFileIcon(node);

  const nameSpan = document.createElement('span');
  nameSpan.className = 'file-tree-name';
  nameSpan.textContent = node.name;

  const sizeSpan = document.createElement('span');
  sizeSpan.className = 'file-tree-size';
  if (!node.is_dir && node.size > 0) {
    sizeSpan.textContent = formatAttachmentBytes(node.size);
  }

  row.append(iconSpan, nameSpan, sizeSpan);
  container.append(row);

  if (node.is_dir && node.children && node.children.length > 0) {
    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'file-tree-children';
    if (!isExpanded) {
      childrenContainer.classList.add('collapsed');
    }
    for (const child of node.children) {
      childrenContainer.append(renderFileNodeElement(child));
    }
    container.append(childrenContainer);

    row.addEventListener('click', () => {
      if (expandedTreeDirs.has(node.path)) {
        expandedTreeDirs.delete(node.path);
        childrenContainer.classList.add('collapsed');
        iconSpan.textContent = '📁';
      } else {
        expandedTreeDirs.add(node.path);
        childrenContainer.classList.remove('collapsed');
        iconSpan.textContent = '📂';
      }
    });
  } else if (node.is_dir) {
    row.addEventListener('click', () => {
      if (expandedTreeDirs.has(node.path)) {
        expandedTreeDirs.delete(node.path);
        iconSpan.textContent = '📁';
      } else {
        expandedTreeDirs.add(node.path);
        iconSpan.textContent = '📂';
      }
    });
  } else {
    row.addEventListener('click', () => {
      void openFilePreviewModal(node);
    });
  }

  return container;
}

function renderWorkspaceFileTree() {
  if (!sidebarFileExplorerList) return;
  if (!workspaceFileTree.length) {
    sidebarFileExplorerList.innerHTML = '<p class="sidebar-chat-empty">Workspace kosong atau tidak ada file.</p>';
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const node of workspaceFileTree) {
    fragment.append(renderFileNodeElement(node));
  }
  sidebarFileExplorerList.replaceChildren(fragment);
}

async function openFilePreviewModal(node: WorkspaceFileNode) {
  if (!filePreviewModal || !filePreviewContent || !filePreviewTitle || !filePreviewPath) return;
  previewingFileNode = node;
  filePreviewTitle.textContent = `${getFileIcon(node)} ${node.name}`;
  filePreviewPath.textContent = node.rel_path;
  filePreviewContent.textContent = 'Memuat isi file...';
  filePreviewModal.hidden = false;

  try {
    const data = await invokeCommand<WorkspaceFileContent>('read_workspace_file', { path: node.path });
    filePreviewContent.textContent = data.content;
  } catch (error) {
    filePreviewContent.textContent = `Gagal membaca file: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function initFilePreviewModal() {
  closeFilePreviewModalButton?.addEventListener('click', () => {
    if (filePreviewModal) filePreviewModal.hidden = true;
  });
  closeFilePreviewButton?.addEventListener('click', () => {
    if (filePreviewModal) filePreviewModal.hidden = true;
  });
  filePreviewCopyBtn?.addEventListener('click', () => {
    if (filePreviewContent?.textContent) {
      navigator.clipboard.writeText(filePreviewContent.textContent);
      filePreviewCopyBtn.textContent = '✓ Disalin!';
      setTimeout(() => {
        if (filePreviewCopyBtn) filePreviewCopyBtn.textContent = '📋 Salin Isi';
      }, 1500);
    }
  });
  filePreviewAttachBtn?.addEventListener('click', async () => {
    if (!previewingFileNode) return;
    try {
      const data = await invokeCommand<WorkspaceFileContent>('read_workspace_file', { path: previewingFileNode.path });
      if (!data.is_binary) {
        pendingChatAttachments.push({
          name: previewingFileNode.name,
          mime: 'text/plain',
          data_base64: btoa(unescape(encodeURIComponent(data.content))),
          bytes: data.size,
        });
        renderPendingChatAttachments();
      }
      if (filePreviewModal) filePreviewModal.hidden = true;
      chatInput?.focus();
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    }
  });
}

function initQuickModelSwitcher() {
  modelSwitcherBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (modelSwitcherMenu) {
      modelSwitcherMenu.hidden = !modelSwitcherMenu.hidden;
      if (!modelSwitcherMenu.hidden) {
        updateActiveModelSelection();
        if (!detectedLocalModels.length) {
          void detectAndRenderLocalModels();
        }
      }
    }
  });

  modelSearchInput?.addEventListener('input', () => {
    renderDetectedModelsList(modelSearchInput.value);
  });

  document.addEventListener('click', (e) => {
    if (modelSwitcherMenu && !modelSwitcherMenu.hidden && !modelSwitcherDropdown?.contains(e.target as Node)) {
      modelSwitcherMenu.hidden = true;
    }
  });

  document.querySelectorAll<HTMLButtonElement>('.model-option-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const provider = btn.dataset.provider || 'custom';
      const model = btn.dataset.model || '9r/ag/gemini-3.7-flash-high';
      const endpoint = btn.dataset.endpoint;
      await switchActiveModel(provider, model, endpoint);
      if (modelSwitcherMenu) modelSwitcherMenu.hidden = true;
    });
  });

  detectLocalModelsBtn?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await detectAndRenderLocalModels();
  });
}

async function switchActiveModel(provider: string, model: string, endpoint?: string) {
  try {
    const config = await invokeCommand<DesktopProviderConfig>('switch_desktop_provider_model', {
      provider,
      model,
      endpoint: endpoint ?? null,
    });
    currentProviderConfig = config;
    if (activeModelNameEl) {
      activeModelNameEl.textContent = config.model;
    }
    if (providerModelInput) providerModelInput.value = config.model;
    if (providerSelect) providerSelect.value = config.provider;
    if (providerEndpointInput) providerEndpointInput.value = config.endpoint;
    updateActiveModelSelection();
    void refreshProviderHealth();
  } catch (error) {
    console.error('Failed to switch model:', error);
  }
}

function renderDetectedModelsList(filterQuery = '') {
  if (!detectedLocalModelsList) return;
  const q = filterQuery.toLowerCase().trim();
  const filtered = q
    ? detectedLocalModels.filter((m) => m.model.toLowerCase().includes(q) || (m.details && m.details.toLowerCase().includes(q)))
    : detectedLocalModels;

  if (!filtered.length) {
    detectedLocalModelsList.innerHTML = `<p class="no-local-models-hint">${q ? 'Tidak ada model cocok dengan pencarian.' : 'Tidak ada service OmniRoute / Ollama aktif.'}</p>`;
    return;
  }

  detectedLocalModelsList.innerHTML = '';
  for (const m of filtered) {
    const btn = document.createElement('button');
    btn.className = 'model-option-btn';
    btn.type = 'button';
    btn.dataset.provider = m.provider;
    btn.dataset.model = m.model;
    if (m.endpoint) btn.dataset.endpoint = m.endpoint;
    const icon = m.details?.includes('OmniRoute') ? '🌐' : (m.provider === 'ollama' ? '🦙' : '🤖');
    btn.innerHTML = `
      <span class="model-opt-icon">${icon}</span>
      <span class="model-opt-name" title="${m.model}">${m.model}</span>
      ${m.details ? `<span style="margin-left:auto;font-size:9px;color:#94A3B8;">${m.details}</span>` : ''}
    `;
    btn.addEventListener('click', async () => {
      await switchActiveModel(m.provider, m.model, m.endpoint);
      if (modelSwitcherMenu) modelSwitcherMenu.hidden = true;
    });
    detectedLocalModelsList.append(btn);
  }
  updateActiveModelSelection();
}

async function detectAndRenderLocalModels() {
  if (!detectedLocalModelsList || !detectLocalModelsBtn) return;
  detectLocalModelsBtn.disabled = true;
  detectLocalModelsBtn.textContent = 'Scanning...';
  detectedLocalModelsList.innerHTML = '<p class="no-local-models-hint">Scanning OmniRoute (20128/20130), Ollama (11434)...</p>';

  try {
    const models = await invokeCommand<DetectedLocalModel[]>('detect_local_llm_models');
    detectedLocalModels = models;
    detectLocalModelsBtn.disabled = false;
    detectLocalModelsBtn.textContent = '🔄 Scan Models';
    renderDetectedModelsList(modelSearchInput?.value || '');
  } catch (error) {
    detectLocalModelsBtn.disabled = false;
    detectLocalModelsBtn.textContent = '🔄 Scan Models';
    detectedLocalModelsList.innerHTML = `<p class="no-local-models-hint">Error: ${error instanceof Error ? error.message : String(error)}</p>`;
  }
}

function updateActiveModelSelection() {
  const currentModel = currentProviderConfig?.model || activeModelNameEl?.textContent || '';
  document.querySelectorAll<HTMLButtonElement>('.model-option-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.model === currentModel);
  });
}

function updateChatTokenGauge(session: DesktopChatSession | null) {
  if (!chatTokenGauge) return;
  if (!session || !session.messages.length) {
    chatTokenGauge.textContent = '0 tok';
    return;
  }
  const totalChars = session.messages.reduce((sum, msg) => sum + (msg.content?.length || 0), 0);
  const estimatedTokens = Math.round(totalChars / 4);
  chatTokenGauge.textContent = estimatedTokens > 1000
    ? `${(estimatedTokens / 1000).toFixed(1)}k tok`
    : `${estimatedTokens} tok`;
}

function flattenWorkspaceFiles(nodes: WorkspaceFileNode[]): WorkspaceFileNode[] {
  const list: WorkspaceFileNode[] = [];
  function traverse(n: WorkspaceFileNode) {
    if (!n.is_dir) list.push(n);
    if (n.children) {
      for (const c of n.children) traverse(c);
    }
  }
  for (const node of nodes) traverse(node);
  return list;
}

function initAtMentionAutocomplete() {
  if (!chatInput || !atMentionPopover || !atMentionList) return;

  chatInput.addEventListener('input', () => {
    const val = chatInput.value;
    const cursorPos = chatInput.selectionStart || 0;
    const textBeforeCursor = val.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1 && (lastAtIndex === 0 || /\s/.test(textBeforeCursor[lastAtIndex - 1]))) {
      const query = textBeforeCursor.slice(lastAtIndex + 1);
      if (!query.includes(' ') && !query.includes('\n')) {
        renderAtMentionSuggestions(query);
        return;
      }
    }
    closeAtMentionPopover();
  });

  chatInput.addEventListener('keydown', (e) => {
    if (atMentionPopover.hidden) return;
    const items = atMentionList.querySelectorAll<HTMLElement>('.at-mention-item');
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      atMentionSelectedIndex = (atMentionSelectedIndex + 1) % items.length;
      updateAtMentionSelection();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      atMentionSelectedIndex = (atMentionSelectedIndex - 1 + items.length) % items.length;
      updateAtMentionSelection();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (currentFilteredAtMentionFiles[atMentionSelectedIndex]) {
        e.preventDefault();
        void insertAtMention(currentFilteredAtMentionFiles[atMentionSelectedIndex]);
      }
    } else if (e.key === 'Escape') {
      closeAtMentionPopover();
    }
  });
}

let currentFilteredAtMentionFiles: WorkspaceFileNode[] = [];

function renderAtMentionSuggestions(query: string) {
  if (!atMentionPopover || !atMentionList) return;
  const flatFiles = flattenWorkspaceFiles(workspaceFileTree);
  const filtered = flatFiles
    .filter((f) => f.name.toLowerCase().includes(query.toLowerCase()) || f.rel_path.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8);

  currentFilteredAtMentionFiles = filtered;

  if (!filtered.length) {
    closeAtMentionPopover();
    return;
  }

  atMentionSelectedIndex = 0;
  atMentionList.innerHTML = '';

  filtered.forEach((file, index) => {
    const item = document.createElement('div');
    item.className = `at-mention-item ${index === 0 ? 'selected' : ''}`;
    item.innerHTML = `
      <span>${getFileIcon(file)} ${file.rel_path}</span>
      <span style="font-size: 10px; color: #64748B;">${formatAttachmentBytes(file.size)}</span>
    `;
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void insertAtMention(file);
    });
    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void insertAtMention(file);
    });
    atMentionList.appendChild(item);
  });

  atMentionPopover.hidden = false;
  atMentionPopover.style.display = 'block';
}

function updateAtMentionSelection() {
  const items = atMentionList?.querySelectorAll<HTMLElement>('.at-mention-item');
  items?.forEach((item, idx) => {
    item.classList.toggle('selected', idx === atMentionSelectedIndex);
  });
}

function closeAtMentionPopover() {
  if (atMentionPopover) {
    atMentionPopover.hidden = true;
    atMentionPopover.style.display = 'none';
  }
}

async function insertAtMention(file: WorkspaceFileNode) {
  if (!chatInput) return;
  const val = chatInput.value;
  let cursorPos = chatInput.selectionStart || 0;
  if (cursorPos === 0 && val.length > 0) {
    cursorPos = val.length;
  }
  const textBeforeCursor = val.slice(0, cursorPos);
  const textAfterCursor = val.slice(cursorPos);
  const lastAtIndex = textBeforeCursor.lastIndexOf('@');

  if (lastAtIndex !== -1) {
    chatInput.value = textBeforeCursor.slice(0, lastAtIndex) + `@${file.rel_path} ` + textAfterCursor;
    chatInput.selectionStart = chatInput.selectionEnd = lastAtIndex + file.rel_path.length + 2;
  } else {
    chatInput.value = `${val} @${file.rel_path} `;
  }
  closeAtMentionPopover();
  chatInput.focus();

  try {
    const data = await invokeCommand<WorkspaceFileContent>('read_workspace_file', { path: file.path });
    if (!data.is_binary && !pendingChatAttachments.some((a) => a.name === file.name)) {
      pendingChatAttachments.push({
        name: file.name,
        mime: 'text/plain',
        data_base64: btoa(unescape(encodeURIComponent(data.content))),
        bytes: data.size,
      });
      renderPendingChatAttachments();
    }
  } catch (err) {
    console.error('Failed to attach mentioned file:', err);
  }
}

function initCommandPalette() {
  topbarSearchBtn?.addEventListener('click', () => {
    openCommandPalette();
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (commandPaletteModal && !commandPaletteModal.hidden) {
        closeCommandPalette();
      } else {
        openCommandPalette();
      }
    } else if (e.key === 'Escape' && commandPaletteModal && !commandPaletteModal.hidden) {
      closeCommandPalette();
    }
  });

  commandPaletteInput?.addEventListener('input', () => {
    const q = commandPaletteInput.value.trim();
    renderCommandPaletteResults(q);
  });

  commandPaletteInput?.addEventListener('keydown', (e) => {
    if (commandPaletteModal?.hidden) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (currentPaletteItems.length > 0) {
        paletteSelectedIndex = (paletteSelectedIndex + 1) % currentPaletteItems.length;
        updatePaletteSelection();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (currentPaletteItems.length > 0) {
        paletteSelectedIndex = (paletteSelectedIndex - 1 + currentPaletteItems.length) % currentPaletteItems.length;
        updatePaletteSelection();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = currentPaletteItems[paletteSelectedIndex];
      if (selected) {
        closeCommandPalette();
        void selected.onSelect();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeCommandPalette();
    }
  });

  commandPaletteModal?.querySelector('.command-palette-backdrop')?.addEventListener('click', () => {
    closeCommandPalette();
  });

  commandPaletteFilterChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      commandPaletteFilterChips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      activePaletteFilter = (chip.dataset.filter || 'all') as any;
      const q = commandPaletteInput?.value.trim() || '';
      renderCommandPaletteResults(q);
    });
  });
}

function openCommandPalette() {
  if (!commandPaletteModal || !commandPaletteInput) return;
  commandPaletteModal.hidden = false;
  commandPaletteModal.style.display = 'flex';
  commandPaletteInput.value = '';
  paletteSelectedIndex = 0;
  renderCommandPaletteResults('');
  setTimeout(() => commandPaletteInput.focus(), 50);
}

function closeCommandPalette() {
  if (!commandPaletteModal) return;
  commandPaletteModal.hidden = true;
  commandPaletteModal.style.display = 'none';
}

function buildCommandPaletteIndex(): CommandPaletteItem[] {
  const items: CommandPaletteItem[] = [];

  // Actions / Navigation
  items.push(
    {
      id: 'act-new-chat',
      category: 'action',
      title: 'Mulai Sesi Chat Baru',
      description: 'Membuka percakapan baru di workspace aktif',
      icon: '💬',
      badge: 'Aksi',
      onSelect: () => startNewChat(),
    },
    {
      id: 'act-new-workspace',
      category: 'action',
      title: 'Buat Folder / Workspace Baru',
      description: 'Isolasi cache dan memori untuk proyek tertentu',
      icon: '📁',
      badge: 'Aksi',
      onSelect: () => openFolderModal(),
    },
    {
      id: 'act-detect-llm',
      category: 'action',
      title: 'Deteksi Local LLM (Ollama & LM Studio)',
      description: 'Pindai model lokal di port 11434 dan 1234',
      icon: '🔄',
      badge: 'Aksi',
      onSelect: async () => {
        showDesktopPage('chat');
        await detectAndRenderLocalModels();
        if (modelSwitcherMenu) modelSwitcherMenu.hidden = false;
      },
    },
    {
      id: 'act-export-chat',
      category: 'action',
      title: 'Ekspor Riwayat Sesi Aktif',
      description: 'Unduh chat sebagai Markdown, HTML, atau JSON',
      icon: '📥',
      badge: 'Aksi',
      onSelect: () => openChatExportModal(),
    },
    {
      id: 'act-nav-chat',
      category: 'action',
      title: 'Buka Chat Console',
      description: 'Halaman chat AI dengan built-in agent tools',
      icon: '💬',
      badge: 'Navigasi',
      onSelect: () => { showDesktopPage('chat'); forceVisibleDesktopContent(); },
    },
    {
      id: 'act-nav-memory',
      category: 'action',
      title: 'Buka Memory System',
      description: 'Kelola basis data memori jangka panjang',
      icon: '🧠',
      badge: 'Navigasi',
      onSelect: () => { showDesktopPage('memory'); forceVisibleDesktopContent(); },
    },
    {
      id: 'act-nav-skills',
      category: 'action',
      title: 'Buka Automation Skills',
      description: 'Kelola dan eksekusi skill otomasi',
      icon: '⚡',
      badge: 'Navigasi',
      onSelect: () => { showDesktopPage('skill'); forceVisibleDesktopContent(); },
    },
    {
      id: 'act-nav-workflows',
      category: 'action',
      title: 'Buka Pipelines & Workflows',
      description: 'Pipeline multi-step orchestrations',
      icon: '🔀',
      badge: 'Navigasi',
      onSelect: () => { showDesktopPage('workflow'); forceVisibleDesktopContent(); },
    },
    {
      id: 'act-nav-mcp',
      category: 'action',
      title: 'Buka MCP Servers',
      description: 'Hubungkan tool eksternal model context protocol',
      icon: '🔌',
      badge: 'Navigasi',
      onSelect: () => { showDesktopPage('mcp'); forceVisibleDesktopContent(); },
    },
    {
      id: 'act-nav-graphify',
      category: 'action',
      title: 'Buka Knowledge Graph (Graphify)',
      description: 'Visualisasi dependensi file dan fungsi',
      icon: '📊',
      badge: 'Navigasi',
      onSelect: () => { showDesktopPage('graphify'); forceVisibleDesktopContent(); },
    },
    {
      id: 'act-nav-media',
      category: 'action',
      title: 'Buka Media Asset Library',
      description: 'Koleksi media gambar dan audio lokal',
      icon: '🖼️',
      badge: 'Navigasi',
      onSelect: () => { showDesktopPage('media'); forceVisibleDesktopContent(); },
    },
    {
      id: 'act-nav-settings',
      category: 'action',
      title: 'Buka Engine Settings',
      description: 'Konfigurasi provider, endpoint, dan model',
      icon: '⚙️',
      badge: 'Navigasi',
      onSelect: () => { showDesktopPage('settings'); forceVisibleDesktopContent(); },
    }
  );

  // Chat Sessions
  chatSessions.forEach((session) => {
    const lastMsg = session.messages[session.messages.length - 1];
    const preview = lastMsg ? lastMsg.content.slice(0, 70) : 'Sesi kosong';
    items.push({
      id: `session-${session.id}`,
      category: 'session',
      title: session.title || 'Sesi Tanpa Judul',
      description: `${session.workspace ? `[${session.workspace}] ` : ''}${preview}`,
      icon: '💬',
      badge: 'Sesi',
      onSelect: () => openChatSession(session.id),
    });
  });

  // Workspace Files
  const flatFiles = flattenWorkspaceFiles(workspaceFileTree);
  flatFiles.forEach((file) => {
    items.push({
      id: `file-${file.path}`,
      category: 'file',
      title: file.name,
      description: file.rel_path,
      icon: getFileIcon(file),
      badge: 'File',
      onSelect: () => void openFilePreviewModal(file),
    });
  });

  // Memories
  memories.forEach((mem) => {
    items.push({
      id: `mem-${mem.id}`,
      category: 'memory',
      title: mem.content.slice(0, 50),
      description: mem.tags.length ? `Tags: ${mem.tags.join(', ')}` : 'Memori tersimpan',
      icon: '🧠',
      badge: 'Memori',
      onSelect: () => {
        showDesktopPage('memory');
        if (memorySearchInput) {
          memorySearchInput.value = mem.content.slice(0, 20);
          scheduleMemorySearch(memorySearchInput.value);
        }
      },
    });
  });

  return items;
}

function renderCommandPaletteResults(query: string) {
  if (!commandPaletteResults) return;

  const allItems = buildCommandPaletteIndex();
  const lowerQuery = query.toLowerCase();

  const filtered = allItems.filter((item) => {
    if (activePaletteFilter !== 'all') {
      if (activePaletteFilter === 'actions' && item.category !== 'action') return false;
      if (activePaletteFilter === 'sessions' && item.category !== 'session') return false;
      if (activePaletteFilter === 'files' && item.category !== 'file') return false;
      if (activePaletteFilter === 'memories' && item.category !== 'memory') return false;
    }
    if (!query) return true;
    return (
      item.title.toLowerCase().includes(lowerQuery) ||
      item.description.toLowerCase().includes(lowerQuery)
    );
  });

  currentPaletteItems = filtered;
  paletteSelectedIndex = 0;
  commandPaletteResults.innerHTML = '';

  if (!filtered.length) {
    commandPaletteResults.innerHTML = `
      <div style="padding: 24px; text-align: center; color: #64748B; font-size: 13px;">
        Tidak ada hasil yang cocok dengan "<strong>${htmlEscape(query)}</strong>"
      </div>
    `;
    return;
  }

  filtered.forEach((item, index) => {
    const el = document.createElement('div');
    el.className = `palette-result-item ${index === 0 ? 'selected' : ''}`;
    el.innerHTML = `
      <div class="palette-result-left">
        <span class="palette-result-icon">${item.icon}</span>
        <div class="palette-result-text">
          <span class="palette-result-title">${htmlEscape(item.title)}</span>
          <span class="palette-result-desc">${htmlEscape(item.description)}</span>
        </div>
      </div>
      <span class="palette-result-badge badge-${item.category}">${item.badge}</span>
    `;

    el.addEventListener('click', () => {
      closeCommandPalette();
      void item.onSelect();
    });

    commandPaletteResults.appendChild(el);
  });
}

function updatePaletteSelection() {
  const items = commandPaletteResults?.querySelectorAll<HTMLElement>('.palette-result-item');
  items?.forEach((item, idx) => {
    item.classList.toggle('selected', idx === paletteSelectedIndex);
    if (idx === paletteSelectedIndex) {
      item.scrollIntoView({ block: 'nearest' });
    }
  });
}

function initChatExportModal() {
  chatExportBtn?.addEventListener('click', () => {
    openChatExportModal();
  });

  closeChatExportModalButton?.addEventListener('click', closeChatExportModal);
  cancelChatExportButton?.addEventListener('click', closeChatExportModal);

  exportOptionCards.forEach((card) => {
    card.addEventListener('click', () => {
      exportOptionCards.forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
      activeExportFormat = (card.dataset.format || 'markdown') as any;
      void loadChatExportPreview();
    });
  });

  copyChatExportButton?.addEventListener('click', () => {
    if (exportPreviewTextarea && activeExportResult) {
      navigator.clipboard.writeText(exportPreviewTextarea.value);
      copyChatExportButton.textContent = '✓ Disalin!';
      setTimeout(() => {
        if (copyChatExportButton) copyChatExportButton.textContent = '📋 Salin Isi';
      }, 1500);
    }
  });

  downloadChatExportButton?.addEventListener('click', async () => {
    if (!activeExportResult) return;
    try {
      const blob = new Blob([activeExportResult.content], {
        type: activeExportFormat === 'json' ? 'application/json' : (activeExportFormat === 'html' ? 'text/html' : 'text/markdown'),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = activeExportResult.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      downloadChatExportButton.textContent = '✓ Diunduh!';
      setTimeout(() => {
        if (downloadChatExportButton) downloadChatExportButton.textContent = '💾 Download File';
      }, 1500);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  });
}

async function openChatExportModal() {
  if (!chatExportModal) return;
  const session = chatSessions.find((s) => s.id === activeChatSessionId);
  if (!session) {
    alert('Buka sesi chat terlebih dahulu sebelum mengekspor.');
    return;
  }

  if (exportSessionTitleBadge) {
    exportSessionTitleBadge.textContent = session.title || 'Sesi';
  }

  chatExportModal.hidden = false;
  chatExportModal.style.display = 'flex';
  await loadChatExportPreview();
}

function closeChatExportModal() {
  if (chatExportModal) {
    chatExportModal.hidden = true;
    chatExportModal.style.display = 'none';
  }
}

async function loadChatExportPreview() {
  if (!exportPreviewTextarea || !exportFileNamePreview || !exportPreviewLabel) return;
  exportPreviewTextarea.value = 'Membuat format ekspor...';

  try {
    const res = await invokeCommand<DesktopExportResult>('export_desktop_chat_session', {
      sessionId: activeChatSessionId,
      format: activeExportFormat,
    });
    activeExportResult = res;
    exportPreviewTextarea.value = res.content;
    exportFileNamePreview.textContent = res.file_name;
    exportPreviewLabel.textContent = `Preview ${res.format.toUpperCase()}:`;
  } catch (error) {
    exportPreviewTextarea.value = `Gagal memuat ekspor: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function htmlEscape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function createWorkspace(name: string, path?: string) {
  try {
    const state = await invokeCommand<DesktopWorkspaceState>('create_desktop_workspace', {
      name,
      path: path ?? null,
    });
    workspacesList = state.workspaces;
    activeWorkspaceName = name;
    updateChatHeaderWorkspaceInfo();
    startNewChatInWorkspace(name);
  } catch (error) {
    alert(error instanceof Error ? error.message : String(error));
  }
}

async function deleteWorkspace(name: string) {
  try {
    const state = await invokeCommand<DesktopWorkspaceState>('delete_desktop_workspace', { name });
    workspacesList = state.workspaces;
    if (activeWorkspaceName === name) {
      activeWorkspaceName = state.active || 'default';
    }
    updateChatHeaderWorkspaceInfo();
    await loadChatSessions();
  } catch (error) {
    alert(error instanceof Error ? error.message : String(error));
  }
}

async function moveSessionToWorkspace(sessionId: string, targetWorkspace: string) {
  try {
    await invokeCommand<DesktopChatSession>('move_desktop_chat_session_workspace', {
      sessionId,
      targetWorkspace: targetWorkspace === 'default' ? null : targetWorkspace,
    });
    await loadChatSessions();
  } catch (error) {
    alert(error instanceof Error ? error.message : String(error));
  }
}

function openFolderModal() {
  if (!folderModal) return;
  folderModal.hidden = false;
  if (folderNameInput) {
    folderNameInput.value = '';
    folderNameInput.focus();
  }
}

function closeFolderModal() {
  if (folderModal) folderModal.hidden = true;
}

function openMoveSessionModal(session: DesktopChatSession) {
  if (!moveSessionModal) return;
  pendingMoveSessionId = session.id;
  if (moveSessionTitleLabel) {
    moveSessionTitleLabel.textContent = `"${session.title || 'Sesi'}"`;
  }
  if (moveFolderSelect) {
    const allWs = new Set<string>(['default']);
    workspacesList.forEach((w) => allWs.add(w.name));
    moveFolderSelect.innerHTML = '';
    Array.from(allWs).forEach((ws) => {
      const opt = document.createElement('option');
      opt.value = ws;
      opt.textContent = ws === 'default' ? 'General (Default)' : ws;
      if (session.workspace === ws || (!session.workspace && ws === 'default')) {
        opt.selected = true;
      }
      moveFolderSelect.append(opt);
    });
  }
  moveSessionModal.hidden = false;
}

function closeMoveSessionModal() {
  if (moveSessionModal) moveSessionModal.hidden = true;
  pendingMoveSessionId = null;
}

function formatSessionTime(timestamp: number) {
  const elapsed = Math.max(0, Date.now() - timestamp);
  if (elapsed < 60_000) return 'baru saja';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}j`;
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(timestamp));
}

function startNewChatInWorkspace(workspaceName: string) {
  activeWorkspaceName = workspaceName;
  activeChatSessionId = '';
  pendingChatAttachments = [];
  userScrolledUp = false;
  showDesktopPage('chat');
  forceVisibleDesktopContent();
  updateChatHeaderWorkspaceInfo();
  renderChatSessions();
  renderChatMessages();
  renderPendingChatAttachments();
  resetChatProcess();
  chatInput?.focus();
}

function openChatSession(sessionId: string) {
  const session = chatSessions.find((s) => s.id === sessionId);
  if (session && session.workspace) {
    activeWorkspaceName = session.workspace;
  }
  activeChatSessionId = sessionId;
  userScrolledUp = false;
  showDesktopPage('chat');
  forceVisibleDesktopContent();
  updateChatHeaderWorkspaceInfo();
  renderChatSessions();
  renderChatMessages();
  chatInput?.focus();
}

function createSvgFromTemplate(svgMarkup: string): SVGElement {
  const container = document.createElement('div');
  container.innerHTML = svgMarkup.trim();
  return container.querySelector('svg')!;
}

function renderSidebarChatSessions() {
  if (!sidebarChatSessionList) return;

  const allWorkspaceNames = new Set<string>();
  allWorkspaceNames.add('default');
  workspacesList.forEach((w) => allWorkspaceNames.add(w.name));
  chatSessions.forEach((s) => {
    if (s.workspace) allWorkspaceNames.add(s.workspace);
  });

  const sortedWorkspaceNames = Array.from(allWorkspaceNames).sort((a, b) => {
    if (a === 'default') return -1;
    if (b === 'default') return 1;
    return a.localeCompare(b);
  });

  const sessionGroups = new Map<string, DesktopChatSession[]>();
  sortedWorkspaceNames.forEach((name) => sessionGroups.set(name, []));

  chatSessions.forEach((session) => {
    const ws = session.workspace || 'default';
    if (!sessionGroups.has(ws)) {
      sessionGroups.set(ws, []);
    }
    sessionGroups.get(ws)!.push(session);
  });

  const container = document.createElement('div');
  container.className = 'sidebar-workspace-group-list';

  sortedWorkspaceNames.forEach((wsName) => {
    const sessions = sessionGroups.get(wsName) || [];
    const isCollapsed = collapsedWorkspaces.has(wsName);
    const isDefault = wsName === 'default';
    const displayName = isDefault ? 'General' : wsName;

    const groupCard = document.createElement('div');
    groupCard.className = `sidebar-workspace-group${activeWorkspaceName === wsName ? ' group-active' : ''}`;

    // Folder Header
    const groupHeader = document.createElement('div');
    groupHeader.className = 'workspace-group-header';
    groupHeader.setAttribute('role', 'button');
    groupHeader.setAttribute('tabindex', '0');

    const headerLeft = document.createElement('div');
    headerLeft.className = 'group-header-left';

    const chevron = document.createElement('span');
    chevron.className = `group-chevron${isCollapsed ? ' collapsed' : ' expanded'}`;
    chevron.append(createSvgFromTemplate(
      '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>'
    ));

    const icon = document.createElement('span');
    icon.className = 'group-icon';
    if (isDefault) {
      icon.append(createSvgFromTemplate(
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>'
      ));
    } else {
      icon.append(createSvgFromTemplate(
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>'
      ));
    }

    const title = document.createElement('span');
    title.className = 'group-title';
    title.textContent = displayName;
    title.title = `Workspace: ${displayName}`;

    const countPill = document.createElement('span');
    countPill.className = 'group-count-pill';
    countPill.textContent = String(sessions.length);

    headerLeft.append(chevron, icon, title, countPill);

    // Header Actions
    const headerActions = document.createElement('div');
    headerActions.className = 'group-header-actions';

    const newChatInGroupBtn = document.createElement('button');
    newChatInGroupBtn.type = 'button';
    newChatInGroupBtn.className = 'group-btn-action';
    newChatInGroupBtn.title = `Buat sesi baru di ${displayName}`;
    newChatInGroupBtn.append(createSvgFromTemplate(
      '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>'
    ));
    newChatInGroupBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      startNewChatInWorkspace(wsName);
    });
    headerActions.append(newChatInGroupBtn);

    if (!isDefault) {
      const deleteGroupBtn = document.createElement('button');
      deleteGroupBtn.type = 'button';
      deleteGroupBtn.className = 'group-btn-action group-btn-delete';
      deleteGroupBtn.title = `Hapus folder ${displayName}`;
      deleteGroupBtn.append(createSvgFromTemplate(
        '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>'
      ));
      deleteGroupBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`Hapus folder "${displayName}"? Sesi di dalamnya akan dipindahkan ke General.`)) {
          await deleteWorkspace(wsName);
        }
      });
      headerActions.append(deleteGroupBtn);
    }

    groupHeader.append(headerLeft, headerActions);

    groupHeader.addEventListener('click', () => {
      if (collapsedWorkspaces.has(wsName)) {
        collapsedWorkspaces.delete(wsName);
      } else {
        collapsedWorkspaces.add(wsName);
      }
      renderSidebarChatSessions();
    });

    groupCard.append(groupHeader);

    // Sibling Sessions List inside this folder
    if (!isCollapsed) {
      const sessionListEl = document.createElement('div');
      sessionListEl.className = 'group-session-list';

      if (sessions.length === 0) {
        const emptyEl = document.createElement('div');
        emptyEl.className = 'group-session-empty';
        emptyEl.textContent = 'Belum ada sesi';
        sessionListEl.append(emptyEl);
      } else {
        sessions.forEach((session) => {
          const sessionRow = document.createElement('div');
          sessionRow.className = `sidebar-chat-session-row${session.id === activeChatSessionId ? ' active' : ''}`;

          const sessionBtn = document.createElement('button');
          sessionBtn.type = 'button';
          sessionBtn.className = `sidebar-chat-session-btn sidebar-chat-session${session.id === activeChatSessionId ? ' active' : ''}`;
          sessionBtn.title = session.title;

          const sessionHeaderRow = document.createElement('div');
          sessionHeaderRow.className = 'session-header-row';

          const chatIcon = document.createElement('span');
          chatIcon.className = 'session-chat-icon';
          chatIcon.append(createSvgFromTemplate(
            '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>'
          ));

          const sessionTitle = document.createElement('span');
          sessionTitle.className = 'session-title-text';
          sessionTitle.textContent = session.title || 'Sesi tanpa judul';

          sessionHeaderRow.append(chatIcon, sessionTitle);

          const sessionMeta = document.createElement('small');
          sessionMeta.className = 'session-meta-text';
          sessionMeta.textContent = `${session.messages.length} pesan · ${formatSessionTime(session.updated_at_ms)}`;

          sessionBtn.append(sessionHeaderRow, sessionMeta);
          sessionBtn.addEventListener('click', () => {
            activeWorkspaceName = wsName;
            openChatSession(session.id);
          });

          // Options Button (⋮)
          const optionsBtn = document.createElement('button');
          optionsBtn.type = 'button';
          optionsBtn.className = 'session-options-btn';
          optionsBtn.title = 'Pindahkan sesi ke folder lain';
          optionsBtn.append(createSvgFromTemplate(
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>'
          ));
          optionsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openMoveSessionModal(session);
          });

          sessionRow.append(sessionBtn, optionsBtn);
          sessionListEl.append(sessionRow);
        });
      }
      groupCard.append(sessionListEl);
    }

    container.append(groupCard);
  });

  sidebarChatSessionList.replaceChildren(container);
}

let mermaidRenderTimer: ReturnType<typeof setTimeout> | null = null;

async function renderMermaidDiagrams(container: HTMLElement) {
  if (activeChatStreamRequestId) return;

  const codeBlocks = container.querySelectorAll<HTMLElement>('pre code');
  let idCounter = 0;
  for (const block of Array.from(codeBlocks)) {
    const parentPre = block.parentElement;
    if (!parentPre) continue;
    if (parentPre.classList.contains('mermaid-rendered')) continue;

    const rawChartCode = block.textContent?.trim() || '';
    if (!rawChartCode) continue;

    const cleanChartCode = rawChartCode
      .replace(/^```(?:mermaid|chart|graph|flowchart|pie)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    const isExplicit = block.className.includes('language-mermaid') || block.className.includes('language-chart');
    const startsWithKeyword = /^(graph\s+|flowchart\s+|sequenceDiagram|pie(\s+|$)|gantt|gitGraph|classDiagram|erDiagram|mindmap|stateDiagram|quadrantChart|sankey|timeline|xychart)/i.test(cleanChartCode);

    if (!isExplicit && !startsWithKeyword) {
      continue;
    }

    const mermaidApi = await getMermaid();
    if (!mermaidApi) continue;

    const chartId = `mermaid_svg_${Date.now()}_${++idCounter}`;

    try {
      const isValid = await mermaidApi.parse(cleanChartCode, { suppressErrors: true });
      if (!isValid) continue;

      const { svg } = await mermaidApi.render(chartId, cleanChartCode);
      if (!svg || svg.includes('aria-roledescription="error"') || svg.includes('class="error-icon"')) {
        continue;
      }

      const chartWrapper = document.createElement('div');
      chartWrapper.className = 'mermaid-chart-wrapper mermaid-rendered';

      const chartHeader = document.createElement('div');
      chartHeader.className = 'mermaid-chart-header';
      chartHeader.innerHTML = `
        <span class="mermaid-chart-title">📊 Visual Diagram / Chart</span>
        <button type="button" class="mermaid-copy-btn">📋 Salin Source</button>
      `;
      const copyBtn = chartHeader.querySelector('.mermaid-copy-btn') as HTMLButtonElement;
      if (copyBtn) {
        copyBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(rawChartCode).then(() => {
            copyBtn.textContent = '✓ Tersalin';
            setTimeout(() => {
              copyBtn.textContent = '📋 Salin Source';
            }, 2000);
          });
        });
      }

      const chartContent = document.createElement('div');
      chartContent.className = 'mermaid-chart-content';
      chartContent.innerHTML = svg;
      chartWrapper.append(chartHeader, chartContent);
      parentPre.replaceWith(chartWrapper);
    } catch (err) {
      console.warn('[Mermaid Render Warning]', err);
      document.querySelectorAll('#dmermaid, [id*="dmermaid"], svg[aria-roledescription="error"]').forEach((el) => {
        if (!el.closest('.mermaid-chart-content')) {
          el.remove();
        }
      });
    }
  }
}

if (typeof window !== 'undefined') {
  (window as any).renderMermaidDiagrams = renderMermaidDiagrams;
}

let userScrolledUp = false;
let chatStreamRenderRaf: number | null = null;

function scheduleChatStreamRender() {
  if (chatStreamRenderRaf !== null) return;
  chatStreamRenderRaf = window.requestAnimationFrame(() => {
    chatStreamRenderRaf = null;
    renderChatMessages();
  });
}

function renderStreamingMessageInPlace(session: DesktopChatSession, targetStreamId: string): boolean {
  if (!chatMessages) return false;

  const streamingItem = chatMessages.querySelector<HTMLElement>('.chat-message-streaming');
  const targetMessage = session.messages.find((m) => m.id === targetStreamId);

  if (!streamingItem || !targetMessage) {
    return false;
  }

  const liveProcessContainer = chatMessages.querySelector<HTMLElement>('.chat-process-live');
  if (liveProcessContainer && activeChatProcesses.length > 0) {
    const updated = renderChatProcess(activeChatProcesses, true);
    updated.classList.add('chat-process-live');
    liveProcessContainer.replaceWith(updated);
  } else if (!liveProcessContainer && activeChatProcesses.length > 0) {
    const newProcess = renderChatProcess(activeChatProcesses, true);
    newProcess.classList.add('chat-process-live');
    streamingItem.before(newProcess);
  }

  const body = streamingItem.querySelector<HTMLElement>('.chat-message-body');
  if (body) {
    if (targetMessage.content) {
      body.innerHTML = marked.parse(targetMessage.content) as string;
    } else {
      body.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
    }
  }

  updateChatTokenGauge(session);

  if (!userScrolledUp) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  return true;
}

function renderChatMessages() {
  if (!chatMessages) return;
  const session = chatSessions.find((item) => item.id === activeChatSessionId);
  if (!session || session.messages.length === 0) {
    chatMessages.innerHTML = '<p class="empty-copy">Kirim pesan untuk memulai sesi Desktop.</p>';
    if (chatMemoryContext) chatMemoryContext.textContent = '';
    return;
  }

  if (activeChatStreamRequestId) {
    const targetStreamId = `stream-${activeChatStreamRequestId}`;
    if (renderStreamingMessageInPlace(session, targetStreamId)) {
      return;
    }
  }

  renderFullChatMessages(session);
}

function renderFullChatMessages(session: DesktopChatSession) {
  if (!chatMessages) return;
  const activeProcessTargetId = activeChatStreamRequestId ? `stream-${activeChatStreamRequestId}` : '';
  const sessionProcessHistory = chatProcessHistory.get(session.id);
  const messageNodes: HTMLElement[] = [];
  for (const message of session.messages) {
    const historicalProcesses = (message.processes && message.processes.length > 0)
      ? message.processes
      : (sessionProcessHistory?.get(message.id) ?? []);
    if (historicalProcesses.length > 0) {
      messageNodes.push(renderChatProcess(historicalProcesses, false));
    }
    if (activeChatProcesses.length > 0 && message.id === activeProcessTargetId) {
      const liveProcessEl = renderChatProcess(activeChatProcesses, true);
      liveProcessEl.classList.add('chat-process-live');
      messageNodes.push(liveProcessEl);
    }
    const item = document.createElement('div');
    item.className = `chat-message chat-message-${message.role}`;
    if (message.id === `stream-${activeChatStreamRequestId}`) {
      item.classList.add('chat-message-streaming');
    }
    const body = document.createElement('div');
    body.className = 'chat-message-body';
    if (message.role === 'user') {
      body.textContent = message.content;
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'user-msg-edit-btn';
      editBtn.title = 'Gunakan kembali prompt ini';
      editBtn.textContent = '✎';
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (chatInput) {
          chatInput.value = message.content;
          chatInput.focus();
        }
      });
      item.append(editBtn);
    } else {
      if (message.content) {
        body.innerHTML = marked.parse(message.content) as string;

        body.querySelectorAll('pre code').forEach((codeBlock) => {
          const text = codeBlock.textContent || '';
          const pre = codeBlock.parentElement;
          if (!pre || pre.querySelector('.code-preview-header')) return;

          const firstLine = text.split('\n')[0].trim();
          const fileMatch = firstLine.match(/^(?:\/\/|#|\/\*|<!--)\s*(?:file:)?\s*([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)/i);
          const targetPath = fileMatch ? fileMatch[1] : null;

          const header = document.createElement('div');
          header.className = 'code-preview-header';
          header.innerHTML = `
            <span class="code-file-path">${targetPath || codeBlock.className.replace('language-', '') || 'code'}</span>
            <div style="display: flex; gap: 4px;">
              ${targetPath ? `<button type="button" class="code-apply-btn" data-path="${targetPath}">⚡ Terapkan</button>` : ''}
              <button type="button" class="code-copy-btn">Salin</button>
            </div>
          `;
          const copyBtn = header.querySelector('.code-copy-btn');
          copyBtn?.addEventListener('click', () => {
            navigator.clipboard.writeText(text);
            copyBtn.textContent = '✓ Disalin';
            setTimeout(() => { copyBtn.textContent = 'Salin'; }, 1500);
          });
          const applyBtn = header.querySelector('.code-apply-btn') as HTMLButtonElement | null;
          if (applyBtn && targetPath) {
            applyBtn.addEventListener('click', async () => {
              try {
                applyBtn.disabled = true;
                applyBtn.textContent = 'Menerapkan...';
                await invokeCommand<boolean>('apply_code_to_file', { path: targetPath, content: text });
                applyBtn.classList.add('applied');
                applyBtn.textContent = '✓ Diterapkan';
                void loadWorkspaceFiles();
                void loadWorkspaceGitStatus();
                setTimeout(() => {
                  applyBtn.classList.remove('applied');
                  applyBtn.textContent = '⚡ Terapkan';
                  applyBtn.disabled = false;
                }, 2500);
              } catch (err) {
                alert(err instanceof Error ? err.message : String(err));
                applyBtn.disabled = false;
                applyBtn.textContent = '⚡ Terapkan';
              }
            });
          }
          pre.prepend(header);
        });
      } else if (message.id === `stream-${activeChatStreamRequestId}`) {
        body.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
      } else {
        body.textContent = '';
      }
    }
    item.append(body);
    if (message.attachments?.length) {
      item.append(renderChatAttachmentList(message.attachments, false));
    }
    messageNodes.push(item);
  }
  chatMessages.replaceChildren(...messageNodes);

  updateChatTokenGauge(session);

  // Smart auto-scroll: Only auto-scroll to bottom if user has not scrolled up to inspect history/trajectory
  if (!userScrolledUp) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
    window.requestAnimationFrame(() => {
      if (chatMessages && !userScrolledUp) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    });
  }

  // Defer heavy mermaid diagrams rendering until stream is complete to avoid webview CPU lockup/crashes
  if (!activeChatStreamRequestId) {
    if (mermaidRenderTimer) clearTimeout(mermaidRenderTimer);
    mermaidRenderTimer = setTimeout(() => {
      if (chatMessages) renderMermaidDiagrams(chatMessages);
    }, 150);
  }

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

function chatProcessIcon(kind: string): string {
  switch (kind) {
    case 'thinking':
    case 'reasoning':
      return '🧠';
    case 'analysis':
      return '🔍';
    case 'memory':
      return '💾';
    case 'tool_start':
    case 'tool':
      return '🛠️';
    case 'tool_done':
      return '⚡';
    case 'skill':
    case 'skill_start':
    case 'skill_done':
      return '🪄';
    case 'explore':
      return '📂';
    case 'complete':
      return '✅';
    case 'error':
      return '❌';
    default:
      return '✦';
  }
}

interface UnifiedAgentAction {
  id: string;
  category: 'tool' | 'reasoning' | 'context' | 'info';
  toolName?: string;
  toolTarget?: string;
  toolArgsRaw?: string;
  title: string;
  status: 'running' | 'completed' | 'error';
  output?: string;
  startTime: number;
  endTime?: number;
}

function parseToolExecution(text: string): { toolName: string; target: string; rawArgs: string } | null {
  const match = text.match(/Eksekusi Tool:\s*`([^`]+)`\s*\((.*)\)/);
  if (!match) return null;
  const toolName = match[1];
  const rawArgs = match[2];
  let target = '';
  try {
    const parsed = JSON.parse(rawArgs);
    if (parsed.path) target = parsed.path;
    else if (parsed.command) target = parsed.command;
    else if (parsed.url) target = parsed.url;
    else if (parsed.query) target = parsed.query;
    else if (parsed.pattern) target = parsed.pattern;
    else if (parsed.goal) target = parsed.goal;
    else target = Object.values(parsed).join(', ');
  } catch {
    target = rawArgs;
  }
  return { toolName, target, rawArgs };
}

function aggregateAgentProcesses(processes: ChatProcessEntry[]): UnifiedAgentAction[] {
  const actions: UnifiedAgentAction[] = [];

  for (const p of processes) {
    if (p.kind === 'tool_start') {
      const parsed = parseToolExecution(p.text);
      if (parsed) {
        actions.push({
          id: `action-${actions.length + 1}`,
          category: 'tool',
          toolName: parsed.toolName,
          toolTarget: parsed.target,
          toolArgsRaw: parsed.rawArgs,
          title: parsed.toolName,
          status: 'running',
          startTime: p.createdAt,
        });
      } else {
        actions.push({
          id: `action-${actions.length + 1}`,
          category: 'tool',
          toolName: 'tool_call',
          title: 'Eksekusi Tool',
          status: 'running',
          output: p.text,
          startTime: p.createdAt,
        });
      }
    } else if (p.kind === 'tool_done') {
      const match = p.text.match(/^✓ Hasil `([^`]+)`:\s*([\s\S]*)$/);
      if (match) {
        const toolName = match[1];
        const rawOutput = match[2];
        const runningTool = [...actions].reverse().find(
          (a) => a.category === 'tool' && (a.toolName === toolName || a.status === 'running')
        );
        if (runningTool) {
          runningTool.status = 'completed';
          runningTool.output = rawOutput;
          runningTool.endTime = p.createdAt;
        } else {
          actions.push({
            id: `action-${actions.length + 1}`,
            category: 'tool',
            toolName,
            title: toolName,
            status: 'completed',
            output: rawOutput,
            startTime: p.createdAt,
            endTime: p.createdAt,
          });
        }
      } else if (p.text.includes('Provider stream selesai')) {
        actions.forEach((a) => {
          if (a.status === 'running') {
            a.status = 'completed';
            a.endTime = p.createdAt;
          }
        });
      } else {
        actions.push({
          id: `action-${actions.length + 1}`,
          category: 'tool',
          toolName: 'result',
          title: 'Hasil Tool',
          status: 'completed',
          output: p.text,
          startTime: p.createdAt,
          endTime: p.createdAt,
        });
      }
    } else if (p.kind === 'reasoning') {
      const last = actions[actions.length - 1];
      if (last && last.category === 'reasoning' && last.status === 'running') {
        last.output = (last.output || '') + p.text;
        last.endTime = p.createdAt;
      } else {
        actions.push({
          id: `action-${actions.length + 1}`,
          category: 'reasoning',
          title: 'Deep Reasoning Stream',
          status: 'running',
          output: p.text,
          startTime: p.createdAt,
          endTime: p.createdAt,
        });
      }
    } else if (p.kind === 'thinking') {
      actions.push({
        id: `action-${actions.length + 1}`,
        category: 'info',
        title: 'Inisialisasi Agen',
        status: 'completed',
        output: p.text,
        startTime: p.createdAt,
        endTime: p.createdAt,
      });
    } else if (p.kind === 'explore') {
      actions.push({
        id: `action-${actions.length + 1}`,
        category: 'context',
        title: 'Workspace Scanner',
        status: 'completed',
        output: p.text,
        startTime: p.createdAt,
        endTime: p.createdAt,
      });
    } else if (p.kind === 'memory') {
      actions.push({
        id: `action-${actions.length + 1}`,
        category: 'context',
        title: 'Persistent Memory',
        status: 'completed',
        output: p.text,
        startTime: p.createdAt,
        endTime: p.createdAt,
      });
    } else if (p.kind === 'skill') {
      actions.push({
        id: `action-${actions.length + 1}`,
        category: 'tool',
        toolName: 'skill_run',
        title: 'Skill Execution',
        status: 'completed',
        output: p.text,
        startTime: p.createdAt,
        endTime: p.createdAt,
      });
    } else if (p.kind === 'analysis') {
      actions.push({
        id: `action-${actions.length + 1}`,
        category: 'context',
        title: 'Analisis Konteks',
        status: 'completed',
        output: p.text,
        startTime: p.createdAt,
        endTime: p.createdAt,
      });
    } else if (p.kind === 'complete') {
      actions.forEach((a) => {
        if (a.status === 'running') {
          a.status = 'completed';
          a.endTime = p.createdAt;
        }
      });
    } else if (p.kind === 'error') {
      const last = actions[actions.length - 1];
      if (last && last.status === 'running') {
        last.status = 'error';
        last.output = p.text;
        last.endTime = p.createdAt;
      } else {
        actions.push({
          id: `action-${actions.length + 1}`,
          category: 'info',
          title: 'System Error',
          status: 'error',
          output: p.text,
          startTime: p.createdAt,
          endTime: p.createdAt,
        });
      }
    } else {
      actions.push({
        id: `action-${actions.length + 1}`,
        category: 'info',
        title: 'Aktivitas Agen',
        status: 'completed',
        output: p.text,
        startTime: p.createdAt,
        endTime: p.createdAt,
      });
    }
  }

  return actions;
}

function renderFileListPreview(output: string): HTMLElement {
  const container = document.createElement('div');
  container.className = 'file-list-preview-container';

  const items = output.split('\n').map((s) => s.trim()).filter(Boolean);
  const countBadge = document.createElement('div');
  countBadge.className = 'file-list-count';
  countBadge.textContent = `${items.length} file & direktori ditemukan:`;
  container.append(countBadge);

  const chipsWrapper = document.createElement('div');
  chipsWrapper.className = 'file-chips-grid';

  items.forEach((item) => {
    const isDir = item.endsWith('/');
    const chip = document.createElement('span');
    chip.className = `file-chip ${isDir ? 'chip-dir' : 'chip-file'}`;
    chip.innerHTML = `<span class="chip-icon">${isDir ? '📁' : '📄'}</span><span class="chip-name">${item}</span>`;
    chipsWrapper.append(chip);
  });

  container.append(chipsWrapper);
  return container;
}

function renderCodePreview(output: string, targetPath?: string): HTMLElement {
  const container = document.createElement('div');
  container.className = 'code-preview-card';

  const header = document.createElement('div');
  header.className = 'code-preview-header';
  header.innerHTML = `
    <span class="code-file-path">${targetPath || 'File Content'}</span>
    <button type="button" class="code-copy-btn">📋 Salin</button>
  `;

  const copyBtn = header.querySelector('.code-copy-btn') as HTMLButtonElement;
  if (copyBtn) {
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(output).then(() => {
        copyBtn.textContent = '✓ Tersalin';
        setTimeout(() => {
          copyBtn.textContent = '📋 Salin';
        }, 2000);
      });
    });
  }

  const pre = document.createElement('pre');
  pre.className = 'code-preview-body';
  pre.textContent = output;

  container.append(header, pre);
  return container;
}

function renderDiffPreview(diffText: string): HTMLElement {
  const container = document.createElement('div');
  container.className = 'diff-viewer-card';

  let cleanDiff = diffText;
  const match = diffText.match(/```diff\n([\s\S]*?)```/);
  if (match) {
    cleanDiff = match[1];
  }

  const lines = cleanDiff.split('\n');
  let addedCount = 0;
  let deletedCount = 0;

  lines.forEach((l) => {
    if (l.startsWith('+ ') && !l.startsWith('+++')) addedCount++;
    if (l.startsWith('- ') && !l.startsWith('---')) deletedCount++;
  });

  const header = document.createElement('div');
  header.className = 'diff-viewer-header';
  header.innerHTML = `
    <span class="diff-title">📄 File Diff Preview</span>
    <span class="diff-stats">
      <span class="diff-badge-add">+${addedCount}</span>
      <span class="diff-badge-del">-${deletedCount}</span>
    </span>
  `;

  const body = document.createElement('div');
  body.className = 'diff-viewer-body';

  lines.forEach((line) => {
    const lineEl = document.createElement('div');
    if (line.startsWith('+++') || line.startsWith('---')) {
      lineEl.className = 'diff-line diff-line-file';
    } else if (line.startsWith('@@')) {
      lineEl.className = 'diff-line diff-line-chunk';
    } else if (line.startsWith('+')) {
      lineEl.className = 'diff-line diff-line-add';
    } else if (line.startsWith('-')) {
      lineEl.className = 'diff-line diff-line-del';
    } else {
      lineEl.className = 'diff-line diff-line-context';
    }
    lineEl.textContent = line;
    body.append(lineEl);
  });

  container.append(header, body);
  return container;
}

function renderTerminalOutput(text: string): HTMLElement {
  const container = document.createElement('div');
  container.className = 'terminal-console-card';

  // Extract Status from anywhere in the output
  const statusMatch = text.match(/\[Status:\s*([^\]]+)\]/);
  const statusRaw = statusMatch ? statusMatch[1] : '';
  const isSuccess = statusRaw
    ? (statusRaw.includes('Success') || statusRaw.includes('code 0') || statusRaw.includes('Exit 0'))
    : (!text.includes('Error') && !text.includes('failed') && !text.includes('Exit failed'));

  // Extract Command Header
  let cmdLine = '$ command';
  if (text.startsWith('$ ')) {
    if (statusMatch && statusMatch.index !== undefined) {
      cmdLine = text.slice(0, statusMatch.index).trim();
    } else {
      cmdLine = text.split('\n')[0] || '$ command';
    }
  }

  // Extract Output Body (after [Status: ...])
  let outputBody = '';
  if (statusMatch && statusMatch.index !== undefined) {
    outputBody = text.slice(statusMatch.index + statusMatch[0].length).trim();
  } else {
    outputBody = text;
  }

  const header = document.createElement('div');
  header.className = 'terminal-console-header';
  header.innerHTML = `
    <span class="terminal-prompt-title" title="${cmdLine.replace(/"/g, '&quot;')}">${cmdLine}</span>
    <span class="terminal-status-badge ${isSuccess ? 'badge-success' : 'badge-failure'}">
      ${isSuccess ? '✓ Exit 0' : '✕ Exit Error'}
    </span>
  `;

  const body = document.createElement('pre');
  body.className = 'terminal-console-body';
  body.textContent = outputBody || '(Command produced no output)';

  container.append(header, body);
  return container;
}

function getFileExtensionBadge(pathOrFilename: string): { ext: string; className: string } {
  const clean = pathOrFilename.replace(/['"`]/g, '').trim();
  const match = clean.match(/\.([a-zA-Z0-9_-]+)(?:#|:|\?|$)/);
  const ext = match ? match[1].toLowerCase() : '';
  switch (ext) {
    case 'ts':
    case 'tsx':
      return { ext: 'ts', className: 'ext-badge-ts' };
    case 'js':
    case 'jsx':
      return { ext: 'js', className: 'ext-badge-js' };
    case 'rs':
      return { ext: 'rs', className: 'ext-badge-rs' };
    case 'json':
      return { ext: 'json', className: 'ext-badge-json' };
    case 'md':
      return { ext: 'md', className: 'ext-badge-md' };
    case 'sh':
    case 'bash':
      return { ext: 'sh', className: 'ext-badge-sh' };
    case 'css':
    case 'html':
      return { ext: ext, className: 'ext-badge-css' };
    case 'py':
      return { ext: 'py', className: 'ext-badge-py' };
    case 'toml':
    case 'yaml':
    case 'yml':
      return { ext: ext, className: 'ext-badge-toml' };
    default:
      return { ext: ext || 'file', className: 'ext-badge-file' };
  }
}

function renderChatProcess(processes: ChatProcessEntry[], running: boolean) {
  let actions = aggregateAgentProcesses(processes);
  if (actions.length === 0) {
    if (running) {
      actions = [{
        id: 'action-init',
        category: 'info',
        title: 'Inisialisasi',
        status: 'running',
        output: 'Menyiapkan sesi agen...',
        startTime: Date.now(),
      }];
    } else {
      actions = [{
        id: 'action-done',
        category: 'info',
        title: 'Selesai',
        status: 'completed',
        output: 'Respons selesai.',
        startTime: Date.now(),
      }];
    }
  }

  const container = document.createElement('div');
  container.className = `chat-process agent-tree-container${running ? ' tree-running' : ' tree-completed'}`;

  const firstStart = actions[0]?.startTime ?? Date.now();
  const lastEnd = actions[actions.length - 1]?.endTime || Date.now();
  const totalSec = Math.max(1, Math.round((lastEnd - firstStart) / 1000));

  // Root Header: "Worked for Xs ⌄" or "Working for Xs ⌄"
  const rootWrapper = document.createElement('div');
  rootWrapper.className = 'agent-tree-root-wrapper';

  const rootHeader = document.createElement('div');
  rootHeader.className = 'agent-tree-root';
  rootHeader.role = 'button';
  rootHeader.tabIndex = 0;

  if (running) {
    const pulseDot = document.createElement('span');
    pulseDot.className = 'tree-dot-pulse';
    rootHeader.append(pulseDot);
  }

  const rootText = document.createElement('span');
  rootText.className = 'tree-status-text';
  rootText.textContent = running ? `Working for ${totalSec}s` : `Worked for ${totalSec}s`;
  rootHeader.append(rootText);

  const rootChevron = document.createElement('span');
  rootChevron.className = 'tree-root-chevron';
  rootChevron.textContent = '⌄';
  rootHeader.append(rootChevron);

  // Copy Log Button
  const toolCount = actions.filter((a) => a.category === 'tool').length;
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'tree-copy-btn';
  copyBtn.title = 'Salin ringkasan log aktivitas agen';
  copyBtn.innerHTML = '<span>📋</span>';
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const markdownLines: string[] = [
      '### ⚡ Smara Agent Execution Trace',
      `*Total: ${toolCount} tool calls, ${actions.length} aktivitas.*`,
      '',
    ];
    actions.forEach((a, idx) => {
      const dur = a.endTime ? ` (${((a.endTime - a.startTime) / 1000).toFixed(1)}s)` : '';
      if (a.category === 'tool') {
        const preview = a.output ? ` → *${a.output.replace(/\n+/g, ' ').slice(0, 120)}*` : '';
        markdownLines.push(`${idx + 1}. **${a.toolName}** \`${a.toolTarget || ''}\`${dur}${preview}`);
      } else if (a.category === 'reasoning') {
        const words = a.output?.trim().split(/\s+/).length || 0;
        markdownLines.push(`${idx + 1}. 🧠 **Deep Reasoning** (${words} kata)${dur}`);
      } else {
        markdownLines.push(`${idx + 1}. ✦ **${a.title}**: ${a.output || ''}${dur}`);
      }
    });

    navigator.clipboard.writeText(markdownLines.join('\n')).then(() => {
      copyBtn.innerHTML = '<span>✓</span>';
      setTimeout(() => {
        copyBtn.innerHTML = '<span>📋</span>';
      }, 2000);
    });
  });

  rootWrapper.append(rootHeader, copyBtn);
  container.append(rootWrapper);

  // Tree Body
  const treeBody = document.createElement('div');
  treeBody.className = 'agent-tree-body';

  const toggleTree = () => {
    const isColl = treeBody.classList.toggle('collapsed');
    rootChevron.textContent = isColl ? '›' : '⌄';
  };

  rootHeader.addEventListener('click', () => toggleTree());
  rootHeader.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleTree();
    }
  });

  actions.forEach((action, index) => {
    const isLast = index === actions.length - 1;
    const isActionRunning = running && isLast && action.status === 'running';

    const itemWrapper = document.createElement('div');
    itemWrapper.className = 'agent-tree-item';

    const row = document.createElement('div');
    row.className = 'agent-tree-row';

    let hasDrawer = false;
    let drawerContent: HTMLElement | null = null;

    if (action.category === 'reasoning') {
      const rawText = action.output || '';
      const dur = Math.max(1, Math.round(((action.endTime || Date.now()) - action.startTime) / 1000));
      const verb = document.createElement('span');
      verb.className = 'tree-action-verb';
      verb.textContent = isActionRunning ? 'Thinking...' : `Thought for ${dur}s`;
      row.append(verb);

      if (rawText) {
        hasDrawer = true;
        const box = document.createElement('div');
        box.className = 'step-reasoning-box';
        box.textContent = rawText;
        drawerContent = box;
      }
    } else if (action.toolName === 'read_file' || action.toolName === 'view_file') {
      const verb = document.createElement('span');
      verb.className = 'tree-action-verb';
      verb.textContent = 'Analyzed';

      const targetPath = action.toolTarget || 'file';
      const badgeInfo = getFileExtensionBadge(targetPath);
      const badge = document.createElement('span');
      badge.className = `ext-badge ${badgeInfo.className}`;
      badge.textContent = badgeInfo.ext;

      const targetSpan = document.createElement('span');
      targetSpan.className = 'tree-target';
      targetSpan.textContent = targetPath.split('/').pop() || targetPath;
      targetSpan.title = targetPath;

      row.append(verb, badge, targetSpan);

      // Line metadata if present
      if (action.toolArgsRaw) {
        try {
          const parsed = JSON.parse(action.toolArgsRaw);
          if (parsed.StartLine || parsed.EndLine) {
            const lineSpan = document.createElement('span');
            lineSpan.className = 'tree-line-meta';
            lineSpan.textContent = parsed.EndLine
              ? `#L${parsed.StartLine || 1}-${parsed.EndLine}`
              : `#L${parsed.StartLine}`;
            row.append(lineSpan);
          }
        } catch {}
      }

      if (action.output) {
        hasDrawer = true;
        drawerContent = renderCodePreview(action.output, action.toolTarget);
      }
    } else if (action.toolName === 'edit_file' || action.toolName === 'write_file' || action.toolName === 'apply_diff') {
      const verb = document.createElement('span');
      verb.className = 'tree-action-verb';
      verb.textContent = action.toolName === 'write_file' ? 'Wrote' : 'Edited';

      const targetPath = action.toolTarget || 'file';
      const badgeInfo = getFileExtensionBadge(targetPath);
      const badge = document.createElement('span');
      badge.className = `ext-badge ${badgeInfo.className}`;
      badge.textContent = badgeInfo.ext;

      const targetSpan = document.createElement('span');
      targetSpan.className = 'tree-target';
      targetSpan.textContent = targetPath.split('/').pop() || targetPath;
      targetSpan.title = targetPath;

      row.append(verb, badge, targetSpan);

      // Diff counter stats
      if (action.output) {
        const addCount = (action.output.match(/^\+[^+]/gm) || []).length;
        const delCount = (action.output.match(/^-[^-]/gm) || []).length;
        if (addCount > 0 || delCount > 0) {
          const statsSpan = document.createElement('span');
          statsSpan.className = 'tree-diff-stats';
          statsSpan.innerHTML = `${addCount > 0 ? `<span class="diff-add">+${addCount}</span> ` : ''}${delCount > 0 ? `<span class="diff-del">-${delCount}</span>` : ''}`;
          row.append(statsSpan);
        }
        hasDrawer = true;
        drawerContent = renderDiffPreview(action.output);
      }
    } else if (action.toolName === 'run_command') {
      const verb = document.createElement('span');
      verb.className = 'tree-action-verb';
      verb.textContent = 'Ran';

      const cmdSpan = document.createElement('code');
      cmdSpan.className = 'tree-cmd';
      const cmdText = action.toolTarget || action.toolArgsRaw || '';
      cmdSpan.textContent = cmdText;
      cmdSpan.title = cmdText;

      row.append(verb, cmdSpan);

      if (action.output) {
        hasDrawer = true;
        drawerContent = renderTerminalOutput(action.output);
      }
    } else if (action.toolName === 'list_dir' || action.toolName === 'search_path' || action.toolName === 'glob' || action.toolName === 'analyze_workspace') {
      const verb = document.createElement('span');
      verb.className = 'tree-action-verb';
      verb.textContent = 'Explored';

      const targetSpan = document.createElement('span');
      targetSpan.className = 'tree-target';
      targetSpan.textContent = action.toolTarget || 'workspace';
      row.append(verb, targetSpan);

      if (action.output && !action.output.includes('Error')) {
        hasDrawer = true;
        drawerContent = renderFileListPreview(action.output);
      }
    } else if (action.category === 'context') {
      const verb = document.createElement('span');
      verb.className = 'tree-action-verb';
      verb.textContent = action.title;

      const targetSpan = document.createElement('span');
      targetSpan.className = 'tree-target';
      targetSpan.textContent = action.output || '';
      row.append(verb, targetSpan);
    } else {
      const verb = document.createElement('span');
      verb.className = 'tree-action-verb';
      verb.textContent = action.title || 'Aktivitas';

      if (action.output) {
        const textSpan = document.createElement('span');
        textSpan.className = 'tree-target';
        textSpan.textContent = action.output;
        row.append(verb, textSpan);
      } else {
        row.append(verb);
      }
    }

    if (hasDrawer && drawerContent) {
      row.classList.add('has-drawer');
      const itemChevron = document.createElement('span');
      itemChevron.className = 'tree-item-chevron';
      itemChevron.textContent = '›';
      row.append(itemChevron);

      const drawer = document.createElement('div');
      drawer.className = 'agent-tree-drawer drawer-collapsed';
      drawer.append(drawerContent);

      row.addEventListener('click', () => {
        const isColl = drawer.classList.toggle('drawer-collapsed');
        itemChevron.textContent = isColl ? '›' : '⌄';
      });

      itemWrapper.append(row, drawer);
    } else {
      itemWrapper.append(row);
    }

    treeBody.append(itemWrapper);
  });

  const rawBox = document.createElement('div');
  rawBox.className = 'chat-process-raw-text';
  rawBox.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
  rawBox.textContent = `${processes.map((p) => p.text).join(' ')} ${running ? 'Running' : 'Complete'}`;
  container.append(rawBox);

  container.append(treeBody);
  if (running) {
    window.requestAnimationFrame(() => {
      treeBody.scrollTop = treeBody.scrollHeight;
    });
  }
  return container;
}

function resetChatProcess() {
  activeChatProcesses = [];
}

function appendChatProcess(kind: string, text: string) {
  const content = text.trim();
  if (!content) return;
  activeChatProcesses.push({ kind, text: content, createdAt: Date.now() });
  activeChatProcesses = activeChatProcesses.slice(-40);
}

function applyChatStreamEvent(event: DesktopChatStreamEvent) {
  if (!activeChatStreamRequestId || event.request_id !== activeChatStreamRequestId) {
    return;
  }

  if (event.kind === 'thinking_delta') {
    const last = activeChatProcesses[activeChatProcesses.length - 1];
    if (last && last.kind === 'reasoning') {
      last.text += event.delta;
    } else {
      activeChatProcesses.push({ kind: 'reasoning', text: event.delta, createdAt: Date.now() });
    }
    if (chatStatus) chatStatus.textContent = '🧠 Reasoning & Thinking...';
    scheduleChatStreamRender();
    return;
  }

  if (event.kind !== 'delta') {
    appendChatProcess(event.kind, event.delta);
    if (chatStatus) {
      if (event.kind === 'thinking') chatStatus.textContent = '🧠 Thinking...';
      if (event.kind === 'analysis') chatStatus.textContent = '🔍 Menganalisis konteks...';
      if (event.kind === 'memory') chatStatus.textContent = '💾 Membaca memori...';
      if (event.kind === 'skill') chatStatus.textContent = '🪄 Memproses skills...';
      if (event.kind === 'tool_start') chatStatus.textContent = '🛠️ Memanggil tools...';
      if (event.kind === 'tool_done') chatStatus.textContent = '⚡ Tools selesai...';
      if (event.kind === 'error') chatStatus.textContent = event.delta;
    }
    scheduleChatStreamRender();
    return;
  }

  const session = chatSessions.find((item) => item.id === activeChatSessionId);
  const message = session?.messages.find((item) => item.id === `stream-${event.request_id}`);
  if (!message) return;
  message.content += event.delta;
  scheduleChatStreamRender();
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
  userScrolledUp = false;
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
        workspace: activeWorkspaceName === 'default' ? undefined : activeWorkspaceName,
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
        workspace: existing?.workspace || (activeWorkspaceName === 'default' ? null : activeWorkspaceName),
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
    if (chatInput && !chatInput.value && message) {
      chatInput.value = message;
    }
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
    initSidebarViewTabs();
    initFilePreviewModal();
    initQuickModelSwitcher();
    initAtMentionAutocomplete();
    initCommandPalette();
    initChatExportModal();
    await Promise.all([
      loadWorkspaces(),
      loadChatSessions(),
      loadMemories(),
      loadSkills(),
      loadWorkflows(),
      loadMcpServers(),
      loadGraphify(),
      loadMedia(),
    ]);
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
  userScrolledUp = false;
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
sessionDropdownTrigger?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleSessionDropdown();
});
dropdownNewSessionBtn?.addEventListener('click', () => {
  startNewChat();
  closeSessionDropdown();
});
sessionSearchInput?.addEventListener('input', () => {
  renderCustomSessionDropdownList();
});
document.addEventListener('click', (e) => {
  if (sessionDropdown && !sessionDropdown.contains(e.target as Node)) {
    closeSessionDropdown();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeSessionDropdown();
  }
});
retryChatButton?.addEventListener('click', () => void retryLastChat());
cancelChatStreamButton?.addEventListener('click', () => void cancelActiveChatStream());
deleteChatButton?.addEventListener('click', () => void deleteActiveChatSession());
chatSessionSelect?.addEventListener('change', () => {
  openChatSession(chatSessionSelect.value);
});
chatMessages?.addEventListener('scroll', () => {
  if (!chatMessages) return;
  const threshold = 60;
  const isAtBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight <= threshold;
  userScrolledUp = !isAtBottom;
}, { passive: true });
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
sidebarNewFolderButton?.addEventListener('click', openFolderModal);
closeFolderModalButton?.addEventListener('click', closeFolderModal);
cancelFolderButton?.addEventListener('click', closeFolderModal);
folderRandomBtn?.addEventListener('click', () => {
  if (folderNameInput) {
    folderNameInput.value = generateRandomWorkspaceName();
  }
});
confirmCreateFolderButton?.addEventListener('click', async () => {
  const name = folderNameInput?.value.trim();
  if (!name) return;
  await createWorkspace(name);
  closeFolderModal();
});
closeMoveModalButton?.addEventListener('click', closeMoveSessionModal);
cancelMoveSessionButton?.addEventListener('click', closeMoveSessionModal);
confirmMoveSessionButton?.addEventListener('click', async () => {
  if (!pendingMoveSessionId || !moveFolderSelect) return;
  const targetWs = moveFolderSelect.value;
  await moveSessionToWorkspace(pendingMoveSessionId, targetWs);
  closeMoveSessionModal();
});

void startDesktop();
