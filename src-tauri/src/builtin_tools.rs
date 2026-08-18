use crate::app_state::now_ms;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Component, Path, PathBuf};

const MAX_READ_BYTES: u64 = 2 * 1024 * 1024;
const MAX_RESULTS: usize = 100;
const MAX_WALK_DEPTH: usize = 8;
const APPROVAL_MAX_AGE_MS: u128 = 5 * 60 * 1000;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct DesktopBuiltinTool {
    pub name: &'static str,
    pub description: &'static str,
    pub risk_level: &'static str,
    pub requires_approval: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DesktopToolApproval {
    pub action: String,
    pub approved: bool,
    pub approved_at_ms: u128,
    pub summary: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DesktopBuiltinToolRequest {
    pub tool: String,
    pub workspace_root: String,
    #[serde(default)]
    pub args: Value,
    pub approval: Option<DesktopToolApproval>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct DesktopBuiltinToolResult {
    pub tool: String,
    pub workspace_root: String,
    pub output: String,
    pub mutated: bool,
}

pub fn list_desktop_builtin_tools_internal() -> Vec<DesktopBuiltinTool> {
    vec![
        tool(
            "read_file",
            "Read a UTF-8 file inside the selected workspace.",
            "safe-readonly",
            false,
        ),
        tool(
            "view_file",
            "Read a selected line range from a workspace file.",
            "safe-readonly",
            false,
        ),
        tool(
            "list_dir",
            "List entries in a workspace directory.",
            "safe-readonly",
            false,
        ),
        tool(
            "grep_search",
            "Search text recursively inside the workspace.",
            "safe-readonly",
            false,
        ),
        tool(
            "search_path",
            "Search file and directory names inside the workspace.",
            "safe-readonly",
            false,
        ),
        tool(
            "analyze_workspace",
            "Summarize files and directories inside the workspace.",
            "safe-readonly",
            false,
        ),
        tool(
            "planning_template",
            "Create a deterministic implementation or test plan.",
            "safe-readonly",
            false,
        ),
        tool(
            "write_file",
            "Write a UTF-8 file inside the selected workspace.",
            "workspace-mutation",
            true,
        ),
        tool(
            "edit_file",
            "Replace one exact text occurrence in a workspace file.",
            "workspace-mutation",
            true,
        ),
        tool(
            "delete_file",
            "Delete one file inside the selected workspace.",
            "workspace-mutation",
            true,
        ),
        tool(
            "glob",
            "Search files by glob pattern inside the workspace.",
            "safe-readonly",
            false,
        ),
        tool(
            "get_file_info",
            "Get metadata (size, modified time, type) of a workspace file or directory.",
            "safe-readonly",
            false,
        ),
        tool(
            "get_diagnostics",
            "Get lint/type errors for a workspace file.",
            "safe-readonly",
            false,
        ),
        tool(
            "get_git_status",
            "Get git repository status (modified, added, deleted, untracked files).",
            "safe-readonly",
            false,
        ),
        tool(
            "git_diff",
            "Get git diff (staged or unstaged changes).",
            "safe-readonly",
            false,
        ),
        tool(
            "copy_file",
            "Copy a file within the workspace.",
            "workspace-mutation",
            true,
        ),
        tool(
            "rename_file",
            "Rename or move a file/directory within the workspace.",
            "workspace-mutation",
            true,
        ),
        tool(
            "apply_diff",
            "Apply a unified diff patch to a workspace file.",
            "workspace-mutation",
            true,
        ),
        tool(
            "create_terminal",
            "Run a command in the background and return the PID.",
            "workspace-mutation",
            true,
        ),
        tool(
            "kill_process",
            "Kill a background process by PID.",
            "workspace-mutation",
            true,
        ),
        tool(
            "git_commit",
            "Create a git commit with a message.",
            "workspace-mutation",
            true,
        ),
        tool(
            "run_command",
            "Execute a shell command in the workspace directory with stdout/stderr capture.",
            "workspace-mutation",
            true,
        ),
        tool(
            "fetch_web_content",
            "Fetch readable text content and documentation from a web URL.",
            "safe-readonly",
            false,
        ),
        tool(
            "get_code_stats",
            "Get instant lines of code (LOC), language breakdown, and file statistics for the workspace or a subdirectory.",
            "safe-readonly",
            false,
        ),
        tool(
            "search_web",
            "Search the web for technical documentation, library APIs, and error solutions.",
            "safe-readonly",
            false,
        ),
        tool(
            "get_process_logs",
            "Inspect live stdout/stderr logs and running status of a background process started by create_terminal.",
            "safe-readonly",
            false,
        ),
        tool(
            "query_code_graph",
            "Query the workspace code knowledge graph for symbols, functions, dependencies, and file relationships.",
            "safe-readonly",
            false,
        ),
    ]
}

pub fn export_openai_tools_schema() -> Vec<Value> {
    vec![
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "list_dir",
                "description": "List files and directories in a workspace directory.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Relative directory path (e.g. '.' or 'src')"
                        }
                    },
                    "required": ["path"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "read_file",
                "description": "Read UTF-8 text content of a workspace file.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Relative file path"
                        }
                    },
                    "required": ["path"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "view_file",
                "description": "Read a specific line range from a workspace file.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Relative file path" },
                        "start_line": { "type": "integer", "description": "1-based starting line" },
                        "end_line": { "type": "integer", "description": "1-based ending line" }
                    },
                    "required": ["path", "start_line", "end_line"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "grep_search",
                "description": "Search text or regex pattern across workspace files.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "Text pattern to search" },
                        "path": { "type": "string", "description": "Optional directory path" }
                    },
                    "required": ["query"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "search_path",
                "description": "Search for files and directories by filename pattern.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "Filename pattern to match" }
                    },
                    "required": ["query"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "analyze_workspace",
                "description": "Summarize files, directories, and structure of the workspace.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "depth": { "type": "integer", "description": "Scan depth (default 2)" }
                    }
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "glob",
                "description": "Find files matching a glob pattern (e.g. '**/*.ts').",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "pattern": { "type": "string", "description": "Glob pattern" }
                    },
                    "required": ["pattern"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "get_file_info",
                "description": "Get metadata (size, modified time, type) of a file or directory.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Relative path" }
                    },
                    "required": ["path"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "get_git_status",
                "description": "Get git repository status (modified, added, untracked files).",
                "parameters": {
                    "type": "object",
                    "properties": {}
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "git_diff",
                "description": "Get git diff changes.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "staged": { "type": "boolean", "description": "Check staged changes" }
                    }
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "write_file",
                "description": "Write or overwrite a file in the workspace.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Relative file path" },
                        "content": { "type": "string", "description": "File content to write" }
                    },
                    "required": ["path", "content"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "edit_file",
                "description": "Replace a unique text block in a workspace file.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Relative file path" },
                        "target": { "type": "string", "description": "Exact text to replace" },
                        "replacement": { "type": "string", "description": "Replacement text" }
                    },
                    "required": ["path", "target", "replacement"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "apply_diff",
                "description": "Apply a unified diff patch to a workspace file.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Relative file path" },
                        "patch": { "type": "string", "description": "Unified diff patch" }
                    },
                    "required": ["path", "patch"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "run_command",
                "description": "Execute a shell command directly in the workspace directory (e.g. 'cargo test', 'git status', 'npm run check', 'tree').",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": { "type": "string", "description": "The exact shell command string to execute" }
                    },
                    "required": ["command"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "fetch_web_content",
                "description": "Fetch web documentation, articles, or API specifications from a URL.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "url": { "type": "string", "description": "The full HTTP or HTTPS URL to fetch" }
                    },
                    "required": ["url"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "get_code_stats",
                "description": "Calculate instant lines of code (LOC), file counts, language breakdown, and percentage statistics for a workspace directory or subfolder.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Relative directory path (e.g. '.' or 'komida')" }
                    }
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "search_web",
                "description": "Search the web for technical documentation, library API guides, framework tutorials, and programming solutions.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "The search keywords to look up" },
                        "limit": { "type": "integer", "description": "Maximum number of results (default 5)" }
                    },
                    "required": ["query"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "get_process_logs",
                "description": "Inspect the running status and recent stdout/stderr output lines of a background process started with create_terminal.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "pid": { "type": "integer", "description": "The Process ID (PID) to inspect" },
                        "lines": { "type": "integer", "description": "Number of tail lines to retrieve (default 50)" }
                    },
                    "required": ["pid"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "query_code_graph",
                "description": "Search and query the codebase knowledge graph for symbols, functions, classes, dependencies, and file relationships.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "The symbol, function name, class, or dependency to search" },
                        "max_results": { "type": "integer", "description": "Maximum number of matched nodes to return (default 20)" }
                    },
                    "required": ["query"]
                }
            }
        })
    ]
}

pub fn export_anthropic_tools_schema() -> Vec<Value> {
    export_openai_tools_schema()
        .into_iter()
        .filter_map(|item| {
            let func = item.get("function")?;
            Some(serde_json::json!({
                "name": func.get("name")?,
                "description": func.get("description")?,
                "input_schema": func.get("parameters")?,
            }))
        })
        .collect()
}

fn tool(
    name: &'static str,
    description: &'static str,
    risk_level: &'static str,
    requires_approval: bool,
) -> DesktopBuiltinTool {
    DesktopBuiltinTool {
        name,
        description,
        risk_level,
        requires_approval,
    }
}

pub fn is_mutating_tool(name: &str) -> bool {
    matches!(name, "run_command" | "write_file" | "edit_file" | "delete_file" | "copy_file" | "rename_file" | "apply_diff" | "create_terminal" | "kill_process" | "git_commit")
}

fn validate_tool(name: &str) -> Result<(), String> {
    if list_desktop_builtin_tools_internal()
        .iter()
        .any(|tool| tool.name == name)
    {
        Ok(())
    } else {
        Err(format!("Unsupported Desktop built-in tool '{name}'."))
    }
}

fn validate_approval(tool: &str, approval: Option<&DesktopToolApproval>) -> Result<(), String> {
    if !is_mutating_tool(tool) {
        return Ok(());
    }
    let receipt = approval.ok_or_else(|| format!("Tool '{tool}' requires explicit approval."))?;
    if !receipt.approved {
        return Err("Approval receipt has approved=false.".to_string());
    }
    if receipt.action.trim() != tool {
        return Err(format!(
            "Approval action '{}' does not match tool '{tool}'.",
            receipt.action
        ));
    }
    if receipt.summary.trim().is_empty() {
        return Err("Approval summary cannot be empty.".to_string());
    }
    let current = now_ms();
    if receipt.approved_at_ms > current.saturating_add(30_000) {
        return Err("Approval receipt timestamp is in the future.".to_string());
    }
    if current.saturating_sub(receipt.approved_at_ms) > APPROVAL_MAX_AGE_MS {
        return Err("Approval receipt is too old.".to_string());
    }
    Ok(())
}

fn workspace_root(path: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(path.trim());
    if !root.is_absolute() {
        return Err("workspace_root must be an absolute path.".to_string());
    }
    let root = root
        .canonicalize()
        .map_err(|error| format!("Failed to resolve workspace root: {error}"))?;
    if !root.is_dir() {
        return Err("workspace_root must be an existing directory.".to_string());
    }
    Ok(root)
}

fn relative_path(args: &Value, key: &str) -> Result<PathBuf, String> {
    let raw = args
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("Argument '{key}' must be a string."))?
        .trim();
    if raw.is_empty() {
        return Err(format!("Argument '{key}' cannot be empty."));
    }
    let path = PathBuf::from(raw);
    if path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(format!("Argument '{key}' must stay inside the workspace."));
    }
    Ok(path)
}

fn existing_workspace_path(root: &Path, args: &Value, key: &str) -> Result<PathBuf, String> {
    let path = root.join(relative_path(args, key)?);
    let canonical = path
        .canonicalize()
        .map_err(|error| format!("Failed to resolve workspace path: {error}"))?;
    if !canonical.starts_with(root) {
        return Err("Resolved path escapes the selected workspace.".to_string());
    }
    Ok(canonical)
}

fn writable_workspace_path(root: &Path, args: &Value, key: &str) -> Result<PathBuf, String> {
    let path = root.join(relative_path(args, key)?);
    if path.exists() {
        return existing_workspace_path(root, args, key);
    }
    let mut ancestor = path.parent();
    while let Some(candidate) = ancestor {
        if candidate.exists() {
            let canonical = candidate
                .canonicalize()
                .map_err(|error| format!("Failed to resolve target parent: {error}"))?;
            if !canonical.starts_with(root) {
                return Err("Target path escapes the selected workspace.".to_string());
            }
            return Ok(path);
        }
        ancestor = candidate.parent();
    }
    Err("Target path has no existing parent inside the workspace.".to_string())
}

fn read_text(path: &Path) -> Result<String, String> {
    let metadata =
        fs::metadata(path).map_err(|error| format!("Failed to inspect file: {error}"))?;
    if !metadata.is_file() {
        return Err("Selected path is not a file.".to_string());
    }
    if metadata.len() > MAX_READ_BYTES {
        return Err(format!(
            "File exceeds the Desktop read limit of {MAX_READ_BYTES} bytes."
        ));
    }
    fs::read_to_string(path).map_err(|error| format!("Failed to read UTF-8 file: {error}"))
}

fn walk(root: &Path, max_depth: usize, mut visit: impl FnMut(&Path, &Path)) -> Result<(), String> {
    fn visit_dir(
        workspace: &Path,
        dir: &Path,
        depth: usize,
        max_depth: usize,
        visit: &mut impl FnMut(&Path, &Path),
    ) -> Result<(), String> {
        if depth > max_depth {
            return Ok(());
        }
        let mut entries = fs::read_dir(dir)
            .map_err(|error| format!("Failed to list '{}': {error}", dir.display()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("Failed to inspect directory entry: {error}"))?;
        entries.sort_by_key(|entry| entry.file_name());
        for entry in entries {
            let path = entry.path();
            let file_type = entry
                .file_type()
                .map_err(|error| format!("Failed to inspect directory entry type: {error}"))?;
            if file_type.is_symlink() {
                continue;
            }
            let relative = path.strip_prefix(workspace).unwrap_or(&path);
            visit(&path, relative);
            if file_type.is_dir() {
                visit_dir(workspace, &path, depth + 1, max_depth, visit)?;
            }
        }
        Ok(())
    }
    visit_dir(root, root, 1, max_depth.min(MAX_WALK_DEPTH), &mut visit)
}

fn get_string<'a>(args: &'a Value, key: &str) -> Result<&'a str, String> {
    args.get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("Argument '{key}' must be a string."))
}

fn execute(root: &Path, tool: &str, args: &Value) -> Result<String, String> {
    match tool {
        "read_file" => read_text(&existing_workspace_path(root, args, "path")?),
        "view_file" => {
            let content = read_text(&existing_workspace_path(root, args, "path")?)?;
            let lines = content.lines().collect::<Vec<_>>();
            let start = args.get("start_line").and_then(Value::as_u64).unwrap_or(1) as usize;
            let end = args
                .get("end_line")
                .and_then(Value::as_u64)
                .unwrap_or(lines.len() as u64) as usize;
            if start == 0 || end < start || start > lines.len() {
                return Err("Invalid view_file line range.".to_string());
            }
            Ok(lines[start - 1..end.min(lines.len())]
                .iter()
                .enumerate()
                .map(|(offset, line)| format!("{} | {line}", start + offset))
                .collect::<Vec<_>>()
                .join("\n"))
        }
        "list_dir" => {
            let path = existing_workspace_path(root, args, "path")?;
            if !path.is_dir() {
                return Err("Selected path is not a directory.".to_string());
            }
            let mut entries = fs::read_dir(path)
                .map_err(|error| format!("Failed to list directory: {error}"))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| format!("Failed to inspect directory entry: {error}"))?;
            entries.sort_by_key(|entry| entry.file_name());
            Ok(entries
                .iter()
                .map(|entry| {
                    let suffix = if entry.path().is_dir() { "/" } else { "" };
                    format!("{}{}", entry.file_name().to_string_lossy(), suffix)
                })
                .collect::<Vec<_>>()
                .join("\n"))
        }
        "grep_search" => {
            let query = get_string(args, "query")?;
            if query.is_empty() {
                return Err("Argument 'query' cannot be empty.".to_string());
            }
            let mut matches = Vec::new();
            walk(root, MAX_WALK_DEPTH, |path, relative| {
                if matches.len() >= MAX_RESULTS || !path.is_file() {
                    return;
                }
                if let Ok(content) = read_text(path) {
                    for (index, line) in content.lines().enumerate() {
                        if line.contains(query) && matches.len() < MAX_RESULTS {
                            matches.push(format!("{}:{}:{line}", relative.display(), index + 1));
                        }
                    }
                }
            })?;
            Ok(matches.join("\n"))
        }
        "search_path" => {
            let query = get_string(args, "query")?.to_ascii_lowercase();
            if query.is_empty() {
                return Err("Argument 'query' cannot be empty.".to_string());
            }
            let mut matches = Vec::new();
            walk(root, MAX_WALK_DEPTH, |_, relative| {
                if matches.len() < MAX_RESULTS
                    && relative
                        .to_string_lossy()
                        .to_ascii_lowercase()
                        .contains(&query)
                {
                    matches.push(relative.display().to_string());
                }
            })?;
            Ok(matches.join("\n"))
        }
        "analyze_workspace" => {
            let depth = args.get("depth").and_then(Value::as_u64).unwrap_or(3) as usize;
            let mut files = 0usize;
            let mut directories = 0usize;
            let mut bytes = 0u64;
            walk(root, depth, |path, _| {
                if path.is_dir() {
                    directories += 1;
                } else if path.is_file() {
                    files += 1;
                    bytes = bytes
                        .saturating_add(fs::metadata(path).map(|item| item.len()).unwrap_or(0));
                }
            })?;
            Ok(format!(
                "Workspace: {}\nFiles: {files}\nDirectories: {directories}\nBytes: {bytes}",
                root.display()
            ))
        }
        "planning_template" => {
            let goal = get_string(args, "goal")?.trim();
            if goal.is_empty() {
                return Err("Argument 'goal' cannot be empty.".to_string());
            }
            Ok(format!(
                "# Plan\n\nGoal: {goal}\n\n1. Confirm scope and constraints\n2. Implement the smallest complete change\n3. Run focused tests\n4. Run regression tests\n5. Record residual risks"
            ))
        }
        "write_file" => {
            let path = writable_workspace_path(root, args, "path")?;
            let content = get_string(args, "content")?;
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| format!("Failed to create target directory: {error}"))?;
            }
            fs::write(&path, content).map_err(|error| format!("Failed to write file: {error}"))?;
            let rel = path.strip_prefix(root).unwrap_or(&path).display();
            let line_count = content.lines().count();
            let diff_preview = content
                .lines()
                .take(30)
                .map(|l| format!("+ {l}"))
                .collect::<Vec<_>>()
                .join("\n");
            Ok(format!(
                "Wrote {rel} ({line_count} lines)\n\n```diff\n--- /dev/null\n+++ b/{rel}\n{diff_preview}\n```"
            ))
        }
        "edit_file" => {
            let path = existing_workspace_path(root, args, "path")?;
            let old = get_string(args, "target")
                .or_else(|_| get_string(args, "old_content"))?;
            let new = get_string(args, "replacement")
                .or_else(|_| get_string(args, "new_content"))?;
            let content = read_text(&path)?;
            let count = content.matches(old).count();
            if count != 1 {
                return Err(format!(
                    "Target text must occur exactly once in the file; found {count} occurrences."
                ));
            }
            fs::write(&path, content.replacen(old, new, 1))
                .map_err(|error| format!("Failed to edit file: {error}"))?;
            let rel = path.strip_prefix(root).unwrap_or(&path).display();
            let mut diff_lines = Vec::new();
            diff_lines.push(format!("--- a/{rel}"));
            diff_lines.push(format!("+++ b/{rel}"));
            for line in old.lines() {
                diff_lines.push(format!("- {line}"));
            }
            for line in new.lines() {
                diff_lines.push(format!("+ {line}"));
            }
            Ok(format!(
                "Edited {rel}\n\n```diff\n{}\n```",
                diff_lines.join("\n")
            ))
        }
        "delete_file" => {
            let path = existing_workspace_path(root, args, "path")?;
            if !path.is_file() {
                return Err("delete_file only supports files.".to_string());
            }
            fs::remove_file(&path).map_err(|error| format!("Failed to delete file: {error}"))?;
            Ok(format!(
                "Deleted {}",
                path.strip_prefix(root).unwrap_or(&path).display()
            ))
        }
        "glob" => {
            let pattern = get_string(args, "pattern")?;
            if pattern.is_empty() {
                return Err("Argument 'pattern' cannot be empty.".to_string());
            }
            let mut matches = Vec::new();
            walk(root, MAX_WALK_DEPTH, |path, relative| {
                if matches.len() < MAX_RESULTS && path.is_file() {
                    let name = path.file_name().unwrap_or_default().to_string_lossy();
                    let rel_str = relative.to_string_lossy();
                    // Simple glob: check suffix match for *.ext patterns
                    if pattern.starts_with("*.") {
                        let ext = &pattern[1..]; // e.g. ".go"
                        if name.ends_with(ext) {
                            matches.push(rel_str.to_string());
                        }
                    } else if pattern.starts_with("**/*.") {
                        let ext = &pattern[4..]; // e.g. ".go"
                        if name.ends_with(ext) {
                            matches.push(rel_str.to_string());
                        }
                    } else if rel_str.contains(pattern.trim_start_matches('*')) {
                        matches.push(rel_str.to_string());
                    }
                }
            })?;
            if matches.is_empty() {
                Ok(format!("No files matching '{pattern}'."))
            } else {
                Ok(format!("Found {} files for '{pattern}':\n{}", matches.len(), matches.join("\n")))
            }
        }
        "get_file_info" => {
            let path = existing_workspace_path(root, args, "path")?;
            let metadata = fs::metadata(&path)
                .map_err(|error| format!("Failed to get file info: {error}"))?;
            let file_type = if metadata.is_dir() {
                "directory"
            } else if metadata.is_file() {
                "file"
            } else {
                "other"
            };
            let size = metadata.len();
            let size_str = if size > 1024 * 1024 {
                format!("{:.2} MB ({} bytes)", size as f64 / (1024.0 * 1024.0), size)
            } else if size > 1024 {
                format!("{:.2} KB ({} bytes)", size as f64 / 1024.0, size)
            } else {
                format!("{} bytes", size)
            };
            let modified = metadata
                .modified()
                .map(|t| {
                    let duration = t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
                    format!("{}s since epoch", duration.as_secs())
                })
                .unwrap_or_else(|_| "unknown".to_string());
            let mut info = format!(
                "Path: {}\nType: {file_type}\nSize: {size_str}\nModified: {modified}\nPermissions: {:?}",
                path.strip_prefix(root).unwrap_or(&path).display(),
                metadata.permissions()
            );
            if metadata.is_dir() {
                if let Ok(entries) = fs::read_dir(&path) {
                    let entries: Vec<_> = entries.filter_map(|e| e.ok()).collect();
                    let files = entries.iter().filter(|e| e.path().is_file()).count();
                    let dirs = entries.iter().filter(|e| e.path().is_dir()).count();
                    info.push_str(&format!("\nContents: {} files, {} subdirectories", files, dirs));
                }
            }
            Ok(info)
        }
        "get_diagnostics" => {
            let path = existing_workspace_path(root, args, "path")?;
            let ext = path.extension().unwrap_or_default().to_string_lossy().to_string();
            let output = match ext.as_str() {
                "go" => std::process::Command::new("go")
                    .args(["vet", path.to_str().unwrap_or("")])
                    .output(),
                "ts" | "tsx" => std::process::Command::new("npx")
                    .args(["tsc", "--noEmit", path.to_str().unwrap_or("")])
                    .output(),
                "py" => std::process::Command::new("python3")
                    .args(["-m", "py_compile", path.to_str().unwrap_or("")])
                    .output(),
                _ => return Ok(format!("Diagnostics not available for .{ext} files.")),
            };
            match output {
                Ok(result) => {
                    let stdout = String::from_utf8_lossy(&result.stdout);
                    let stderr = String::from_utf8_lossy(&result.stderr);
                    let combined = format!("{}{}", stdout, stderr);
                    if combined.trim().is_empty() || result.status.success() {
                        Ok(format!("✅ No errors in {}", path.display()))
                    } else {
                        let truncated = if combined.len() > 3000 {
                            format!("{}...\n(truncated)", &combined[..3000])
                        } else {
                            combined
                        };
                        Ok(format!("⚠️ Issues found:\n{}", truncated))
                    }
                }
                Err(error) => Ok(format!("Failed to run diagnostics: {error}")),
            }
        }
        "get_git_status" => {
            let output = std::process::Command::new("git")
                .args(["-C", root.to_str().unwrap_or("."), "status", "--porcelain", "--branch"])
                .output()
                .map_err(|error| format!("Failed to run git: {error}"))?;
            let stdout = String::from_utf8_lossy(&output.stdout);
            if stdout.trim().is_empty() {
                return Ok("✅ Working tree clean (no changes)".to_string());
            }
            let mut branch = String::new();
            let mut modified = Vec::new();
            let mut added = Vec::new();
            let mut deleted = Vec::new();
            let mut untracked = Vec::new();
            for line in stdout.lines() {
                if line.starts_with("##") {
                    branch = line.trim_start_matches("## ").split("...").next().unwrap_or("").to_string();
                    continue;
                }
                if line.len() < 4 { continue; }
                let status = &line[..2];
                let file = line[3..].trim().to_string();
                if status.contains('M') { modified.push(file); }
                else if status.contains('A') { added.push(file); }
                else if status.contains('D') { deleted.push(file); }
                else if status.contains('?') { untracked.push(file); }
            }
            let mut result = Vec::new();
            if !branch.is_empty() {
                result.push(format!("📂 Branch: {branch}"));
            }
            if !modified.is_empty() {
                result.push(format!("\n📝 Modified ({}):\n- {}", modified.len(), modified.join("\n- ")));
            }
            if !added.is_empty() {
                result.push(format!("\n➕ Added ({}):\n- {}", added.len(), added.join("\n- ")));
            }
            if !deleted.is_empty() {
                result.push(format!("\n➖ Deleted ({}):\n- {}", deleted.len(), deleted.join("\n- ")));
            }
            if !untracked.is_empty() {
                result.push(format!("\n❓ Untracked ({}):\n- {}", untracked.len(), untracked.join("\n- ")));
            }
            let total = modified.len() + added.len() + deleted.len() + untracked.len();
            result.push(format!("\n📊 Total: {} files changed", total));
            Ok(result.join("\n"))
        }
        "git_diff" => {
            let staged = args.get("staged").and_then(Value::as_bool).unwrap_or(false);
            let mut cmd_args = vec!["-C", root.to_str().unwrap_or("."), "diff"];
            if staged {
                cmd_args.push("--cached");
            }
            let output = std::process::Command::new("git")
                .args(&cmd_args)
                .output()
                .map_err(|error| format!("Failed to run git diff: {error}"))?;
            let stdout = String::from_utf8_lossy(&output.stdout);
            if stdout.trim().is_empty() {
                if staged {
                    Ok("✅ No staged changes".to_string())
                } else {
                    Ok("✅ No changes (working tree clean)".to_string())
                }
            } else {
                let truncated = if stdout.len() > 5000 {
                    format!("{}...\n(truncated)", &stdout[..5000])
                } else {
                    stdout.to_string()
                };
                Ok(truncated)
            }
        }
        "copy_file" => {
            let source = existing_workspace_path(root, args, "source")?;
            let dest = writable_workspace_path(root, args, "destination")?;
            if source.is_dir() {
                return Err("copy_file only supports files. Use run_command with 'cp -r' for directories.".to_string());
            }
            if let Some(parent) = dest.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| format!("Failed to create target directory: {error}"))?;
            }
            fs::copy(&source, &dest)
                .map_err(|error| format!("Failed to copy file: {error}"))?;
            Ok(format!(
                "Copied {} → {}",
                source.strip_prefix(root).unwrap_or(&source).display(),
                dest.strip_prefix(root).unwrap_or(&dest).display()
            ))
        }
        "rename_file" => {
            let old_path = existing_workspace_path(root, args, "old_path")?;
            let new_path = writable_workspace_path(root, args, "new_path")?;
            if new_path.exists() {
                return Err(format!("Destination already exists: {}", new_path.display()));
            }
            if let Some(parent) = new_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| format!("Failed to create target directory: {error}"))?;
            }
            fs::rename(&old_path, &new_path)
                .map_err(|error| format!("Failed to rename: {error}"))?;
            Ok(format!(
                "Renamed {} → {}",
                old_path.strip_prefix(root).unwrap_or(&old_path).display(),
                new_path.strip_prefix(root).unwrap_or(&new_path).display()
            ))
        }
        "apply_diff" => {
            let path = existing_workspace_path(root, args, "path")?;
            let diff = get_string(args, "diff")?;
            let content = read_text(&path)?;
            let lines: Vec<&str> = content.lines().collect();
            let mut new_lines: Vec<String> = Vec::new();
            let mut line_idx = 0usize;
            for diff_line in diff.lines() {
                if diff_line.starts_with("@@") {
                    // Parse @@ -old_start,old_count +new_start,new_count @@
                    let parts: Vec<&str> = diff_line.split(&[' ', '-', '+', ','][..]).collect();
                    let old_start: usize = parts.iter()
                        .filter_map(|s| s.parse::<usize>().ok())
                        .next()
                        .unwrap_or(0);
                    if old_start > 0 {
                        while line_idx < old_start.saturating_sub(1) && line_idx < lines.len() {
                            new_lines.push(lines[line_idx].to_string());
                            line_idx += 1;
                        }
                    }
                    continue;
                }
                if diff_line.starts_with(' ') {
                    if line_idx < lines.len() {
                        new_lines.push(lines[line_idx].to_string());
                        line_idx += 1;
                    }
                } else if diff_line.starts_with('-') {
                    line_idx += 1;
                } else if diff_line.starts_with('+') {
                    new_lines.push(diff_line[1..].to_string());
                }
            }
            while line_idx < lines.len() {
                new_lines.push(lines[line_idx].to_string());
                line_idx += 1;
            }
            let new_content = new_lines.join("\n");
            let original_count = lines.len();
            let new_count = new_lines.len();
            fs::write(&path, &new_content)
                .map_err(|error| format!("Failed to write file: {error}"))?;
            Ok(format!(
                "✅ Diff applied to {}\n- Lines before: {}\n- Lines after: {}",
                path.strip_prefix(root).unwrap_or(&path).display(),
                original_count,
                new_count
            ))
        }
        "create_terminal" => {
            let command = get_string(args, "command")?;
            #[cfg(unix)]
            let shell = if std::path::Path::new("/bin/bash").exists() { "/bin/bash" } else { "sh" };
            #[cfg(not(unix))]
            let shell = "cmd";

            let child = std::process::Command::new(shell)
                .args(["-c", command])
                .current_dir(root)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn()
                .map_err(|error| format!("Failed to start process: {error}"))?;
            let pid = child.id();

            let log_path = std::env::temp_dir().join(format!("smara_proc_{pid}.log"));
            let mut child = child;
            if let Some(stdout) = child.stdout.take() {
                let log_p = log_path.clone();
                std::thread::spawn(move || {
                    use std::io::{BufRead, BufReader, Write};
                    let reader = BufReader::new(stdout);
                    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&log_p) {
                        for line in reader.lines().flatten() {
                            let _ = writeln!(f, "{}", line);
                        }
                    }
                });
            }
            if let Some(stderr) = child.stderr.take() {
                let log_p = log_path.clone();
                std::thread::spawn(move || {
                    use std::io::{BufRead, BufReader, Write};
                    let reader = BufReader::new(stderr);
                    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&log_p) {
                        for line in reader.lines().flatten() {
                            let _ = writeln!(f, "[STDERR] {}", line);
                        }
                    }
                });
            }

            Ok(format!(
                "✅ Background process started:\n- PID: {pid}\n- Command: `{command}`\n- Working dir: `{}`\n- Log file: `{}`\n\nUse `get_process_logs` with PID {pid} to view output, or `kill_process` to terminate.",
                root.display(),
                log_path.display()
            ))
        }
        "get_process_logs" => {
            let pid = args.get("pid")
                .and_then(Value::as_u64)
                .ok_or_else(|| "Parameter 'pid' must be a valid number.".to_string())? as u32;
            let lines_count = args.get("lines").and_then(Value::as_u64).unwrap_or(50) as usize;

            #[cfg(unix)]
            let is_running = {
                std::process::Command::new("kill")
                    .args(["-0", &pid.to_string()])
                    .output()
                    .map(|o| o.status.success())
                    .unwrap_or(false)
            };
            #[cfg(not(unix))]
            let is_running = false;

            let status_label = if is_running { "🟢 RUNNING (Active)" } else { "⚪ TERMINATED / FINISHED" };
            let log_path = std::env::temp_dir().join(format!("smara_proc_{pid}.log"));
            let content = if log_path.exists() {
                std::fs::read_to_string(&log_path).unwrap_or_else(|_| "(Log file unreadable)".to_string())
            } else {
                "(No output log recorded yet for this PID)".to_string()
            };

            let tail_lines = content
                .lines()
                .rev()
                .take(lines_count)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect::<Vec<_>>()
                .join("\n");

            Ok(format!(
                "📋 **Background Process Status (PID: {})**\n- **Status:** {}\n- **Log File:** `{}`\n\n```text\n{}\n```",
                pid,
                status_label,
                log_path.display(),
                if tail_lines.is_empty() { "(Process has produced no output)" } else { &tail_lines }
            ))
        }
        "get_code_stats" => {
            let rel_path = args.get("path").and_then(Value::as_str).unwrap_or(".");
            let target_dir = if rel_path == "." || rel_path.trim().is_empty() {
                root.to_path_buf()
            } else {
                existing_workspace_path(root, args, "path")?
            };
            if !target_dir.is_dir() {
                return Err(format!("Path '{}' is not a directory.", target_dir.display()));
            }

            let ignored = [
                "node_modules", ".git", ".next", "dist", "target", "build", ".turbo",
                ".cache", "vendor", "__pycache__", ".output", ".nuxt", ".vercel"
            ];

            let mut stats: std::collections::BTreeMap<&'static str, (usize, usize)> = std::collections::BTreeMap::new();
            let mut total_files = 0usize;
            let mut total_loc = 0usize;

            let mut stack = vec![target_dir];
            while let Some(dir) = stack.pop() {
                if let Ok(entries) = std::fs::read_dir(&dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        let name = entry.file_name().to_string_lossy().to_string();
                        if path.is_dir() {
                            if !ignored.contains(&name.as_str()) && !name.starts_with('.') {
                                stack.push(path);
                            }
                        } else if path.is_file() {
                            let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_ascii_lowercase();
                            let lang = match ext.as_str() {
                                "ts" => "TypeScript (.ts)",
                                "tsx" => "TypeScript (TSX)",
                                "js" | "mjs" | "cjs" => "JavaScript",
                                "jsx" => "JavaScript (JSX)",
                                "vue" => "Vue",
                                "svelte" => "Svelte",
                                "html" | "htm" => "HTML",
                                "css" => "CSS",
                                "scss" | "sass" | "less" => "SCSS/SASS",
                                "py" => "Python",
                                "rs" => "Rust",
                                "go" => "Go",
                                "java" => "Java",
                                "kt" | "kts" => "Kotlin",
                                "sol" => "Solidity",
                                "c" => "C",
                                "cpp" | "cc" | "cxx" => "C++",
                                "h" | "hpp" => "C/C++ Header",
                                "sql" => "SQL",
                                "sh" | "bash" | "zsh" => "Shell Script",
                                "json" => "JSON",
                                "yaml" | "yml" => "YAML",
                                "md" | "markdown" => "Markdown",
                                "toml" => "TOML",
                                "xml" => "XML",
                                _ => {
                                    if name == "Dockerfile" || name.starts_with("Dockerfile.") {
                                        "Dockerfile"
                                    } else {
                                        continue;
                                    }
                                }
                            };

                            if let Ok(content) = std::fs::read_to_string(&path) {
                                let loc = content.lines().filter(|l| !l.trim().is_empty()).count();
                                let entry = stats.entry(lang).or_insert((0, 0));
                                entry.0 += 1;
                                entry.1 += loc;
                                total_files += 1;
                                total_loc += loc;
                            }
                        }
                    }
                }
            }

            if total_files == 0 {
                return Ok("No recognized source code files found in the specified path.".to_string());
            }

            let mut sorted: Vec<(&&str, &(usize, usize))> = stats.iter().collect();
            sorted.sort_by(|a, b| b.1.1.cmp(&a.1.1));

            let mut out = format!(
                "📊 **Codebase Statistics & Language Breakdown**\n\
                - **Target Path:** `{}`\n\
                - **Total Files:** {} files\n\
                - **Total Effective Lines of Code (LOC):** {} lines\n\n\
                | Bahasa / Format | Jumlah File | Baris Kode (LOC) | Persentase |\n\
                | :--- | :--- | :--- | :--- |\n",
                rel_path, total_files, total_loc
            );

            for (lang, (files, loc)) in &sorted {
                let pct = if total_loc > 0 { (*loc as f64 / total_loc as f64) * 100.0 } else { 0.0 };
                out.push_str(&format!("| **{}** | {} | {} | {:.2}% |\n", lang, files, loc, pct));
            }

            out.push_str("\n```mermaid\npie title Komposisi Bahasa Pemrograman\n");
            for (lang, (_, loc)) in sorted.iter().take(8) {
                out.push_str(&format!("    \"{}\" : {}\n", lang, loc));
            }
            out.push_str("```\n");

            Ok(out)
        }
        "search_web" => {
            let query = get_string(args, "query")?;
            let limit = args.get("limit").and_then(Value::as_u64).unwrap_or(5).clamp(1, 10) as usize;

            let client = reqwest::blocking::Client::builder()
                .timeout(std::time::Duration::from_secs(12))
                .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
                .build()
                .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

            let encoded_query = url::form_urlencoded::byte_serialize(query.as_bytes()).collect::<String>();
            let ddg_url = format!("https://html.duckduckgo.com/html/?q={encoded_query}");

            let mut results = Vec::new();
            if let Ok(res) = client.get(&ddg_url).send() {
                if let Ok(html) = res.text() {
                    let parts = html.split("class=\"result__snippet\"").collect::<Vec<_>>();
                    if parts.len() > 1 {
                        for part in parts.iter().skip(1).take(limit) {
                            if let Some(snippet_end) = part.find("</a>") {
                                let snippet_raw = &part[..snippet_end];
                                let snippet = snippet_raw
                                    .replace("<b>", "")
                                    .replace("</b>", "")
                                    .replace("&quot;", "\"")
                                    .replace("&amp;", "&")
                                    .replace("&#x27;", "'")
                                    .trim()
                                    .to_string();
                                if !snippet.is_empty() {
                                    results.push(snippet);
                                }
                            }
                        }
                    }
                }
            }

            let instant_url = format!("https://api.duckduckgo.com/?q={encoded_query}&format=json&no_html=1");
            let mut abstract_text = String::new();
            if let Ok(res) = client.get(&instant_url).send() {
                if let Ok(json) = res.json::<Value>() {
                    if let Some(heading) = json.get("Heading").and_then(Value::as_str) {
                        if let Some(abs) = json.get("AbstractText").and_then(Value::as_str) {
                            if !abs.is_empty() {
                                abstract_text = format!("**{}**: {}\nSource: {}", heading, abs, json.get("AbstractURL").and_then(Value::as_str).unwrap_or("DuckDuckGo"));
                            }
                        }
                    }
                }
            }

            let mut out = format!("🌐 **Web Search Results for:** `{}`\n\n", query);
            if !abstract_text.is_empty() {
                out.push_str(&format!("### Summary\n{}\n\n### Web Results\n", abstract_text));
            }

            if results.is_empty() && abstract_text.is_empty() {
                out.push_str("Tidak ada hasil spesifik ditemukan atau koneksi jaringan offline. Coba gunakan kata kunci yang lebih spesifik.");
            } else {
                for (idx, item) in results.iter().enumerate() {
                    out.push_str(&format!("{}. {}\n\n", idx + 1, item));
                }
            }

            Ok(out)
        }
        "query_code_graph" => {
            let query = get_string(args, "query")?;
            let max_results = args.get("max_results").and_then(Value::as_u64).unwrap_or(20).clamp(1, 50) as usize;

            let graph = crate::graphify_service::build_graphify_internal(crate::graphify_service::BuildDesktopGraphifyRequest {
                workspace_root: root.display().to_string(),
                max_files: Some(300),
            })?;

            let matched_nodes = crate::graphify_service::search_graphify_internal(&graph, query);
            let mut out = format!(
                "🕸️ **Code Knowledge Graph Query Results for:** `{}`\n\
                - **Total Graph Nodes in Workspace:** {}\n\
                - **Total Dependencies & Relationships:** {}\n\n",
                query, graph.node_count, graph.edge_count
            );

            if matched_nodes.is_empty() {
                out.push_str("Tidak ada symbol, file, atau dependency yang cocok dengan query tersebut.");
            } else {
                out.push_str("| Kind | Name / Symbol | File Location | Relationships |\n| :--- | :--- | :--- | :--- |\n");
                for node in matched_nodes.iter().take(max_results) {
                    let related_edges = graph.edges.iter()
                        .filter(|e| e.source == node.id || e.target == node.id)
                        .take(3)
                        .map(|e| format!("{}: `{}`", e.relation, e.evidence))
                        .collect::<Vec<_>>()
                        .join("<br>");

                    out.push_str(&format!(
                        "| **{}** | `{}` | `{}` | {} |\n",
                        node.kind,
                        node.label,
                        if node.path.is_empty() { "-" } else { &node.path },
                        if related_edges.is_empty() { "-" } else { &related_edges }
                    ));
                }
            }

            Ok(out)
        }
        "kill_process" => {
            let pid = args.get("pid")
                .and_then(Value::as_u64)
                .ok_or_else(|| "Argument 'pid' must be a number.".to_string())? as u32;
            #[cfg(unix)]
            {
                let _ = std::process::Command::new("kill")
                    .args(["-TERM", &pid.to_string()])
                    .output();
            }
            #[cfg(not(unix))]
            {
                let _ = std::process::Command::new("taskkill")
                    .args(["/PID", &pid.to_string()])
                    .output();
            }
            Ok(format!("✅ Process {pid} terminated"))
        }
        "git_commit" => {
            let message = get_string(args, "message")?;
            let all = args.get("all").and_then(Value::as_bool).unwrap_or(false);
            let mut cmd_args = vec!["-C", root.to_str().unwrap_or("."), "commit", "-m", message];
            if all {
                cmd_args.push("-a");
            }
            let output = std::process::Command::new("git")
                .args(&cmd_args)
                .output()
                .map_err(|error| format!("Failed to run git commit: {error}"))?;
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            if output.status.success() {
                Ok(format!("✅ Commit successful:\n{}{}", stdout, stderr))
            } else {
                Err(format!("Git commit failed:\n{}{}", stdout, stderr))
            }
        }
        "run_command" => {
            let command = get_string(args, "command")?;
            #[cfg(unix)]
            let output = {
                let shell = if std::path::Path::new("/bin/bash").exists() { "/bin/bash" } else { "sh" };
                let mut child = std::process::Command::new(shell)
                    .arg("-s")
                    .current_dir(root)
                    .stdin(std::process::Stdio::piped())
                    .stdout(std::process::Stdio::piped())
                    .stderr(std::process::Stdio::piped())
                    .spawn()
                    .map_err(|error| format!("Failed to spawn shell '{shell}': {error}"))?;

                if let Some(mut stdin) = child.stdin.take() {
                    use std::io::Write;
                    let _ = stdin.write_all(command.as_bytes());
                }
                child.wait_with_output().map_err(|error| format!("Failed to execute command: {error}"))?
            };

            #[cfg(not(unix))]
            let output = {
                let mut cmd = std::process::Command::new("cmd");
                cmd.args(["/C", command]);
                cmd.current_dir(root);
                cmd.output().map_err(|error| format!("Failed to execute command '{command}': {error}"))?
            };

            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let code = output.status.code().unwrap_or(-1);
            let status_label = if output.status.success() { "Exit 0 (Success)" } else { "Exit failed" };

            let mut out = format!("$ {command}\n[Status: {status_label} (code {code})]\n");
            if !stdout.trim().is_empty() {
                out.push_str(&format!("\n--- STDOUT ---\n{stdout}"));
            }
            if !stderr.trim().is_empty() {
                out.push_str(&format!("\n--- STDERR ---\n{stderr}"));
            }
            if stdout.trim().is_empty() && stderr.trim().is_empty() {
                out.push_str("\n(Command produced no output)");
            }
            Ok(out)
        }
        "fetch_web_content" => {
            let url = get_string(args, "url")?;
            if !url.starts_with("http://") && !url.starts_with("https://") {
                return Err("URL must start with http:// or https://".to_string());
            }
            let client = reqwest::blocking::Client::builder()
                .timeout(std::time::Duration::from_secs(15))
                .user_agent("Mozilla/5.0 (compatible; SmaraDesktop/0.3.0)")
                .build()
                .map_err(|e| format!("Failed to create HTTP client: {e}"))?;
            let res = client.get(url).send().map_err(|e| format!("Failed to fetch URL '{url}': {e}"))?;
            let status = res.status();
            let body = res.text().map_err(|e| format!("Failed to read response body: {e}"))?;
            
            let clean = body
                .replace("<script", "\n<!--script")
                .replace("</script>", "-->\n")
                .replace("<style", "\n<!--style")
                .replace("</style>", "-->\n");
            let text_only = clean
                .lines()
                .filter(|l| !l.trim().starts_with("<!--") && !l.trim().starts_with("<") && !l.trim().is_empty())
                .take(150)
                .collect::<Vec<_>>()
                .join("\n");

            let preview = if text_only.len() > 3000 {
                format!("{}...\n[Truncated]", &text_only[..3000])
            } else if text_only.is_empty() {
                if body.len() > 3000 {
                    format!("{}...\n[Raw Content Truncated]", &body[..3000])
                } else {
                    body
                }
            } else {
                text_only
            };

            Ok(format!("HTTP {status} from {url}\n\n{preview}"))
        }
        _ => Err(format!("Unsupported Desktop built-in tool '{tool}'.")),
    }
}

pub fn run_desktop_builtin_tool_internal(
    request: DesktopBuiltinToolRequest,
) -> Result<DesktopBuiltinToolResult, String> {
    let tool = request.tool.trim().to_string();
    validate_tool(&tool)?;
    validate_approval(&tool, request.approval.as_ref())?;
    let root = workspace_root(&request.workspace_root)?;
    let output = execute(&root, &tool, &request.args)?;
    Ok(DesktopBuiltinToolResult {
        tool,
        workspace_root: root.display().to_string(),
        output,
        mutated: is_mutating_tool(request.tool.trim()),
    })
}

#[tauri::command]
pub fn list_desktop_builtin_tools() -> Vec<DesktopBuiltinTool> {
    list_desktop_builtin_tools_internal()
}

#[tauri::command]
pub fn run_desktop_builtin_tool(
    request: DesktopBuiltinToolRequest,
) -> Result<DesktopBuiltinToolResult, String> {
    run_desktop_builtin_tool_internal(request)
}

#[cfg(test)]
mod tests {
    use super::{
        list_desktop_builtin_tools, run_desktop_builtin_tool, DesktopBuiltinToolRequest,
        DesktopToolApproval,
    };
    use crate::app_state::now_ms;
    use serde_json::{json, Value};
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEMP_WORKSPACE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

    fn temp_workspace() -> PathBuf {
        let sequence = TEMP_WORKSPACE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!(
            "smara-desktop-tools-{}-{}-{sequence}",
            std::process::id(),
            now_ms()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn approval(tool: &str) -> DesktopToolApproval {
        DesktopToolApproval {
            action: tool.to_string(),
            approved: true,
            approved_at_ms: now_ms(),
            summary: "Rust-native Desktop integration test".to_string(),
        }
    }

    fn run(
        root: &PathBuf,
        tool: &str,
        args: Value,
        approved: bool,
    ) -> Result<super::DesktopBuiltinToolResult, String> {
        run_desktop_builtin_tool(DesktopBuiltinToolRequest {
            tool: tool.to_string(),
            workspace_root: root.display().to_string(),
            args,
            approval: approved.then(|| approval(tool)),
        })
    }

    #[test]
    fn catalog_exposes_native_workspace_tools() {
        let tools = list_desktop_builtin_tools();
        assert!(tools
            .iter()
            .any(|tool| tool.name == "read_file" && !tool.requires_approval));
        assert!(tools
            .iter()
            .any(|tool| tool.name == "run_command" && tool.requires_approval));
        assert!(tools
            .iter()
            .any(|tool| tool.name == "fetch_web_content" && !tool.requires_approval));
    }

    #[test]
    fn real_workspace_workflow_runs_without_cli_or_web_backend() {
        let root = temp_workspace();
        run(
            &root,
            "write_file",
            json!({"path": "notes/sample.txt", "content": "alpha\nneedle\nomega\n"}),
            true,
        )
        .unwrap();
        assert!(run(
            &root,
            "read_file",
            json!({"path": "notes/sample.txt"}),
            false
        )
        .unwrap()
        .output
        .contains("needle"));
        assert!(run(
            &root,
            "view_file",
            json!({"path": "notes/sample.txt", "start_line": 2, "end_line": 2}),
            false,
        )
        .unwrap()
        .output
        .contains("2 | needle"));
        run(
            &root,
            "edit_file",
            json!({"path": "notes/sample.txt", "old_content": "needle", "new_content": "replacement"}),
            true,
        )
        .unwrap();
        assert!(
            run(&root, "grep_search", json!({"query": "replacement"}), false)
                .unwrap()
                .output
                .contains("sample.txt")
        );
        assert!(run(&root, "search_path", json!({"query": "sample"}), false)
            .unwrap()
            .output
            .contains("sample.txt"));
        assert!(run(&root, "list_dir", json!({"path": "notes"}), false)
            .unwrap()
            .output
            .contains("sample.txt"));
        assert!(run(&root, "analyze_workspace", json!({"depth": 3}), false)
            .unwrap()
            .output
            .contains("Files: 1"));
        assert!(run(
            &root,
            "planning_template",
            json!({"goal": "Test Desktop tools"}),
            false
        )
        .unwrap()
        .output
        .contains("Test Desktop tools"));
        run(
            &root,
            "delete_file",
            json!({"path": "notes/sample.txt"}),
            true,
        )
        .unwrap();
        assert!(!root.join("notes/sample.txt").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn mutations_require_approval_and_paths_cannot_escape_workspace() {
        let root = temp_workspace();
        assert!(run(
            &root,
            "write_file",
            json!({"path": "blocked.txt", "content": "blocked"}),
            false,
        )
        .is_err());
        assert!(run(&root, "read_file", json!({"path": "../outside.txt"}), false).is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn recursive_search_does_not_follow_symlinks_outside_workspace() {
        use std::os::unix::fs::symlink;

        let root = temp_workspace();
        let outside = temp_workspace();
        fs::write(outside.join("secret.txt"), "desktop-secret-marker").unwrap();
        symlink(&outside, root.join("outside-link")).unwrap();

        let output = run(
            &root,
            "grep_search",
            json!({"query": "desktop-secret-marker"}),
            false,
        )
        .unwrap()
        .output;

        assert!(output.is_empty());
        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(outside);
    }

    #[test]
    fn run_command_executes_in_workspace() {
        let root = temp_workspace();
        let result = run(
            &root,
            "run_command",
            json!({"command": "echo 'smara terminal test'"}),
            true,
        )
        .unwrap();
        assert!(result.output.contains("smara terminal test"));
        assert!(result.output.contains("Exit 0"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn get_code_stats_calculates_breakdown_and_generates_mermaid() {
        let root = temp_workspace();
        fs::write(root.join("main.rs"), "fn main() {\n    println!(\"hello\");\n}\n").unwrap();
        fs::write(root.join("app.tsx"), "export function App() {\n    return <div>Smara</div>;\n}\n").unwrap();

        let result = run(&root, "get_code_stats", json!({"path": "."}), false).unwrap();
        assert!(result.output.contains("Rust"));
        assert!(result.output.contains("TypeScript (TSX)"));
        assert!(result.output.contains("pie title Komposisi Bahasa Pemrograman"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn query_code_graph_discovers_symbols() {
        let root = temp_workspace();
        fs::write(root.join("lib.rs"), "pub struct SmaraCore {}\npub fn run_engine() {}\n").unwrap();

        let result = run(&root, "query_code_graph", json!({"query": "SmaraCore"}), false).unwrap();
        assert!(result.output.contains("SmaraCore"));
        let _ = fs::remove_dir_all(root);
    }
}
