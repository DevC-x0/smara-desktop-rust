use crate::app_state::now_ms;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, State};

const MCP_SERVERS_FILE: &str = "mcp-servers.json";
const MCP_TIMEOUT: Duration = Duration::from_secs(12);
const MAX_SERVERS: usize = 100;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DesktopMcpServer {
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    pub created_at_ms: u128,
    pub updated_at_ms: u128,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SaveDesktopMcpServerRequest {
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DesktopMcpTool {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub input_schema: Value,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct DesktopMcpHealth {
    pub server_name: String,
    pub online: bool,
    pub latency_ms: u128,
    pub protocol_version: String,
    pub tools: Vec<DesktopMcpTool>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CallDesktopMcpToolRequest {
    pub server_name: String,
    pub tool: String,
    #[serde(default)]
    pub arguments: Value,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct DesktopMcpToolResult {
    pub server_name: String,
    pub tool: String,
    pub content: Value,
    pub is_error: bool,
}

#[derive(Default)]
pub struct DesktopMcpPoolState {
    processes: Arc<Mutex<HashMap<String, PooledMcpProcess>>>,
}

struct PooledMcpProcess {
    signature: String,
    protocol_version: String,
    process: McpProcess,
}

fn server_signature(server: &DesktopMcpServer) -> String {
    let mut env = server.env.iter().collect::<Vec<_>>();
    env.sort_by(|a, b| a.0.cmp(b.0));
    format!(
        "{}\n{}\n{}",
        server.command,
        serde_json::to_string(&server.args).unwrap_or_default(),
        env.into_iter()
            .map(|(key, value)| format!("{key}={value}"))
            .collect::<Vec<_>>()
            .join("\n")
    )
}

fn remove_pooled_process(state: &DesktopMcpPoolState, name: &str) -> Result<(), String> {
    state
        .processes
        .lock()
        .map_err(|_| "Failed to lock MCP process pool.".to_string())?
        .remove(name);
    Ok(())
}

fn with_pooled_process<T>(
    state: &DesktopMcpPoolState,
    server: &DesktopMcpServer,
    run: impl FnOnce(&mut McpProcess, &str) -> Result<T, String>,
) -> Result<T, String> {
    let signature = server_signature(server);
    let mut processes = state
        .processes
        .lock()
        .map_err(|_| "Failed to lock MCP process pool.".to_string())?;
    let needs_restart = processes
        .get(&server.name)
        .map(|pooled| pooled.signature != signature)
        .unwrap_or(true);
    if needs_restart {
        processes.remove(&server.name);
        let mut process = McpProcess::start(server)?;
        let protocol_version = process.initialize()?;
        processes.insert(
            server.name.clone(),
            PooledMcpProcess {
                signature,
                protocol_version,
                process,
            },
        );
    }
    let pooled = processes
        .get_mut(&server.name)
        .ok_or_else(|| "Failed to open pooled MCP process.".to_string())?;
    run(&mut pooled.process, &pooled.protocol_version)
}

pub(crate) fn mcp_servers_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Failed to resolve Desktop config directory: {error}"))?;
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Failed to create Desktop config directory: {error}"))?;
    Ok(dir.join(MCP_SERVERS_FILE))
}

pub(crate) fn load_mcp_servers_from(path: &Path) -> Result<Vec<DesktopMcpServer>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw =
        fs::read_to_string(path).map_err(|error| format!("Failed to read MCP servers: {error}"))?;
    serde_json::from_str(&raw).map_err(|error| format!("Failed to parse MCP servers: {error}"))
}

fn save_mcp_servers_to(path: &Path, servers: &[DesktopMcpServer]) -> Result<(), String> {
    let raw = serde_json::to_string_pretty(servers)
        .map_err(|error| format!("Failed to serialize MCP servers: {error}"))?;
    fs::write(path, raw).map_err(|error| format!("Failed to save MCP servers: {error}"))
}

fn validate_server(request: &SaveDesktopMcpServerRequest) -> Result<(), String> {
    if request.name.trim().is_empty() || request.name.chars().count() > 80 {
        return Err("MCP server name must contain 1-80 characters.".to_string());
    }
    if request.command.trim().is_empty() {
        return Err("MCP server command cannot be empty.".to_string());
    }
    if request.args.len() > 100 || request.env.len() > 100 {
        return Err("MCP server args/env limit exceeded.".to_string());
    }
    if request
        .env
        .keys()
        .any(|key| key.trim().is_empty() || key.contains('='))
    {
        return Err("MCP environment keys cannot be empty or contain '='.".to_string());
    }
    Ok(())
}

fn save_server_at(
    path: &Path,
    request: SaveDesktopMcpServerRequest,
) -> Result<DesktopMcpServer, String> {
    validate_server(&request)?;
    let mut servers = load_mcp_servers_from(path)?;
    let name = request.name.trim().to_string();
    let existing = servers.iter().position(|server| server.name == name);
    if existing.is_none() && servers.len() >= MAX_SERVERS {
        return Err(format!(
            "Desktop MCP server limit of {MAX_SERVERS} reached."
        ));
    }
    let timestamp = now_ms();
    let previous = existing.map(|index| servers.remove(index));
    let server = DesktopMcpServer {
        name,
        command: request.command.trim().to_string(),
        args: request.args,
        env: request.env,
        created_at_ms: previous
            .as_ref()
            .map_or(timestamp, |server| server.created_at_ms),
        updated_at_ms: timestamp,
    };
    servers.insert(0, server.clone());
    save_mcp_servers_to(path, &servers)?;
    Ok(server)
}

fn delete_server_at(path: &Path, name: &str) -> Result<bool, String> {
    let mut servers = load_mcp_servers_from(path)?;
    let before = servers.len();
    servers.retain(|server| server.name != name);
    if before == servers.len() {
        return Ok(false);
    }
    save_mcp_servers_to(path, &servers)?;
    Ok(true)
}

fn server_at(path: &Path, name: &str) -> Result<DesktopMcpServer, String> {
    load_mcp_servers_from(path)?
        .into_iter()
        .find(|server| server.name == name)
        .ok_or_else(|| format!("Desktop MCP server '{name}' was not found."))
}

struct McpProcess {
    child: Child,
    stdin: ChildStdin,
    lines: mpsc::Receiver<String>,
    next_id: u64,
}

impl McpProcess {
    fn start(server: &DesktopMcpServer) -> Result<Self, String> {
        let mut command = Command::new(&server.command);
        command
            .args(&server.args)
            .envs(&server.env)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        let mut child = command
            .spawn()
            .map_err(|error| format!("Failed to start MCP server '{}': {error}", server.name))?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "MCP stdin is unavailable.".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "MCP stdout is unavailable.".to_string())?;
        let (sender, lines) = mpsc::channel();
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if sender.send(line).is_err() {
                    break;
                }
            }
        });
        Ok(Self {
            child,
            stdin,
            lines,
            next_id: 1,
        })
    }

    fn write(&mut self, message: &Value) -> Result<(), String> {
        serde_json::to_writer(&mut self.stdin, message)
            .map_err(|error| format!("Failed to encode MCP request: {error}"))?;
        self.stdin
            .write_all(b"\n")
            .map_err(|error| format!("Failed to write MCP request: {error}"))?;
        self.stdin
            .flush()
            .map_err(|error| format!("Failed to flush MCP request: {error}"))
    }

    fn request(&mut self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id;
        self.next_id += 1;
        self.write(&json!({"jsonrpc":"2.0","id":id,"method":method,"params":params}))?;
        let deadline = Instant::now() + MCP_TIMEOUT;
        loop {
            let remaining = deadline.saturating_duration_since(Instant::now());
            let line = self.lines.recv_timeout(remaining).map_err(|_| {
                format!(
                    "MCP request '{method}' timed out after {} seconds.",
                    MCP_TIMEOUT.as_secs()
                )
            })?;
            let response: Value = serde_json::from_str(&line)
                .map_err(|error| format!("MCP server returned invalid JSON: {error}"))?;
            if response.get("id").and_then(Value::as_u64) != Some(id) {
                continue;
            }
            if let Some(error) = response.get("error") {
                return Err(format!("MCP request '{method}' failed: {error}"));
            }
            return response
                .get("result")
                .cloned()
                .ok_or_else(|| format!("MCP request '{method}' returned no result."));
        }
    }

    fn initialize(&mut self) -> Result<String, String> {
        let result = self.request(
            "initialize",
            json!({
                "protocolVersion":"2025-03-26",
                "capabilities":{},
                "clientInfo":{"name":"smara-desktop","version":env!("CARGO_PKG_VERSION")}
            }),
        )?;
        self.write(&json!({"jsonrpc":"2.0","method":"notifications/initialized","params":{}}))?;
        Ok(result
            .get("protocolVersion")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_string())
    }
}

impl Drop for McpProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn parse_tools(result: &Value) -> Result<Vec<DesktopMcpTool>, String> {
    let tools = result
        .get("tools")
        .and_then(Value::as_array)
        .ok_or_else(|| "MCP tools/list returned no tools array.".to_string())?;
    tools
        .iter()
        .map(|tool| {
            Ok(DesktopMcpTool {
                name: tool
                    .get("name")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "MCP tool is missing a name.".to_string())?
                    .to_string(),
                description: tool
                    .get("description")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                input_schema: tool
                    .get("inputSchema")
                    .cloned()
                    .unwrap_or_else(|| json!({"type":"object"})),
            })
        })
        .collect()
}

#[cfg(test)]
pub(crate) fn check_mcp_server_at(path: &Path, name: &str) -> Result<DesktopMcpHealth, String> {
    let server = server_at(path, name)?;
    let started = Instant::now();
    let outcome = (|| {
        let mut process = McpProcess::start(&server)?;
        let protocol_version = process.initialize()?;
        let tools = parse_tools(&process.request("tools/list", json!({}))?)?;
        Ok::<_, String>((protocol_version, tools))
    })();
    Ok(match outcome {
        Ok((protocol_version, tools)) => DesktopMcpHealth {
            server_name: server.name,
            online: true,
            latency_ms: started.elapsed().as_millis(),
            protocol_version,
            tools,
            error: None,
        },
        Err(error) => DesktopMcpHealth {
            server_name: server.name,
            online: false,
            latency_ms: started.elapsed().as_millis(),
            protocol_version: String::new(),
            tools: Vec::new(),
            error: Some(error),
        },
    })
}

fn check_mcp_server_pooled(
    path: &Path,
    state: &DesktopMcpPoolState,
    name: &str,
) -> Result<DesktopMcpHealth, String> {
    let server = server_at(path, name)?;
    let started = Instant::now();
    let outcome = with_pooled_process(state, &server, |process, protocol_version| {
        let tools = parse_tools(&process.request("tools/list", json!({}))?)?;
        Ok::<_, String>((protocol_version.to_string(), tools))
    });
    Ok(match outcome {
        Ok((protocol_version, tools)) => DesktopMcpHealth {
            server_name: server.name,
            online: true,
            latency_ms: started.elapsed().as_millis(),
            protocol_version,
            tools,
            error: None,
        },
        Err(error) => {
            let _ = remove_pooled_process(state, &server.name);
            DesktopMcpHealth {
                server_name: server.name,
                online: false,
                latency_ms: started.elapsed().as_millis(),
                protocol_version: String::new(),
                tools: Vec::new(),
                error: Some(error),
            }
        }
    })
}

pub(crate) fn call_mcp_tool_at(
    path: &Path,
    request: CallDesktopMcpToolRequest,
) -> Result<DesktopMcpToolResult, String> {
    if request.tool.trim().is_empty() || !request.arguments.is_object() {
        return Err("MCP tool name is required and arguments must be a JSON object.".to_string());
    }
    let server = server_at(path, &request.server_name)?;
    let mut process = McpProcess::start(&server)?;
    process.initialize()?;
    let result = process.request(
        "tools/call",
        json!({"name":request.tool,"arguments":request.arguments}),
    )?;
    Ok(DesktopMcpToolResult {
        server_name: server.name,
        tool: request.tool,
        content: result.get("content").cloned().unwrap_or(Value::Null),
        is_error: result
            .get("isError")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    })
}

fn call_mcp_tool_pooled(
    path: &Path,
    state: &DesktopMcpPoolState,
    request: CallDesktopMcpToolRequest,
) -> Result<DesktopMcpToolResult, String> {
    if request.tool.trim().is_empty() || !request.arguments.is_object() {
        return Err("MCP tool name is required and arguments must be a JSON object.".to_string());
    }
    let server = server_at(path, &request.server_name)?;
    let tool = request.tool.clone();
    let arguments = request.arguments.clone();
    let result = with_pooled_process(state, &server, |process, _| {
        process.request("tools/call", json!({"name":tool,"arguments":arguments}))
    })
    .inspect_err(|_| {
        let _ = remove_pooled_process(state, &server.name);
    })?;
    Ok(DesktopMcpToolResult {
        server_name: server.name,
        tool: request.tool,
        content: result.get("content").cloned().unwrap_or(Value::Null),
        is_error: result
            .get("isError")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    })
}

#[tauri::command]
pub fn list_desktop_mcp_servers(app: AppHandle) -> Result<Vec<DesktopMcpServer>, String> {
    load_mcp_servers_from(&mcp_servers_path(&app)?)
}

#[tauri::command]
pub fn save_desktop_mcp_server(
    app: AppHandle,
    state: State<'_, DesktopMcpPoolState>,
    request: SaveDesktopMcpServerRequest,
) -> Result<DesktopMcpServer, String> {
    let server = save_server_at(&mcp_servers_path(&app)?, request)?;
    remove_pooled_process(&state, &server.name)?;
    Ok(server)
}

#[tauri::command]
pub fn delete_desktop_mcp_server(
    app: AppHandle,
    state: State<'_, DesktopMcpPoolState>,
    name: String,
) -> Result<bool, String> {
    remove_pooled_process(&state, &name)?;
    delete_server_at(&mcp_servers_path(&app)?, &name)
}

#[tauri::command]
pub async fn check_desktop_mcp_server(
    app: AppHandle,
    state: State<'_, DesktopMcpPoolState>,
    name: String,
) -> Result<DesktopMcpHealth, String> {
    let path = mcp_servers_path(&app)?;
    let pool = DesktopMcpPoolState {
        processes: Arc::clone(&state.processes),
    };
    tauri::async_runtime::spawn_blocking(move || check_mcp_server_pooled(&path, &pool, &name))
        .await
        .map_err(|error| format!("Failed to wait for MCP health check: {error}"))?
}

#[tauri::command]
pub async fn call_desktop_mcp_tool(
    app: AppHandle,
    state: State<'_, DesktopMcpPoolState>,
    request: CallDesktopMcpToolRequest,
) -> Result<DesktopMcpToolResult, String> {
    let path = mcp_servers_path(&app)?;
    let pool = DesktopMcpPoolState {
        processes: Arc::clone(&state.processes),
    };
    tauri::async_runtime::spawn_blocking(move || call_mcp_tool_pooled(&path, &pool, request))
        .await
        .map_err(|error| format!("Failed to wait for MCP tool: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::{
        call_mcp_tool_at, call_mcp_tool_pooled, check_mcp_server_at, check_mcp_server_pooled,
        delete_server_at, load_mcp_servers_from, save_server_at, CallDesktopMcpToolRequest,
        DesktopMcpPoolState, SaveDesktopMcpServerRequest,
    };
    use std::collections::HashMap;

    #[test]
    fn mcp_server_config_persists_without_cli() {
        let root = std::env::temp_dir().join(format!(
            "smara-mcp-{}-{}",
            std::process::id(),
            crate::app_state::now_ms()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("mcp.json");
        let server = save_server_at(
            &path,
            SaveDesktopMcpServerRequest {
                name: "local tools".to_string(),
                command: "node".to_string(),
                args: vec!["server.mjs".to_string()],
                env: HashMap::from([("TOKEN".to_string(), "test".to_string())]),
            },
        )
        .unwrap();
        assert_eq!(server.name, "local tools");
        assert_eq!(load_mcp_servers_from(&path).unwrap().len(), 1);
        assert!(delete_server_at(&path, &server.name).unwrap());
        let _ = std::fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn mcp_stdio_handshake_discovers_and_calls_tool() {
        use std::os::unix::fs::PermissionsExt;

        let root = std::env::temp_dir().join(format!(
            "smara-mcp-stdio-{}-{}",
            std::process::id(),
            crate::app_state::now_ms()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let script = root.join("server.sh");
        std::fs::write(&script, r#"#!/bin/sh
while IFS= read -r line; do
  case "$line" in
    *'"method":"initialize"'*) printf '%s\n' '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-03-26","capabilities":{}}}' ;;
    *'"method":"tools/list"'*) printf '%s\n' '{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"echo","description":"Echo text","inputSchema":{"type":"object"}}]}}' ;;
    *'"method":"tools/call"'*) printf '%s\n' '{"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"native MCP result"}],"isError":false}}' ;;
  esac
done
"#).unwrap();
        let mut permissions = std::fs::metadata(&script).unwrap().permissions();
        permissions.set_mode(0o700);
        std::fs::set_permissions(&script, permissions).unwrap();
        let path = root.join("mcp.json");
        save_server_at(
            &path,
            SaveDesktopMcpServerRequest {
                name: "stdio".to_string(),
                command: script.display().to_string(),
                args: Vec::new(),
                env: HashMap::new(),
            },
        )
        .unwrap();

        let health = check_mcp_server_at(&path, "stdio").unwrap();
        assert!(health.online);
        assert_eq!(health.tools[0].name, "echo");
        let result = call_mcp_tool_at(
            &path,
            CallDesktopMcpToolRequest {
                server_name: "stdio".to_string(),
                tool: "echo".to_string(),
                arguments: serde_json::json!({"text":"hello"}),
            },
        )
        .unwrap();
        assert!(!result.is_error);
        assert!(result.content.to_string().contains("native MCP result"));
        let _ = std::fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn mcp_pool_reuses_a_stdio_process_for_repeated_calls() {
        use std::os::unix::fs::PermissionsExt;

        let root = std::env::temp_dir().join(format!(
            "smara-mcp-pool-{}-{}",
            std::process::id(),
            crate::app_state::now_ms()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let script = root.join("server.sh");
        std::fs::write(&script, r#"#!/bin/sh
count=0
while IFS= read -r line; do
  id=$(printf '%s\n' "$line" | sed -n 's/.*"id":\([0-9][0-9]*\).*/\1/p')
  case "$line" in
    *'"method":"initialize"'*) printf '{"jsonrpc":"2.0","id":%s,"result":{"protocolVersion":"2025-03-26","capabilities":{}}}\n' "$id" ;;
    *'"method":"tools/list"'*) printf '{"jsonrpc":"2.0","id":%s,"result":{"tools":[{"name":"count","description":"Count calls","inputSchema":{"type":"object"}}]}}\n' "$id" ;;
    *'"method":"tools/call"'*) count=$((count + 1)); printf '{"jsonrpc":"2.0","id":%s,"result":{"content":[{"type":"text","text":"call-%s"}],"isError":false}}\n' "$id" "$count" ;;
  esac
done
"#).unwrap();
        let mut permissions = std::fs::metadata(&script).unwrap().permissions();
        permissions.set_mode(0o700);
        std::fs::set_permissions(&script, permissions).unwrap();
        let path = root.join("mcp.json");
        save_server_at(
            &path,
            SaveDesktopMcpServerRequest {
                name: "pooled".to_string(),
                command: script.display().to_string(),
                args: Vec::new(),
                env: HashMap::new(),
            },
        )
        .unwrap();
        let pool = DesktopMcpPoolState::default();

        assert!(
            check_mcp_server_pooled(&path, &pool, "pooled")
                .unwrap()
                .online
        );
        let first = call_mcp_tool_pooled(
            &path,
            &pool,
            CallDesktopMcpToolRequest {
                server_name: "pooled".to_string(),
                tool: "count".to_string(),
                arguments: serde_json::json!({}),
            },
        )
        .unwrap();
        let second = call_mcp_tool_pooled(
            &path,
            &pool,
            CallDesktopMcpToolRequest {
                server_name: "pooled".to_string(),
                tool: "count".to_string(),
                arguments: serde_json::json!({}),
            },
        )
        .unwrap();

        assert!(first.content.to_string().contains("call-1"));
        assert!(second.content.to_string().contains("call-2"));
        let _ = std::fs::remove_dir_all(root);
    }
}
