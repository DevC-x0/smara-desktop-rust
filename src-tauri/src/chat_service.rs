use crate::app_state::now_ms;
use crate::builtin_tools::{
    export_openai_tools_schema, is_mutating_tool, run_desktop_builtin_tool_internal,
    DesktopBuiltinToolRequest, DesktopToolApproval,
};
use crate::improvement_service::learn_from_desktop_chat;
use crate::memory_service::{relevant_memories_scoped, DesktopMemory};
use crate::provider_service::{load_provider_config, DesktopProviderConfig};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::env;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

const CHAT_FILE: &str = "chat-sessions.json";
const MAX_SESSIONS: usize = 100;
const MAX_MESSAGES_PER_SESSION: usize = 200;
const CHAT_TIMEOUT: Duration = Duration::from_secs(90);
const MAX_CHAT_ATTACHMENTS: usize = 5;
const MAX_CHAT_ATTACHMENT_BYTES: usize = 10 * 1024 * 1024;
const MAX_CHAT_ATTACHMENTS_TOTAL_BYTES: usize = 20 * 1024 * 1024;
const MAX_ATTACHMENT_TEXT_CHARS: usize = 100_000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DesktopToolCall {
    pub id: String,
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Clone)]
pub struct StreamCompletionOutput {
    pub content: String,
    pub tool_calls: Vec<DesktopToolCall>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DesktopChatAttachment {
    pub name: String,
    pub mime: String,
    pub data_base64: String,
    pub bytes: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ChatProcessEntry {
    pub kind: String,
    pub text: String,
    #[serde(default)]
    pub created_at: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DesktopChatMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    #[serde(default)]
    pub attachments: Vec<DesktopChatAttachment>,
    #[serde(default)]
    pub processes: Vec<ChatProcessEntry>,
    pub created_at_ms: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DesktopChatSession {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub workspace: Option<String>,
    pub created_at_ms: u128,
    pub updated_at_ms: u128,
    pub messages: Vec<DesktopChatMessage>,
    #[serde(default)]
    pub memory_context_count: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SendChatRequest {
    pub session_id: Option<String>,
    pub message: String,
    pub request_id: Option<String>,
    #[serde(default)]
    pub workspace: Option<String>,
    #[serde(default)]
    pub attachments: Vec<DesktopChatAttachment>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DesktopChatStreamEvent {
    pub request_id: String,
    pub kind: String,
    pub delta: String,
}

fn emit_chat_stream_event(app: &AppHandle, request_id: &str, kind: &str, delta: impl Into<String>) {
    let _ = app.emit(
        "desktop-chat-stream",
        DesktopChatStreamEvent {
            request_id: request_id.to_string(),
            kind: kind.to_string(),
            delta: delta.into(),
        },
    );
}

#[derive(Clone, Default)]
pub struct DesktopChatStreamState {
    cancelled: Arc<Mutex<HashSet<String>>>,
}

impl DesktopChatStreamState {
    fn reset(&self, request_id: &str) -> Result<(), String> {
        self.cancelled
            .lock()
            .map_err(|_| "Failed to lock Chat stream cancellation state.".to_string())?
            .remove(request_id);
        Ok(())
    }

    fn cancel(&self, request_id: &str) -> Result<bool, String> {
        Ok(self
            .cancelled
            .lock()
            .map_err(|_| "Failed to lock Chat stream cancellation state.".to_string())?
            .insert(request_id.to_string()))
    }

    fn is_cancelled(&self, request_id: &str) -> Result<bool, String> {
        Ok(self
            .cancelled
            .lock()
            .map_err(|_| "Failed to lock Chat stream cancellation state.".to_string())?
            .contains(request_id))
    }

    fn finish(&self, request_id: &str) -> Result<(), String> {
        self.cancelled
            .lock()
            .map_err(|_| "Failed to lock Chat stream cancellation state.".to_string())?
            .remove(request_id);
        Ok(())
    }
}

fn chat_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Failed to resolve Desktop config directory: {error}"))?;
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Failed to create Desktop config directory: {error}"))?;
    Ok(dir.join(CHAT_FILE))
}

fn load_sessions_from(path: &Path) -> Result<Vec<DesktopChatSession>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read Desktop chat sessions: {error}"))?;
    serde_json::from_str(&raw)
        .map_err(|error| format!("Failed to parse Desktop chat sessions: {error}"))
}

fn save_sessions_to(path: &Path, sessions: &[DesktopChatSession]) -> Result<(), String> {
    let raw = serde_json::to_string_pretty(sessions)
        .map_err(|error| format!("Failed to serialize Desktop chat sessions: {error}"))?;
    fs::write(path, raw).map_err(|error| format!("Failed to save Desktop chat sessions: {error}"))
}

fn provider_api_key(provider: &str) -> Option<String> {
    match provider {
        "openai" => env::var("OPENAI_API_KEY")
            .or_else(|_| env::var("SMARA_API_KEY"))
            .ok()
            .filter(|v| !v.trim().is_empty()),
        "openrouter" => env::var("OPENROUTER_API_KEY")
            .or_else(|_| env::var("SMARA_API_KEY"))
            .ok()
            .filter(|v| !v.trim().is_empty()),
        "anthropic" => env::var("ANTHROPIC_API_KEY")
            .or_else(|_| env::var("SMARA_API_KEY"))
            .ok()
            .filter(|v| !v.trim().is_empty()),
        "custom" => {
            for key in &["CUSTOM_API_KEY", "SMARA_API_KEY", "NINE_ROUTER_API_KEY", "OPENAI_API_KEY"] {
                if let Ok(val) = env::var(key) {
                    if !val.trim().is_empty() {
                        return Some(val.trim().to_string());
                    }
                }
            }
            None
        }
        _ => env::var("SMARA_API_KEY")
            .or_else(|_| env::var("OPENAI_API_KEY"))
            .ok()
            .filter(|v| !v.trim().is_empty()),
    }
}

fn chat_url(config: &DesktopProviderConfig) -> String {
    if config.endpoint.ends_with("/chat/completions") {
        config.endpoint.clone()
    } else {
        format!("{}/chat/completions", config.endpoint.trim_end_matches('/'))
    }
}

fn anthropic_url(config: &DesktopProviderConfig) -> String {
    if config.endpoint.ends_with("/messages") {
        config.endpoint.clone()
    } else {
        format!("{}/messages", config.endpoint.trim_end_matches('/'))
    }
}

fn workspace_scan_context(query: &str) -> Option<String> {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/home/cahya".to_string());
    let mut candidate_paths = vec![
        PathBuf::from(&home).join("2026"),
        PathBuf::from(&home),
    ];
    for word in query.split_whitespace() {
        let clean = word.trim_matches(|c| c == '\'' || c == '"' || c == '`' || c == ',' || c == '.');
        let p = Path::new(clean);
        if p.exists() && p.is_dir() {
            candidate_paths.insert(0, p.to_path_buf());
        }
    }

    let q_lower = query.to_lowercase();
    let is_exploration = q_lower.contains("2026")
        || q_lower.contains("folder")
        || q_lower.contains("direktori")
        || q_lower.contains("analis")
        || q_lower.contains("workspace")
        || q_lower.contains("explore")
        || q_lower.contains("file");

    if !is_exploration {
        return None;
    }

    let target_dir = candidate_paths.into_iter().find(|p| p.exists() && p.is_dir())?;
    if let Ok(entries) = std::fs::read_dir(&target_dir) {
        let mut list = Vec::new();
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || name == "node_modules" || name == "target" || name == "dist" {
                continue;
            }
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            if is_dir {
                list.push(format!("- [DIR]  {name}/"));
            } else {
                list.push(format!("- [FILE] {name}"));
            }
        }
        if !list.is_empty() {
            return Some(format!(
                "Local Workspace Content for `{}`:\n{}",
                target_dir.display(),
                list.join("\n")
            ));
        }
    }
    None
}

fn default_system_prompt(memories: &[DesktopMemory], messages: &[DesktopChatMessage]) -> String {
    let query = messages.last().map(|m| m.content.as_str()).unwrap_or_default();
    let mut parts = Vec::new();
    parts.push(
        "You are Smara, an advanced, autonomous AI developer assistant and local system agent running natively on the user's Linux computer.\n\
        You have direct capability to explore local workspaces, inspect code, analyze files, and assist with any engineering or system tasks.\n\
        Never tell the user you lack access to their PC or filesystem—you are the user's local autonomous developer assistant. When asked about folders, projects, or files, analyze them directly and provide helpful, structured, and insightful answers.\n\n\
        Tool & Specialized Capability Guidelines:\n\
        - For installing or registering new Model Context Protocol (MCP) servers (such as playwright, github, sqlite, postgres, filesystem) when requested by the user, call `install_mcp_server` directly with server name, command (e.g. 'npx', 'uvx'), and args (e.g. ['-y', '@modelcontextprotocol/server-playwright']).\n\
        - For viewing configured MCP servers, call `list_installed_mcp_servers`.\n\
        - For installing or creating reusable automation skills (such as impeccable, test_runner, docker_audit) when requested by the user, call `install_skill` directly with name, description, tags, and execution steps.\n\
        - For viewing configured skills, call `list_installed_skills`.\n\
        - For analyzing files, lines of code (LOC), language breakdown, and statistics, ALWAYS prefer calling `get_code_stats` directly—it returns instant 0ms native calculations and pre-formatted pie chart data!\n\
        - For looking up documentation, error fixes, or online guides, use `search_web`.\n\
        - For investigating code symbols, functions, classes, dependencies, and file relationships, use `query_code_graph`.\n\
        - For monitoring background servers or processes started via `create_terminal`, use `get_process_logs` to check live output.\n\
        - When running custom commands with `run_command`, write clean, syntactically valid scripts directly.\n\n\
        Visual Diagrams & Charts Engine:\n\
        Smara Desktop interface has a built-in Mermaid diagram and chart renderer. Whenever asked for a chart, graph, diagram, architecture flow, statistics breakdown (pie chart), git branch graph, or workflow timeline, output standard ```mermaid code blocks (e.g. `pie`, `graph TD`, `flowchart LR`, `sequenceDiagram`, `gantt`, `gitGraph`, `mindmap`). They will automatically render as rich visual SVGs and interactive charts."
            .to_string(),
    );

    let home = std::env::var("HOME").unwrap_or_else(|_| "/home/cahya".to_string());
    let agents_md_path = std::path::Path::new(&home).join(".smara").join("AGENTS.md");
    if let Ok(agents_content) = std::fs::read_to_string(&agents_md_path) {
        let trimmed = agents_content.trim();
        if !trimmed.is_empty() {
            parts.push(format!("# Local Agent Guidelines & Protocols (~/.smara/AGENTS.md):\n{trimmed}"));
        }
    }

    if let Some(workspace_info) = workspace_scan_context(query) {
        parts.push(format!("# Automatically Discovered Local Filesystem Context:\n{workspace_info}"));
    }

    if let Some(context) = memory_context(memories) {
        parts.push(format!("# Relevant Persistent Memory Context:\n{context}"));
    }

    parts.join("\n\n")
}

fn memory_context(memories: &[DesktopMemory]) -> Option<String> {
    if memories.is_empty() {
        return None;
    }
    let context = memories
        .iter()
        .enumerate()
        .map(|(index, memory)| {
            let tags = if memory.tags.is_empty() {
                String::new()
            } else {
                format!(" [tags: {}]", memory.tags.join(", "))
            };
            format!("{}. {}{}", index + 1, memory.content, tags)
        })
        .collect::<Vec<_>>()
        .join("\n");
    Some(format!(
        "Use these relevant local memories only when useful. Do not claim they are always current.\n{context}"
    ))
}

fn validate_attachments(attachments: &[DesktopChatAttachment]) -> Result<(), String> {
    if attachments.len() > MAX_CHAT_ATTACHMENTS {
        return Err(format!(
            "Chat supports up to {MAX_CHAT_ATTACHMENTS} attachments per message."
        ));
    }
    let mut total_bytes = 0usize;
    for attachment in attachments {
        if attachment.name.trim().is_empty() || attachment.mime.trim().is_empty() {
            return Err("Chat attachment name and MIME type are required.".to_string());
        }
        if attachment.bytes > MAX_CHAT_ATTACHMENT_BYTES {
            return Err(format!(
                "Attachment '{}' exceeds the {} MB limit.",
                attachment.name,
                MAX_CHAT_ATTACHMENT_BYTES / 1024 / 1024
            ));
        }
        let decoded = BASE64.decode(&attachment.data_base64).map_err(|_| {
            format!(
                "Attachment '{}' contains invalid base64 data.",
                attachment.name
            )
        })?;
        if decoded.len() != attachment.bytes {
            return Err(format!(
                "Attachment '{}' size metadata does not match its data.",
                attachment.name
            ));
        }
        total_bytes = total_bytes.saturating_add(decoded.len());
    }
    if total_bytes > MAX_CHAT_ATTACHMENTS_TOTAL_BYTES {
        return Err(format!(
            "Total Chat attachments exceed the {} MB limit.",
            MAX_CHAT_ATTACHMENTS_TOTAL_BYTES / 1024 / 1024
        ));
    }
    Ok(())
}

fn text_attachment_context(attachments: &[DesktopChatAttachment]) -> String {
    attachments
        .iter()
        .map(|attachment| {
            if attachment.mime.starts_with("text/")
                || matches!(
                    attachment.mime.as_str(),
                    "application/json" | "application/xml" | "application/javascript"
                )
            {
                let text = BASE64
                    .decode(&attachment.data_base64)
                    .ok()
                    .and_then(|bytes| String::from_utf8(bytes).ok())
                    .unwrap_or_else(|| "[File teks tidak dapat dibaca sebagai UTF-8]".to_string());
                let truncated = text.chars().count() > MAX_ATTACHMENT_TEXT_CHARS;
                let mut text = text.chars().take(MAX_ATTACHMENT_TEXT_CHARS).collect::<String>();
                if truncated {
                    text.push_str("\n[Isi file dipotong karena terlalu panjang]");
                }
                format!("\n\n<attachment name=\"{}\" mime=\"{}\">\n{}\n</attachment>", attachment.name, attachment.mime, text)
            } else if attachment.mime.starts_with("image/") {
                String::new()
            } else {
                format!(
                    "\n\n<attachment name=\"{}\" mime=\"{}\" bytes=\"{}\">File biner terlampir. Gunakan metadata ini bila provider tidak mendukung isi file langsung.</attachment>",
                    attachment.name, attachment.mime, attachment.bytes
                )
            }
        })
        .collect::<Vec<_>>()
        .join("")
}

fn openai_message(message: &DesktopChatMessage) -> Value {
    if message.role != "user" || message.attachments.is_empty() {
        return json!({"role": message.role, "content": message.content});
    }
    let text = format!(
        "{}{}",
        message.content,
        text_attachment_context(&message.attachments)
    );
    if !message
        .attachments
        .iter()
        .any(|attachment| attachment.mime.starts_with("image/"))
    {
        return json!({"role": message.role, "content": text});
    }
    let mut content = vec![json!({
        "type": "text",
        "text": if text.trim().is_empty() { "Tolong analisis gambar terlampir." } else { &text },
    })];
    content.extend(
        message
            .attachments
            .iter()
            .filter(|attachment| attachment.mime.starts_with("image/"))
            .map(|attachment| {
                json!({
                    "type": "image_url",
                    "image_url": {
                        "url": format!("data:{};base64,{}", attachment.mime, attachment.data_base64)
                    }
                })
            }),
    );
    json!({"role": message.role, "content": content})
}

fn anthropic_message(message: &DesktopChatMessage) -> Value {
    if message.role != "user" || message.attachments.is_empty() {
        return json!({"role": message.role, "content": message.content});
    }
    let text = format!(
        "{}{}",
        message.content,
        text_attachment_context(&message.attachments)
    );
    let mut content = vec![json!({
        "type": "text",
        "text": if text.trim().is_empty() { "Tolong analisis gambar terlampir." } else { &text },
    })];
    content.extend(
        message
            .attachments
            .iter()
            .filter(|attachment| attachment.mime.starts_with("image/"))
            .map(|attachment| {
                json!({
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": attachment.mime,
                        "data": attachment.data_base64,
                    }
                })
            }),
    );
    content.extend(
        message
            .attachments
            .iter()
            .filter(|attachment| attachment.mime == "application/pdf")
            .map(|attachment| {
                json!({
                    "type": "document",
                    "source": {
                        "type": "base64",
                        "media_type": attachment.mime,
                        "data": attachment.data_base64,
                    }
                })
            }),
    );
    json!({"role": message.role, "content": content})
}

pub(crate) fn request_completion(
    config: &DesktopProviderConfig,
    messages: &[DesktopChatMessage],
    memories: &[DesktopMemory],
) -> Result<String, String> {
    if config.provider == "anthropic" {
        return request_anthropic_completion(config, messages, memories);
    }
    let mut provider_messages = Vec::new();
    let sys_prompt = default_system_prompt(memories, messages);
    provider_messages.push(json!({
        "role": "system",
        "content": sys_prompt,
    }));
    provider_messages.extend(messages.iter().map(openai_message));
    let payload = json!({
        "model": config.model,
        "stream": false,
        "messages": provider_messages,
    });
    let client = Client::builder()
        .timeout(CHAT_TIMEOUT)
        .build()
        .map_err(|error| format!("Failed to create provider HTTP client: {error}"))?;
    let mut request = client.post(chat_url(config)).json(&payload);
    if let Some(key) = provider_api_key(&config.provider) {
        request = request.bearer_auth(key);
    }
    let response = request
        .send()
        .map_err(|error| format!("Provider request failed: {error}"))?;
    let status = response.status();
    let body: Value = response
        .json()
        .map_err(|error| format!("Provider returned invalid JSON: {error}"))?;
    if !status.is_success() {
        return Err(format!("Provider returned HTTP {status}: {body}"));
    }
    body.pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|content| !content.is_empty())
        .map(str::to_string)
        .ok_or_else(|| "Provider response did not contain choices[0].message.content.".to_string())
}

fn request_anthropic_completion(
    config: &DesktopProviderConfig,
    messages: &[DesktopChatMessage],
    memories: &[DesktopMemory],
) -> Result<String, String> {
    let mut payload = json!({
        "model": config.model,
        "max_tokens": 4096,
        "messages": messages.iter().map(anthropic_message).collect::<Vec<_>>(),
    });
    let sys_prompt = default_system_prompt(memories, messages);
    payload["system"] = Value::String(sys_prompt);
    let client = Client::builder()
        .timeout(CHAT_TIMEOUT)
        .build()
        .map_err(|error| format!("Failed to create Anthropic HTTP client: {error}"))?;
    let mut request = client
        .post(anthropic_url(config))
        .header("anthropic-version", "2023-06-01")
        .json(&payload);
    if let Some(key) = provider_api_key("anthropic") {
        request = request.header("x-api-key", key);
    }
    let response = request
        .send()
        .map_err(|error| format!("Anthropic request failed: {error}"))?;
    let status = response.status();
    let body: Value = response
        .json()
        .map_err(|error| format!("Anthropic returned invalid JSON: {error}"))?;
    if !status.is_success() {
        return Err(format!("Anthropic returned HTTP {status}: {body}"));
    }
    body.pointer("/content/0/text")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|content| !content.is_empty())
        .map(str::to_string)
        .ok_or_else(|| "Anthropic response did not contain content[0].text.".to_string())
}

fn stream_response_lines(
    response: reqwest::blocking::Response,
    mut on_reasoning: impl FnMut(&str),
    mut on_delta: impl FnMut(&str),
    mut should_cancel: impl FnMut() -> bool,
) -> Result<StreamCompletionOutput, String> {
    let status = response.status();
    if !status.is_success() {
        let body = response
            .text()
            .unwrap_or_else(|_| "provider response body unavailable".to_string());
        return Err(format!("Provider returned HTTP {status}: {body}"));
    }
    let mut full = String::new();
    let mut in_think_tag = false;
    let mut tool_calls_map: std::collections::BTreeMap<usize, DesktopToolCall> = std::collections::BTreeMap::new();

    for line in BufReader::new(response).lines() {
        if should_cancel() {
            return Err("Streaming Chat request was cancelled.".to_string());
        }
        let line = line.map_err(|error| format!("Failed to read provider stream: {error}"))?;
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with(':') {
            continue;
        }

        // Check if raw JSON error was returned instead of SSE
        if trimmed.starts_with('{') {
            if let Ok(json_val) = serde_json::from_str::<Value>(trimmed) {
                if let Some(err_msg) = json_val.pointer("/error/message").and_then(Value::as_str) {
                    return Err(format!("Provider Error: {err_msg}"));
                }
                if let Some(err_str) = json_val.get("error").and_then(Value::as_str) {
                    return Err(format!("Provider Error: {err_str}"));
                }
            }
        }

        let Some(data) = line.strip_prefix("data:") else {
            continue;
        };
        let data = data.trim();
        if data.is_empty() || data == "[DONE]" {
            continue;
        }
        let event: Value = serde_json::from_str(data)
            .map_err(|error| format!("Provider stream returned invalid JSON: {error}"))?;

        if let Some(err_msg) = event.pointer("/error/message").and_then(Value::as_str) {
            return Err(format!("Provider Error: {err_msg}"));
        }
        if let Some(err_str) = event.get("error").and_then(Value::as_str) {
            return Err(format!("Provider Error: {err_str}"));
        }

        // 1. Check reasoning / thought delta
        if let Some(reasoning) = event.pointer("/choices/0/delta/reasoning_content")
            .or_else(|| event.pointer("/choices/0/delta/reasoning"))
            .or_else(|| event.pointer("/choices/0/delta/thought"))
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
        {
            on_reasoning(reasoning);
        }

        // 2. Check tool_calls delta
        if let Some(tool_calls) = event.pointer("/choices/0/delta/tool_calls").and_then(Value::as_array) {
            for tc in tool_calls {
                let index = tc.get("index").and_then(Value::as_u64).unwrap_or(0) as usize;
                let entry = tool_calls_map.entry(index).or_insert_with(|| DesktopToolCall {
                    id: String::new(),
                    name: String::new(),
                    arguments: String::new(),
                });
                if let Some(id) = tc.get("id").and_then(Value::as_str) {
                    entry.id.push_str(id);
                }
                if let Some(name) = tc.pointer("/function/name").and_then(Value::as_str) {
                    entry.name.push_str(name);
                }
                if let Some(args) = tc.pointer("/function/arguments").and_then(Value::as_str) {
                    entry.arguments.push_str(args);
                }
            }
        }

        // 3. Check content delta (with embedded <think> handling)
        if let Some(content) = event.pointer("/choices/0/delta/content")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
        {
            if content.contains("<think>") {
                in_think_tag = true;
                let parts: Vec<&str> = content.split("<think>").collect();
                if !parts[0].is_empty() {
                    full.push_str(parts[0]);
                    on_delta(parts[0]);
                }
                if parts.len() > 1 && !parts[1].is_empty() {
                    if parts[1].contains("</think>") {
                        let think_parts: Vec<&str> = parts[1].split("</think>").collect();
                        on_reasoning(think_parts[0]);
                        in_think_tag = false;
                        if think_parts.len() > 1 && !think_parts[1].is_empty() {
                            full.push_str(think_parts[1]);
                            on_delta(think_parts[1]);
                        }
                    } else {
                        on_reasoning(parts[1]);
                    }
                }
            } else if in_think_tag {
                if content.contains("</think>") {
                    let parts: Vec<&str> = content.split("</think>").collect();
                    on_reasoning(parts[0]);
                    in_think_tag = false;
                    if parts.len() > 1 && !parts[1].is_empty() {
                        full.push_str(parts[1]);
                        on_delta(parts[1]);
                    }
                } else {
                    on_reasoning(content);
                }
            } else {
                full.push_str(content);
                on_delta(content);
            }
        }
    }
    let tool_calls: Vec<DesktopToolCall> = tool_calls_map.into_values().filter(|tc| !tc.name.is_empty()).collect();
    if full.trim().is_empty() && tool_calls.is_empty() {
        return Err("Provider stream completed without text content or tool calls.".to_string());
    }
    Ok(StreamCompletionOutput {
        content: full,
        tool_calls,
    })
}

fn request_streaming_completion(
    config: &DesktopProviderConfig,
    messages: &[Value],
    tools: &[Value],
    on_reasoning: impl FnMut(&str),
    on_delta: impl FnMut(&str),
    should_cancel: impl FnMut() -> bool,
) -> Result<StreamCompletionOutput, String> {
    if config.provider == "anthropic" {
        return request_anthropic_streaming_completion(
            config,
            messages,
            on_reasoning,
            on_delta,
            should_cancel,
        );
    }
    let mut payload = json!({
        "model": config.model,
        "stream": true,
        "messages": messages,
    });
    if !tools.is_empty() {
        payload["tools"] = json!(tools);
    }
    let client = Client::builder()
        .timeout(CHAT_TIMEOUT)
        .build()
        .map_err(|error| format!("Failed to create provider HTTP client: {error}"))?;
    let mut request = client.post(chat_url(config)).json(&payload);
    if let Some(key) = provider_api_key(&config.provider) {
        request = request.bearer_auth(key);
    }
    let response = request
        .send()
        .map_err(|error| format!("Provider stream request failed: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().unwrap_or_default();
        if !tools.is_empty() && (status.as_u16() == 400 || status.as_u16() == 422) {
            let fallback_payload = json!({
                "model": config.model,
                "stream": true,
                "messages": messages,
            });
            let mut retry_req = client.post(chat_url(config)).json(&fallback_payload);
            if let Some(key) = provider_api_key(&config.provider) {
                retry_req = retry_req.bearer_auth(key);
            }
            if let Ok(retry_resp) = retry_req.send() {
                if retry_resp.status().is_success() {
                    return stream_response_lines(
                        retry_resp,
                        on_reasoning,
                        on_delta,
                        should_cancel,
                    );
                }
            }
        }
        return Err(format!("Provider stream HTTP error {status}: {body}"));
    }
    stream_response_lines(
        response,
        on_reasoning,
        on_delta,
        should_cancel,
    )
}

fn request_anthropic_streaming_completion(
    config: &DesktopProviderConfig,
    messages: &[Value],
    mut on_reasoning: impl FnMut(&str),
    mut on_delta: impl FnMut(&str),
    mut should_cancel: impl FnMut() -> bool,
) -> Result<StreamCompletionOutput, String> {
    let payload = json!({
        "model": config.model,
        "max_tokens": 4096,
        "stream": true,
        "messages": messages,
    });
    let client = Client::builder()
        .timeout(CHAT_TIMEOUT)
        .build()
        .map_err(|error| format!("Failed to create Anthropic HTTP client: {error}"))?;
    let mut request = client
        .post(anthropic_url(config))
        .header("anthropic-version", "2023-06-01")
        .json(&payload);
    if let Some(key) = provider_api_key("anthropic") {
        request = request.header("x-api-key", key);
    }
    let response = request
        .send()
        .map_err(|error| format!("Anthropic stream request failed: {error}"))?;

    let status = response.status();
    if !status.is_success() {
        let body = response
            .text()
            .unwrap_or_else(|_| "provider response body unavailable".to_string());
        return Err(format!("Anthropic returned HTTP {status}: {body}"));
    }
    let mut full = String::new();
    for line in BufReader::new(response).lines() {
        if should_cancel() {
            return Err("Streaming Chat request was cancelled.".to_string());
        }
        let line = line.map_err(|error| format!("Failed to read Anthropic stream: {error}"))?;
        let Some(data) = line.strip_prefix("data:") else {
            continue;
        };
        let data = data.trim();
        if data.is_empty() || data == "[DONE]" {
            continue;
        }
        let event: Value = serde_json::from_str(data)
            .map_err(|error| format!("Anthropic stream returned invalid JSON: {error}"))?;
        
        if event.get("type").and_then(Value::as_str) == Some("content_block_delta") {
            let delta_type = event.pointer("/delta/type").and_then(Value::as_str);
            if delta_type == Some("thinking_delta") {
                if let Some(text) = event.pointer("/delta/thinking").and_then(Value::as_str) {
                    on_reasoning(text);
                }
            } else if delta_type == Some("text_delta") {
                if let Some(text) = event.pointer("/delta/text").and_then(Value::as_str) {
                    full.push_str(text);
                    on_delta(text);
                }
            }
        }
    }
    if full.trim().is_empty() {
        return Err("Anthropic stream completed without text content.".to_string());
    }
    Ok(StreamCompletionOutput {
        content: full,
        tool_calls: Vec::new(),
    })
}

fn send_chat_with(
    path: &Path,
    request: SendChatRequest,
    memories: Vec<DesktopMemory>,
    completion: impl FnOnce(&[DesktopChatMessage], &[DesktopMemory]) -> Result<(String, Vec<ChatProcessEntry>), String>,
) -> Result<DesktopChatSession, String> {
    let message = request.message.trim();
    validate_attachments(&request.attachments)?;
    if message.is_empty() && request.attachments.is_empty() {
        return Err("Chat message or attachment is required.".to_string());
    }
    let mut sessions = load_sessions_from(path)?;
    let timestamp = now_ms();
    let session_id = request
        .session_id
        .filter(|id| sessions.iter().any(|session| session.id == *id))
        .unwrap_or_else(|| format!("chat-{timestamp}"));
    let index = sessions.iter().position(|session| session.id == session_id);
    let mut session = index
        .map(|index| sessions.remove(index))
        .unwrap_or_else(|| DesktopChatSession {
            id: session_id,
            title: if message.is_empty() {
                request.attachments[0].name.chars().take(60).collect()
            } else {
                message.chars().take(60).collect()
            },
            workspace: request.workspace.clone(),
            created_at_ms: timestamp,
            updated_at_ms: timestamp,
            messages: Vec::new(),
            memory_context_count: 0,
        });
    if session.workspace.is_none() && request.workspace.is_some() {
        session.workspace = request.workspace;
    }
    session.messages.push(DesktopChatMessage {
        id: format!("message-{timestamp}-user"),
        role: "user".to_string(),
        content: message.to_string(),
        attachments: request.attachments,
        processes: Vec::new(),
        created_at_ms: timestamp,
    });
    let (response, processes) = completion(&session.messages, &memories)?;
    session.messages.push(DesktopChatMessage {
        id: format!("message-{}-assistant", now_ms()),
        role: "assistant".to_string(),
        content: response,
        attachments: Vec::new(),
        processes,
        created_at_ms: now_ms(),
    });
    if session.messages.len() > MAX_MESSAGES_PER_SESSION {
        session
            .messages
            .drain(0..session.messages.len() - MAX_MESSAGES_PER_SESSION);
    }
    session.updated_at_ms = now_ms();
    session.memory_context_count = memories.len();
    sessions.insert(0, session.clone());
    sessions.truncate(MAX_SESSIONS);
    save_sessions_to(path, &sessions)?;
    Ok(session)
}

fn send_chat_at(
    path: &Path,
    config: &DesktopProviderConfig,
    request: SendChatRequest,
    memories: Vec<DesktopMemory>,
) -> Result<DesktopChatSession, String> {
    send_chat_with(path, request, memories, |messages, memories| {
        let content = request_completion(config, messages, memories)?;
        Ok((content, Vec::new()))
    })
}

#[tauri::command]
pub fn list_desktop_chat_sessions(app: AppHandle) -> Result<Vec<DesktopChatSession>, String> {
    load_sessions_from(&chat_path(&app)?)
}

#[tauri::command]
pub fn delete_desktop_chat_session(app: AppHandle, id: String) -> Result<bool, String> {
    let path = chat_path(&app)?;
    let mut sessions = load_sessions_from(&path)?;
    let before = sessions.len();
    sessions.retain(|session| session.id != id);
    save_sessions_to(&path, &sessions)?;
    Ok(before != sessions.len())
}

#[tauri::command]
pub fn move_desktop_chat_session_workspace(
    app: AppHandle,
    session_id: String,
    target_workspace: Option<String>,
) -> Result<DesktopChatSession, String> {
    let path = chat_path(&app)?;
    let mut sessions = load_sessions_from(&path)?;
    let index = sessions
        .iter()
        .position(|s| s.id == session_id)
        .ok_or_else(|| format!("Chat session '{session_id}' not found."))?;
    let mut session = sessions.remove(index);
    session.workspace = target_workspace.and_then(|w| {
        let trimmed = w.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    });
    session.updated_at_ms = now_ms();
    sessions.insert(0, session.clone());
    save_sessions_to(&path, &sessions)?;
    Ok(session)
}

#[tauri::command]
pub async fn send_desktop_chat(
    app: AppHandle,
    request: SendChatRequest,
) -> Result<DesktopChatSession, String> {
    let memories = relevant_memories_scoped(&app, &request.message, request.workspace.as_deref(), 5)?;
    let path = chat_path(&app)?;
    let config = load_provider_config(&app)?;
    let learning_app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let session = send_chat_at(&path, &config, request, memories)?;
        let _ = learn_from_desktop_chat(&learning_app, &config, &session);
        Ok(session)
    })
    .await
    .map_err(|error| format!("Failed to wait for provider response: {error}"))?
}

#[tauri::command]
pub async fn stream_desktop_chat(
    app: AppHandle,
    state: State<'_, DesktopChatStreamState>,
    request: SendChatRequest,
) -> Result<DesktopChatSession, String> {
    let request_id = request
        .request_id
        .clone()
        .filter(|id| !id.trim().is_empty())
        .ok_or_else(|| "Streaming Chat requires request_id.".to_string())?;
    state.reset(&request_id)?;
    let recorded_processes = Arc::new(Mutex::new(Vec::new()));
    let rec_for_pre = recorded_processes.clone();
    let emit_and_record = move |app_handle: &AppHandle, req_id: &str, kind: &str, delta: String| {
        if let Ok(mut procs) = rec_for_pre.lock() {
            procs.push(ChatProcessEntry {
                kind: kind.to_string(),
                text: delta.clone(),
                created_at: now_ms(),
            });
        }
        emit_chat_stream_event(app_handle, req_id, kind, delta);
    };

    emit_and_record(
        &app,
        &request_id,
        "thinking",
        "Menyiapkan sesi agen, memuat protokol AGENTS.md, dan konfigurasi lingkungan.".to_string(),
    );
    if let Some(scan) = workspace_scan_context(&request.message) {
        let first_line = scan.lines().next().unwrap_or("Local Workspace Scan");
        emit_and_record(
            &app,
            &request_id,
            "explore",
            format!("Workspace Scanner: {first_line}"),
        );
    }
    let memories = relevant_memories_scoped(&app, &request.message, request.workspace.as_deref(), 5)?;
    if !memories.is_empty() {
        emit_and_record(
            &app,
            &request_id,
            "memory",
            format!(
                "Persistent Memory: {} memori relevan teridentifikasi dan dimuat.",
                memories.len()
            ),
        );
    }
    let path = chat_path(&app)?;
    let config = load_provider_config(&app)?;
    emit_and_record(
        &app,
        &request_id,
        "tool_start",
        format!("LLM Inference Call: Menginisialisasi provider {} ({})", config.provider, config.model),
    );
    let event_app_for_delta = app.clone();
    let event_app_for_done = app.clone();
    let learning_app = app.clone();
    let stream_state = state.inner().clone();
    let request_id_for_cancel = request_id.clone();
    let request_id_for_finish = request_id.clone();
    let request_id_for_done = request_id.clone();
    let rec_for_blocking = recorded_processes.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let session = send_chat_with(&path, request, memories, |initial_messages, memories| {
            let home = std::env::var("HOME").unwrap_or_else(|_| "/home/cahya".to_string());
            let workspace_root = PathBuf::from(&home).join("2026");
            let workspace_root_str = if workspace_root.exists() {
                workspace_root.to_string_lossy().to_string()
            } else {
                home
            };

            let mut dynamic_messages: Vec<Value> = Vec::new();
            let sys_prompt = default_system_prompt(memories, initial_messages);
            dynamic_messages.push(json!({
                "role": "system",
                "content": sys_prompt,
            }));
            dynamic_messages.extend(initial_messages.iter().map(openai_message));

            let tools_schema = export_openai_tools_schema();
            let mut final_content = String::new();
            let max_turns = 25;

            for _turn in 0..max_turns {
                if stream_state.is_cancelled(&request_id_for_cancel).unwrap_or(true) {
                    return Err("Streaming Chat request was cancelled.".to_string());
                }

                let event_app_for_thinking = event_app_for_delta.clone();
                let req_id_for_thinking = request_id_for_cancel.clone();
                let event_app_for_delta_inner = event_app_for_delta.clone();
                let req_id_for_delta_inner = request_id_for_cancel.clone();
                let state_for_cancel = stream_state.clone();
                let req_id_for_cancel_inner = request_id_for_cancel.clone();

                let stream_out = request_streaming_completion(
                    &config,
                    &dynamic_messages,
                    &tools_schema,
                    move |reasoning| {
                        let _ = event_app_for_thinking.emit(
                            "desktop-chat-stream",
                            DesktopChatStreamEvent {
                                request_id: req_id_for_thinking.clone(),
                                kind: "thinking_delta".to_string(),
                                delta: reasoning.to_string(),
                            },
                        );
                    },
                    move |delta| {
                        let _ = event_app_for_delta_inner.emit(
                            "desktop-chat-stream",
                            DesktopChatStreamEvent {
                                request_id: req_id_for_delta_inner.clone(),
                                kind: "delta".to_string(),
                                delta: delta.to_string(),
                            },
                        );
                    },
                    move || state_for_cancel.is_cancelled(&req_id_for_cancel_inner).unwrap_or(true),
                )?;

                if !stream_out.content.is_empty() {
                    final_content.push_str(&stream_out.content);
                }

                if !stream_out.tool_calls.is_empty() {
                    let mut assistant_tool_calls_json = Vec::new();
                    for tc in &stream_out.tool_calls {
                        assistant_tool_calls_json.push(json!({
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.name,
                                "arguments": tc.arguments,
                            }
                        }));
                    }
                    dynamic_messages.push(json!({
                        "role": "assistant",
                        "content": if stream_out.content.is_empty() { Value::Null } else { Value::String(stream_out.content) },
                        "tool_calls": assistant_tool_calls_json,
                    }));

                    for tc in stream_out.tool_calls {
                        let tool_start_msg = format!("🛠️ Eksekusi Tool: `{}` ({})", tc.name, tc.arguments);
                        if let Ok(mut procs) = rec_for_blocking.lock() {
                            procs.push(ChatProcessEntry {
                                kind: "tool_start".to_string(),
                                text: tool_start_msg.clone(),
                                created_at: now_ms(),
                            });
                        }
                        emit_chat_stream_event(
                            &event_app_for_done,
                            &request_id_for_done,
                            "tool_start",
                            tool_start_msg,
                        );

                        let parsed_args: Value = serde_json::from_str(&tc.arguments)
                            .unwrap_or_else(|_| json!({}));

                        let approval = if is_mutating_tool(&tc.name) {
                            Some(DesktopToolApproval {
                                action: tc.name.clone(),
                                approved: true,
                                approved_at_ms: now_ms(),
                                summary: format!("Agent execution of tool '{}'", tc.name),
                            })
                        } else {
                            None
                        };

                        let exec_result = run_desktop_builtin_tool_internal(DesktopBuiltinToolRequest {
                            tool: tc.name.clone(),
                            workspace_root: workspace_root_str.clone(),
                            args: parsed_args,
                            approval,
                        });

                        let (output_text, log_kind, log_text) = match exec_result {
                            Ok(res) => {
                                let preview = if res.output.len() > 160 {
                                    format!("{}...", &res.output[..160])
                                } else {
                                    res.output.clone()
                                };
                                let msg = format!("✓ Hasil `{}`: {}", tc.name, preview.trim());
                                (res.output, "tool_done", msg)
                            }
                            Err(err) => {
                                let msg = format!("✕ Gagal `{}`: {}", tc.name, err);
                                (format!("Error executing tool {}: {}", tc.name, err), "error", msg)
                            }
                        };
                        if let Ok(mut procs) = rec_for_blocking.lock() {
                            procs.push(ChatProcessEntry {
                                kind: log_kind.to_string(),
                                text: log_text.clone(),
                                created_at: now_ms(),
                            });
                        }
                        emit_chat_stream_event(
                            &event_app_for_done,
                            &request_id_for_done,
                            log_kind,
                            log_text,
                        );

                        dynamic_messages.push(json!({
                            "role": "tool",
                            "tool_call_id": tc.id,
                            "name": tc.name,
                            "content": output_text,
                        }));
                    }
                } else {
                    emit_chat_stream_event(
                        &event_app_for_done,
                        &request_id_for_done,
                        "tool_done",
                        "Provider stream selesai.",
                    );
                    break;
                }
            }

            if final_content.trim().is_empty() {
                let synth_msg = "Mensintesis seluruh temuan investigasi dan merumuskan analisis lengkap...".to_string();
                if let Ok(mut procs) = rec_for_blocking.lock() {
                    procs.push(ChatProcessEntry {
                        kind: "thinking".to_string(),
                        text: synth_msg.clone(),
                        created_at: now_ms(),
                    });
                }
                emit_chat_stream_event(
                    &event_app_for_done,
                    &request_id_for_done,
                    "thinking",
                    synth_msg,
                );
                let event_app_for_thinking = event_app_for_delta.clone();
                let req_id_for_thinking = request_id_for_cancel.clone();
                let event_app_for_delta_inner = event_app_for_delta.clone();
                let req_id_for_delta_inner = request_id_for_cancel.clone();
                let state_for_cancel = stream_state.clone();
                let req_id_for_cancel_inner = request_id_for_cancel.clone();

                let stream_out = request_streaming_completion(
                    &config,
                    &dynamic_messages,
                    &[],
                    move |reasoning| {
                        let _ = event_app_for_thinking.emit(
                            "desktop-chat-stream",
                            DesktopChatStreamEvent {
                                request_id: req_id_for_thinking.clone(),
                                kind: "thinking_delta".to_string(),
                                delta: reasoning.to_string(),
                            },
                        );
                    },
                    move |delta| {
                        let _ = event_app_for_delta_inner.emit(
                            "desktop-chat-stream",
                            DesktopChatStreamEvent {
                                request_id: req_id_for_delta_inner.clone(),
                                kind: "delta".to_string(),
                                delta: delta.to_string(),
                            },
                        );
                    },
                    move || state_for_cancel.is_cancelled(&req_id_for_cancel_inner).unwrap_or(true),
                )?;
                final_content = stream_out.content;
            }

            if final_content.trim().is_empty() {
                final_content = "Selesai memproses aksi dan investigasi workspace.".to_string();
            }
            let complete_msg = "Respons selesai dan tersimpan di sesi lokal.".to_string();
            if let Ok(mut procs) = rec_for_blocking.lock() {
                procs.push(ChatProcessEntry {
                    kind: "complete".to_string(),
                    text: complete_msg.clone(),
                    created_at: now_ms(),
                });
            }
            emit_chat_stream_event(
                &event_app_for_done,
                &request_id_for_done,
                "complete",
                complete_msg,
            );
            let final_procs = rec_for_blocking
                .lock()
                .map(|guard| guard.clone())
                .unwrap_or_default();
            Ok((final_content, final_procs))
        })?;
        for event in learn_from_desktop_chat(&learning_app, &config, &session).unwrap_or_default() {
            emit_chat_stream_event(&learning_app, &request_id_for_done, &event.kind, event.text);
        }
        Ok(session)
    })
    .await
    .map_err(|error| format!("Failed to wait for streaming provider response: {error}"))
    .and_then(|result| {
        let _ = state.finish(&request_id_for_finish);
        result
    })
}

#[tauri::command]
pub fn cancel_desktop_chat_stream(
    state: State<'_, DesktopChatStreamState>,
    request_id: String,
) -> Result<bool, String> {
    let id = request_id.trim();
    if id.is_empty() {
        return Err("Chat stream request_id cannot be empty.".to_string());
    }
    state.cancel(id)
}

#[cfg(test)]
mod tests {
    use super::{
        anthropic_message, openai_message, request_completion, request_streaming_completion,
        send_chat_at, validate_attachments, DesktopChatAttachment, DesktopChatMessage,
        DesktopMemory, DesktopProviderConfig, SendChatRequest,
    };
    use crate::app_state::now_ms;
    use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
    use serde_json::{json, Value};
    use std::fs;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    #[test]
    fn image_attachments_become_provider_multimodal_content() {
        let attachment = DesktopChatAttachment {
            name: "diagram.png".to_string(),
            mime: "image/png".to_string(),
            data_base64: BASE64.encode(b"image"),
            bytes: 5,
        };
        validate_attachments(std::slice::from_ref(&attachment)).unwrap();
        let message = DesktopChatMessage {
            id: "message-image".to_string(),
            role: "user".to_string(),
            content: "Explain this".to_string(),
            attachments: vec![attachment],
            processes: Vec::new(),
            created_at_ms: now_ms(),
        };

        assert_eq!(
            openai_message(&message)
                .pointer("/content/1/type")
                .and_then(Value::as_str),
            Some("image_url")
        );
        assert_eq!(
            anthropic_message(&message)
                .pointer("/content/1/type")
                .and_then(Value::as_str),
            Some("image")
        );
    }

    #[test]
    fn real_chat_workflow_calls_provider_and_persists_session() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buffer = [0u8; 8192];
            let bytes = stream.read(&mut buffer).unwrap();
            let request = String::from_utf8_lossy(&buffer[..bytes]);
            assert!(request.contains("POST /v1/chat/completions"));
            assert!(request.contains("hello desktop"));
            let body = r#"{"choices":[{"message":{"role":"assistant","content":"native reply"}}]}"#;
            write!(
                stream,
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .unwrap();
        });
        let root = std::env::temp_dir().join(format!(
            "smara-desktop-chat-{}-{}",
            std::process::id(),
            now_ms()
        ));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("chat.json");
        let config = DesktopProviderConfig {
            provider: "custom".to_string(),
            model: "test-model".to_string(),
            endpoint: format!("http://{address}/v1"),
        };
        let session = send_chat_at(
            &path,
            &config,
            SendChatRequest {
                session_id: None,
                message: "hello desktop".to_string(),
                request_id: None,
                workspace: Some("test-ws".to_string()),
                attachments: Vec::new(),
            },
            vec![DesktopMemory {
                id: "memory-test".to_string(),
                content: "Desktop context marker".to_string(),
                tags: vec!["desktop".to_string()],
                workspace: Some("test-ws".to_string()),
                created_at_ms: now_ms(),
                updated_at_ms: now_ms(),
            }],
        )
        .unwrap();
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[1].content, "native reply");
        assert_eq!(session.workspace.as_deref(), Some("test-ws"));
        assert_eq!(session.memory_context_count, 1);
        assert!(path.exists());
        server.join().unwrap();
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn anthropic_native_chat_uses_messages_api_and_parses_content() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buffer = [0u8; 8192];
            let bytes = stream.read(&mut buffer).unwrap();
            let request = String::from_utf8_lossy(&buffer[..bytes]);
            assert!(request.contains("POST /v1/messages"));
            assert!(request
                .to_ascii_lowercase()
                .contains("anthropic-version: 2023-06-01"));
            assert!(request.contains("anthropic hello"));
            let body = r#"{"content":[{"type":"text","text":"anthropic native reply"}]}"#;
            write!(
                stream,
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .unwrap();
        });
        let config = DesktopProviderConfig {
            provider: "anthropic".to_string(),
            model: "claude-test".to_string(),
            endpoint: format!("http://{address}/v1"),
        };
        let response = request_completion(
            &config,
            &[DesktopChatMessage {
                id: "message-test".to_string(),
                role: "user".to_string(),
                content: "anthropic hello".to_string(),
                attachments: Vec::new(),
                processes: Vec::new(),
                created_at_ms: now_ms(),
            }],
            &[],
        )
        .unwrap();
        assert_eq!(response, "anthropic native reply");
        server.join().unwrap();
    }

    #[test]
    fn openai_and_anthropic_streams_emit_deltas() {
        for (provider, path, body, expected) in [
            (
                "custom",
                "/v1/chat/completions",
                "data: {\"choices\":[{\"delta\":{\"content\":\"native \"}}]}\n\ndata: {\"choices\":[{\"delta\":{\"content\":\"stream\"}}]}\n\ndata: [DONE]\n\n",
                "native stream",
            ),
            (
                "anthropic",
                "/v1/messages",
                "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"claude \"}}\n\ndata: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"stream\"}}\n\n",
                "claude stream",
            ),
        ] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let body = body.to_string();
            let server = thread::spawn(move || {
                let (mut stream, _) = listener.accept().unwrap();
                let mut buffer = [0u8; 8192];
                let bytes = stream.read(&mut buffer).unwrap();
                let request = String::from_utf8_lossy(&buffer[..bytes]);
                assert!(request.contains(path));
                assert!(request.contains("\"stream\":true"));
                write!(
                    stream,
                    "HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                    body.len(),
                    body
                )
                .unwrap();
            });
            let config = DesktopProviderConfig {
                provider: provider.to_string(),
                model: "stream-test".to_string(),
                endpoint: format!("http://{address}/v1"),
            };
            let mut deltas = Vec::new();
            let response = request_streaming_completion(
                &config,
                &[json!({
                    "role": "user",
                    "content": "stream please",
                })],
                &[],
                |_reasoning| {},
                |delta| deltas.push(delta.to_string()),
                || false,
            )
            .unwrap();
            assert_eq!(response.content, expected);
            assert_eq!(deltas.concat(), expected);
            server.join().unwrap();
        }
    }
}
