use crate::app_state::now_ms;
use crate::improvement_service::learn_from_desktop_chat;
use crate::memory_service::{relevant_memories, DesktopMemory};
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
pub struct DesktopChatAttachment {
    pub name: String,
    pub mime: String,
    pub data_base64: String,
    pub bytes: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DesktopChatMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    #[serde(default)]
    pub attachments: Vec<DesktopChatAttachment>,
    pub created_at_ms: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DesktopChatSession {
    pub id: String,
    pub title: String,
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
    let key = match provider {
        "openai" => "OPENAI_API_KEY",
        "openrouter" => "OPENROUTER_API_KEY",
        "anthropic" => "ANTHROPIC_API_KEY",
        _ => return None,
    };
    env::var(key).ok().filter(|value| !value.trim().is_empty())
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
    if let Some(context) = memory_context(memories) {
        provider_messages.push(json!({
            "role": "system",
            "content": context,
        }));
    }
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
    if let Some(context) = memory_context(memories) {
        payload["system"] = Value::String(context);
    }
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
    mut parse_delta: impl FnMut(&Value) -> Option<String>,
    mut on_delta: impl FnMut(&str),
    mut should_cancel: impl FnMut() -> bool,
) -> Result<String, String> {
    let status = response.status();
    if !status.is_success() {
        let body = response
            .text()
            .unwrap_or_else(|_| "provider response body unavailable".to_string());
        return Err(format!("Provider returned HTTP {status}: {body}"));
    }
    let mut full = String::new();
    for line in BufReader::new(response).lines() {
        if should_cancel() {
            return Err("Streaming Chat request was cancelled.".to_string());
        }
        let line = line.map_err(|error| format!("Failed to read provider stream: {error}"))?;
        let Some(data) = line.strip_prefix("data:") else {
            continue;
        };
        let data = data.trim();
        if data.is_empty() || data == "[DONE]" {
            continue;
        }
        let event: Value = serde_json::from_str(data)
            .map_err(|error| format!("Provider stream returned invalid JSON: {error}"))?;
        if let Some(delta) = parse_delta(&event).filter(|delta| !delta.is_empty()) {
            if should_cancel() {
                return Err("Streaming Chat request was cancelled.".to_string());
            }
            full.push_str(&delta);
            on_delta(&delta);
        }
    }
    if full.trim().is_empty() {
        return Err("Provider stream completed without text content.".to_string());
    }
    Ok(full)
}

fn request_streaming_completion(
    config: &DesktopProviderConfig,
    messages: &[DesktopChatMessage],
    memories: &[DesktopMemory],
    on_delta: impl FnMut(&str),
    should_cancel: impl FnMut() -> bool,
) -> Result<String, String> {
    if config.provider == "anthropic" {
        return request_anthropic_streaming_completion(
            config,
            messages,
            memories,
            on_delta,
            should_cancel,
        );
    }
    let mut provider_messages = Vec::new();
    if let Some(context) = memory_context(memories) {
        provider_messages.push(json!({"role": "system", "content": context}));
    }
    provider_messages.extend(messages.iter().map(openai_message));
    let payload = json!({
        "model": config.model,
        "stream": true,
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
        .map_err(|error| format!("Provider stream request failed: {error}"))?;
    stream_response_lines(
        response,
        |event| {
            event
                .pointer("/choices/0/delta/content")
                .and_then(Value::as_str)
                .map(str::to_string)
        },
        on_delta,
        should_cancel,
    )
}

fn request_anthropic_streaming_completion(
    config: &DesktopProviderConfig,
    messages: &[DesktopChatMessage],
    memories: &[DesktopMemory],
    on_delta: impl FnMut(&str),
    should_cancel: impl FnMut() -> bool,
) -> Result<String, String> {
    let mut payload = json!({
        "model": config.model,
        "max_tokens": 4096,
        "stream": true,
        "messages": messages.iter().map(anthropic_message).collect::<Vec<_>>(),
    });
    if let Some(context) = memory_context(memories) {
        payload["system"] = Value::String(context);
    }
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
    stream_response_lines(
        response,
        |event| {
            (event.get("type").and_then(Value::as_str) == Some("content_block_delta")
                && event.pointer("/delta/type").and_then(Value::as_str) == Some("text_delta"))
            .then(|| {
                event
                    .pointer("/delta/text")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string()
            })
        },
        on_delta,
        should_cancel,
    )
}

fn send_chat_with(
    path: &Path,
    request: SendChatRequest,
    memories: Vec<DesktopMemory>,
    completion: impl FnOnce(&[DesktopChatMessage], &[DesktopMemory]) -> Result<String, String>,
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
            created_at_ms: timestamp,
            updated_at_ms: timestamp,
            messages: Vec::new(),
            memory_context_count: 0,
        });
    session.messages.push(DesktopChatMessage {
        id: format!("message-{timestamp}-user"),
        role: "user".to_string(),
        content: message.to_string(),
        attachments: request.attachments,
        created_at_ms: timestamp,
    });
    let response = completion(&session.messages, &memories)?;
    session.messages.push(DesktopChatMessage {
        id: format!("message-{}-assistant", now_ms()),
        role: "assistant".to_string(),
        content: response,
        attachments: Vec::new(),
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
        request_completion(config, messages, memories)
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
pub async fn send_desktop_chat(
    app: AppHandle,
    request: SendChatRequest,
) -> Result<DesktopChatSession, String> {
    let memories = relevant_memories(&app, &request.message, 5)?;
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
    emit_chat_stream_event(
        &app,
        &request_id,
        "thinking",
        "Menyiapkan Chat stream dan membaca memory relevan.",
    );
    let memories = relevant_memories(&app, &request.message, 5)?;
    emit_chat_stream_event(
        &app,
        &request_id,
        "analysis",
        format!(
            "Memory context: {} item relevan akan dipakai bila membantu.",
            memories.len()
        ),
    );
    let path = chat_path(&app)?;
    let config = load_provider_config(&app)?;
    emit_chat_stream_event(
        &app,
        &request_id,
        "tool_start",
        format!("Provider call: {} · {}", config.provider, config.model),
    );
    let event_app_for_delta = app.clone();
    let event_app_for_done = app.clone();
    let learning_app = app.clone();
    let stream_state = state.inner().clone();
    let request_id_for_cancel = request_id.clone();
    let request_id_for_finish = request_id.clone();
    let request_id_for_done = request_id.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let session = send_chat_with(&path, request, memories, |messages, memories| {
            let result = request_streaming_completion(
                &config,
                messages,
                memories,
                |delta| {
                    let _ = event_app_for_delta.emit(
                        "desktop-chat-stream",
                        DesktopChatStreamEvent {
                            request_id: request_id.clone(),
                            kind: "delta".to_string(),
                            delta: delta.to_string(),
                        },
                    );
                },
                || {
                    stream_state
                        .is_cancelled(&request_id_for_cancel)
                        .unwrap_or(true)
                },
            );
            match &result {
                Ok(_) => emit_chat_stream_event(
                    &event_app_for_done,
                    &request_id_for_done,
                    "tool_done",
                    "Provider stream selesai.",
                ),
                Err(error) => emit_chat_stream_event(
                    &event_app_for_done,
                    &request_id_for_done,
                    "error",
                    error.clone(),
                ),
            }
            result
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
    use serde_json::Value;
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
                attachments: Vec::new(),
            },
            vec![DesktopMemory {
                id: "memory-test".to_string(),
                content: "Desktop context marker".to_string(),
                tags: vec!["desktop".to_string()],
                created_at_ms: now_ms(),
                updated_at_ms: now_ms(),
            }],
        )
        .unwrap();
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[1].content, "native reply");
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
                &[DesktopChatMessage {
                    id: "stream-user".to_string(),
                    role: "user".to_string(),
                    content: "stream please".to_string(),
                    attachments: Vec::new(),
                    created_at_ms: now_ms(),
                }],
                &[],
                |delta| deltas.push(delta.to_string()),
                || false,
            )
            .unwrap();
            assert_eq!(response, expected);
            assert_eq!(deltas.concat(), expected);
            server.join().unwrap();
        }
    }
}
