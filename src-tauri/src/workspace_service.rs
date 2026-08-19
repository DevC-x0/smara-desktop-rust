use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const WORKSPACES_FILE: &str = "workspaces.json";
const DEFAULT_WORKSPACE: &str = "default";
const MAX_WORKSPACE_NAME_LEN: usize = 80;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DesktopWorkspace {
    pub name: String,
    pub path: Option<String>,
    pub created_at_ms: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DesktopWorkspaceState {
    pub active: String,
    pub workspaces: Vec<DesktopWorkspace>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WorkspaceFileNode {
    pub name: String,
    pub path: String,
    pub rel_path: String,
    pub is_dir: bool,
    pub size: u64,
    pub extension: Option<String>,
    pub children: Option<Vec<WorkspaceFileNode>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WorkspaceGitStatus {
    pub is_git: bool,
    pub branch: Option<String>,
    pub staged_count: usize,
    pub modified_count: usize,
    pub untracked_count: usize,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WorkspaceGitDiffFile {
    pub path: String,
    pub status: String,
    pub additions: usize,
    pub deletions: usize,
    pub diff: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WorkspaceGitDiffResult {
    pub is_git: bool,
    pub branch: String,
    pub total_files: usize,
    pub total_additions: usize,
    pub total_deletions: usize,
    pub files: Vec<WorkspaceGitDiffFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WorkspaceFileContent {
    pub path: String,
    pub content: String,
    pub size: u64,
    pub is_binary: bool,
}

impl Default for DesktopWorkspaceState {
    fn default() -> Self {
        Self {
            active: DEFAULT_WORKSPACE.to_string(),
            workspaces: vec![DesktopWorkspace {
                name: DEFAULT_WORKSPACE.to_string(),
                path: None,
                created_at_ms: now_ms(),
            }],
        }
    }
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn normalize_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Workspace name cannot be empty.".to_string());
    }
    if name.chars().count() > MAX_WORKSPACE_NAME_LEN {
        return Err(format!(
            "Workspace name cannot exceed {MAX_WORKSPACE_NAME_LEN} characters."
        ));
    }
    if name
        .chars()
        .any(|character| character.is_control() || matches!(character, '/' | '\\'))
    {
        return Err(
            "Workspace name cannot contain path separators or control characters.".to_string(),
        );
    }
    Ok(name.to_string())
}

fn normalize_path(path: Option<String>) -> Option<String> {
    path.and_then(|path| {
        let path = path.trim().to_string();
        if path.is_empty() {
            None
        } else {
            Some(path)
        }
    })
}

fn create_workspace(
    state: &mut DesktopWorkspaceState,
    name: &str,
    path: Option<String>,
) -> Result<(), String> {
    let name = normalize_name(name)?;
    if state
        .workspaces
        .iter()
        .any(|workspace| workspace.name.eq_ignore_ascii_case(&name))
    {
        return Err(format!("Workspace '{name}' already exists."));
    }

    state.workspaces.push(DesktopWorkspace {
        name,
        path: normalize_path(path),
        created_at_ms: now_ms(),
    });
    state
        .workspaces
        .sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    Ok(())
}

fn switch_workspace(state: &mut DesktopWorkspaceState, name: &str) -> Result<(), String> {
    let name = normalize_name(name)?;
    let workspace = state
        .workspaces
        .iter()
        .find(|workspace| workspace.name.eq_ignore_ascii_case(&name))
        .ok_or_else(|| format!("Workspace '{name}' was not found."))?;
    state.active = workspace.name.clone();
    Ok(())
}

fn delete_workspace(state: &mut DesktopWorkspaceState, name: &str) -> Result<(), String> {
    let name = normalize_name(name)?;
    if name.eq_ignore_ascii_case(DEFAULT_WORKSPACE) {
        return Err("Cannot delete the default workspace.".to_string());
    }
    let initial_len = state.workspaces.len();
    state.workspaces.retain(|w| !w.name.eq_ignore_ascii_case(&name));
    if state.workspaces.len() == initial_len {
        return Err(format!("Workspace '{name}' was not found."));
    }
    if state.active.eq_ignore_ascii_case(&name) {
        state.active = DEFAULT_WORKSPACE.to_string();
    }
    Ok(())
}

fn workspaces_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Failed to resolve Desktop config directory: {error}"))?;
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Failed to create Desktop config directory: {error}"))?;
    Ok(dir.join(WORKSPACES_FILE))
}

pub(crate) fn load_workspace_state(app: &AppHandle) -> Result<DesktopWorkspaceState, String> {
    let path = workspaces_path(app)?;
    if !path.exists() {
        return Ok(DesktopWorkspaceState::default());
    }
    let raw = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read Desktop workspaces: {error}"))?;
    serde_json::from_str(&raw)
        .map_err(|error| format!("Failed to parse Desktop workspaces: {error}"))
}

fn save_workspace_state(
    app: &AppHandle,
    state: &DesktopWorkspaceState,
) -> Result<DesktopWorkspaceState, String> {
    let path = workspaces_path(app)?;
    let raw = serde_json::to_string_pretty(state)
        .map_err(|error| format!("Failed to serialize Desktop workspaces: {error}"))?;
    fs::write(path, raw).map_err(|error| format!("Failed to save Desktop workspaces: {error}"))?;
    Ok(state.clone())
}

pub fn resolve_workspace_root(app: &AppHandle, workspace_name: Option<&str>) -> PathBuf {
    if let Ok(state) = load_workspace_state(app) {
        let target_name = workspace_name.unwrap_or(&state.active);
        if let Some(ws) = state.workspaces.iter().find(|w| w.name.eq_ignore_ascii_case(target_name)) {
            if let Some(ref p) = ws.path {
                let pb = PathBuf::from(p);
                if pb.exists() {
                    return pb;
                }
            }
        }
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

pub fn build_file_tree(dir: &Path, root: &Path, current_depth: usize, max_depth: usize) -> Vec<WorkspaceFileNode> {
    if current_depth > max_depth {
        return Vec::new();
    }
    let mut nodes = Vec::new();
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return Vec::new(),
    };

    const IGNORED_NAMES: &[&str] = &[
        ".git", "node_modules", "target", "dist", "build", ".system_generated", ".cache", ".gemini", ".vscode", ".idea", ".next", "out", "coverage", ".venv", "venv", "__pycache__"
    ];

    let mut count = 0;
    for entry in entries.flatten() {
        if count >= 250 {
            break;
        }
        let path = entry.path();
        let name = match entry.file_name().into_string() {
            Ok(n) => n,
            Err(_) => continue,
        };

        if IGNORED_NAMES.contains(&name.as_str()) {
            continue;
        }

        count += 1;

        let rel_path = path.strip_prefix(root).unwrap_or(&path).to_string_lossy().to_string();
        let is_dir = path.is_dir();
        let metadata = entry.metadata().ok();
        let size = metadata.map(|m| m.len()).unwrap_or(0);
        let extension = if is_dir {
            None
        } else {
            path.extension().and_then(|ext| ext.to_str()).map(|s| s.to_ascii_lowercase())
        };

        let children = if is_dir && current_depth < max_depth {
            Some(build_file_tree(&path, root, current_depth + 1, max_depth))
        } else if is_dir {
            Some(Vec::new())
        } else {
            None
        };

        nodes.push(WorkspaceFileNode {
            name,
            path: path.to_string_lossy().to_string(),
            rel_path,
            is_dir,
            size,
            extension,
            children,
        });
    }

    nodes.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    nodes
}

pub fn get_git_status_for_dir(dir: &Path) -> WorkspaceGitStatus {
    let output = Command::new("git")
        .arg("status")
        .arg("--porcelain=v1")
        .arg("-b")
        .current_dir(dir)
        .output();

    let output = match output {
        Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout).to_string(),
        _ => {
            let git_dir = dir.join(".git");
            if git_dir.exists() {
                let head_file = git_dir.join("HEAD");
                let branch = if let Ok(head_content) = fs::read_to_string(head_file) {
                    if let Some(ref_line) = head_content.strip_prefix("ref: refs/heads/") {
                        Some(ref_line.trim().to_string())
                    } else {
                        Some("HEAD".to_string())
                    }
                } else {
                    None
                };
                return WorkspaceGitStatus {
                    is_git: true,
                    branch,
                    staged_count: 0,
                    modified_count: 0,
                    untracked_count: 0,
                    summary: "Git aktif".to_string(),
                };
            }
            return WorkspaceGitStatus {
                is_git: false,
                branch: None,
                staged_count: 0,
                modified_count: 0,
                untracked_count: 0,
                summary: "Bukan Git repo".to_string(),
            };
        }
    };

    let mut branch = None;
    let mut staged_count = 0;
    let mut modified_count = 0;
    let mut untracked_count = 0;

    for line in output.lines() {
        if line.starts_with("##") {
            let branch_part = line.trim_start_matches('#').trim();
            if let Some(idx) = branch_part.find("...") {
                branch = Some(branch_part[..idx].to_string());
            } else {
                branch = Some(branch_part.to_string());
            }
        } else if line.len() >= 2 {
            let chars: Vec<char> = line.chars().collect();
            let staged_char = chars.first().copied().unwrap_or(' ');
            let unstaged_char = chars.get(1).copied().unwrap_or(' ');

            if staged_char == '?' && unstaged_char == '?' {
                untracked_count += 1;
            } else {
                if staged_char != ' ' && staged_char != '?' {
                    staged_count += 1;
                }
                if unstaged_char != ' ' && unstaged_char != '?' {
                    modified_count += 1;
                }
            }
        }
    }

    let summary = format!(
        "Branch: {} | +{} ~{} ?{}",
        branch.as_deref().unwrap_or("HEAD"),
        staged_count,
        modified_count,
        untracked_count
    );

    WorkspaceGitStatus {
        is_git: true,
        branch,
        staged_count,
        modified_count,
        untracked_count,
        summary,
    }
}

#[tauri::command]
pub fn get_desktop_workspaces(app: AppHandle) -> Result<DesktopWorkspaceState, String> {
    load_workspace_state(&app)
}

#[tauri::command]
pub fn create_desktop_workspace(
    app: AppHandle,
    name: String,
    path: Option<String>,
) -> Result<DesktopWorkspaceState, String> {
    let mut state = load_workspace_state(&app)?;
    create_workspace(&mut state, &name, path)?;
    save_workspace_state(&app, &state)
}

#[tauri::command]
pub fn switch_desktop_workspace(
    app: AppHandle,
    name: String,
) -> Result<DesktopWorkspaceState, String> {
    let mut state = load_workspace_state(&app)?;
    switch_workspace(&mut state, &name)?;
    save_workspace_state(&app, &state)
}

#[tauri::command]
pub fn delete_desktop_workspace(
    app: AppHandle,
    name: String,
) -> Result<DesktopWorkspaceState, String> {
    let mut state = load_workspace_state(&app)?;
    delete_workspace(&mut state, &name)?;
    save_workspace_state(&app, &state)
}

#[tauri::command]
pub async fn get_workspace_file_tree(
    app: AppHandle,
    workspace: Option<String>,
    max_depth: Option<usize>,
) -> Result<Vec<WorkspaceFileNode>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = resolve_workspace_root(&app, workspace.as_deref());
        let depth = max_depth.unwrap_or(3);
        Ok(build_file_tree(&root, &root, 0, depth))
    })
    .await
    .map_err(|e| format!("Task execution failed: {e}"))?
}

#[tauri::command]
pub async fn get_workspace_git_status(
    app: AppHandle,
    workspace: Option<String>,
) -> Result<WorkspaceGitStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = resolve_workspace_root(&app, workspace.as_deref());
        Ok(get_git_status_for_dir(&root))
    })
    .await
    .map_err(|e| format!("Task execution failed: {e}"))?
}

pub fn get_git_diff_for_dir(dir: &Path) -> WorkspaceGitDiffResult {
    let output = std::process::Command::new("git")
        .arg("status")
        .arg("--porcelain=v1")
        .arg("-uall")
        .arg("-b")
        .current_dir(dir)
        .output();

    let output = match output {
        Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout).to_string(),
        _ => {
            return WorkspaceGitDiffResult {
                is_git: false,
                branch: String::new(),
                total_files: 0,
                total_additions: 0,
                total_deletions: 0,
                files: Vec::new(),
            };
        }
    };

    let mut branch = "main".to_string();
    let mut files_to_diff: Vec<(String, String)> = Vec::new();

    for line in output.lines() {
        if line.starts_with("##") {
            let branch_part = line.trim_start_matches('#').trim();
            if let Some(idx) = branch_part.find("...") {
                branch = branch_part[..idx].to_string();
            } else {
                branch = branch_part.to_string();
            }
        } else if line.len() >= 4 {
            let status_code = &line[..2];
            let rel_path = line[3..].trim().trim_matches('"').to_string();
            let status = if status_code == "??" {
                "untracked".to_string()
            } else if status_code.contains('A') {
                "added".to_string()
            } else if status_code.contains('D') {
                "deleted".to_string()
            } else {
                "modified".to_string()
            };
            files_to_diff.push((rel_path, status));
        }
    }

    let mut diff_files = Vec::new();
    let mut total_additions = 0;
    let mut total_deletions = 0;

    for (rel_path, status) in files_to_diff {
        let mut adds = 0;
        let mut dels = 0;
        let diff_text = if status == "untracked" {
            let file_full = dir.join(&rel_path);
            if let Ok(content) = fs::read_to_string(&file_full) {
                let lines_count = content.lines().count();
                adds = lines_count;
                let mut diff_buf = format!("--- /dev/null\n+++ b/{rel_path}\n@@ -0,0 +1,{} @@\n", lines_count.max(1));
                for line in content.lines().take(500) {
                    diff_buf.push('+');
                    diff_buf.push_str(line);
                    diff_buf.push('\n');
                }
                if lines_count > 500 {
                    diff_buf.push_str("... [Diff truncated to 500 lines]");
                }
                diff_buf
            } else {
                format!("--- /dev/null\n+++ b/{rel_path}\n@@ -0,0 +1 @@\n+ [Binary or Unreadable File]")
            }
        } else {
            let diff_out = std::process::Command::new("git")
                .args(["diff", "HEAD", "--", &rel_path])
                .current_dir(dir)
                .output();

            let raw_diff = match diff_out {
                Ok(out) if out.status.success() && !out.stdout.is_empty() => {
                    String::from_utf8_lossy(&out.stdout).to_string()
                }
                _ => {
                    let fallback_out = std::process::Command::new("git")
                        .args(["diff", "--", &rel_path])
                        .current_dir(dir)
                        .output();
                    match fallback_out {
                        Ok(fout) => String::from_utf8_lossy(&fout.stdout).to_string(),
                        _ => String::new(),
                    }
                }
            };

            for line in raw_diff.lines() {
                if line.starts_with('+') && !line.starts_with("+++") {
                    adds += 1;
                } else if line.starts_with('-') && !line.starts_with("---") {
                    dels += 1;
                }
            }
            if raw_diff.trim().is_empty() {
                format!("// No visible diff lines for {rel_path} ({status})")
            } else {
                raw_diff
            }
        };

        total_additions += adds;
        total_deletions += dels;

        diff_files.push(WorkspaceGitDiffFile {
            path: rel_path,
            status,
            additions: adds,
            deletions: dels,
            diff: diff_text,
        });
    }

    let total_files = diff_files.len();

    WorkspaceGitDiffResult {
        is_git: true,
        branch,
        total_files,
        total_additions,
        total_deletions,
        files: diff_files,
    }
}

#[tauri::command]
pub async fn get_workspace_git_diff(
    app: AppHandle,
    workspace: Option<String>,
) -> Result<WorkspaceGitDiffResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = resolve_workspace_root(&app, workspace.as_deref());
        Ok(get_git_diff_for_dir(&root))
    })
    .await
    .map_err(|e| format!("Task execution failed: {e}"))?
}

#[tauri::command]
pub async fn read_workspace_file(
    app: AppHandle,
    path: String,
) -> Result<WorkspaceFileContent, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = resolve_workspace_root(&app, None);
        let target_path = if Path::new(&path).is_absolute() {
            PathBuf::from(&path)
        } else {
            root.join(&path)
        };

        if !target_path.exists() {
            return Err(format!("File not found: {path}"));
        }

        let metadata = fs::metadata(&target_path)
            .map_err(|e| format!("Failed to read metadata for {path}: {e}"))?;
        let size = metadata.len();

        // Read up to 2MB
        if size > 2 * 1024 * 1024 {
            return Err("File is too large to preview (> 2MB).".to_string());
        }

        let bytes = fs::read(&target_path)
            .map_err(|e| format!("Failed to read file {path}: {e}"))?;

        let is_binary = bytes.iter().take(1024).any(|&b| b == 0);
        let content = if is_binary {
            "[Binary file preview not supported]".to_string()
        } else {
            String::from_utf8_lossy(&bytes).to_string()
        };

        Ok(WorkspaceFileContent {
            path,
            size,
            is_binary,
            content,
        })
    })
    .await
    .map_err(|e| format!("Task execution failed: {e}"))?
}
#[tauri::command]
pub fn apply_code_to_file(
    app: AppHandle,
    path: String,
    content: String,
) -> Result<bool, String> {
    let root = resolve_workspace_root(&app, None);
    let target_path = if Path::new(&path).is_absolute() {
        PathBuf::from(&path)
    } else {
        root.join(&path)
    };

    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directories: {e}"))?;
    }

    fs::write(&target_path, content)
        .map_err(|e| format!("Failed to write to file {}: {e}", target_path.display()))?;

    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_state_is_immediately_usable() {
        let state = DesktopWorkspaceState::default();
        assert_eq!(state.active, "default");
        assert_eq!(state.workspaces.len(), 1);
    }

    #[test]
    fn create_and_switch_workspace() {
        let mut state = DesktopWorkspaceState::default();

        create_workspace(
            &mut state,
            "Project Alpha",
            Some(" /tmp/alpha ".to_string()),
        )
        .unwrap();
        switch_workspace(&mut state, "project alpha").unwrap();

        assert_eq!(state.active, "Project Alpha");
        assert_eq!(state.workspaces[1].path.as_deref(), Some("/tmp/alpha"));
    }

    #[test]
    fn rejects_duplicate_and_path_like_names() {
        let mut state = DesktopWorkspaceState::default();

        assert!(create_workspace(&mut state, "DEFAULT", None).is_err());
        assert!(create_workspace(&mut state, "../unsafe", None).is_err());
        assert!(switch_workspace(&mut state, "missing").is_err());
    }

    #[test]
    fn delete_custom_workspace_and_reset_active_if_deleted() {
        let mut state = DesktopWorkspaceState::default();
        create_workspace(&mut state, "TempFolder", None).unwrap();
        switch_workspace(&mut state, "TempFolder").unwrap();
        assert_eq!(state.active, "TempFolder");

        delete_workspace(&mut state, "TempFolder").unwrap();
        assert_eq!(state.active, "default");
        assert_eq!(state.workspaces.len(), 1);

        assert!(delete_workspace(&mut state, "default").is_err());
    }

    #[test]
    fn file_tree_builder_respects_depth_and_ignores() {
        let temp_dir = std::env::temp_dir().join("smara_test_tree");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(temp_dir.join("subdir/nested")).unwrap();
        fs::create_dir_all(temp_dir.join(".git")).unwrap();
        fs::write(temp_dir.join("hello.rs"), "fn main() {}").unwrap();
        fs::write(temp_dir.join("subdir/sub.txt"), "test").unwrap();

        let tree = build_file_tree(&temp_dir, &temp_dir, 0, 2);
        assert!(!tree.iter().any(|node| node.name == ".git"));
        assert!(tree.iter().any(|node| node.name == "hello.rs" && !node.is_dir));
        assert!(tree.iter().any(|node| node.name == "subdir" && node.is_dir));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn git_status_check_handles_non_git() {
        let temp_dir = std::env::temp_dir().join("smara_test_nongit");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let status = get_git_status_for_dir(&temp_dir);
        assert!(!status.is_git);
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn git_diff_check_handles_non_git() {
        let temp_dir = std::env::temp_dir().join("smara_test_diff_nongit");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let diff = get_git_diff_for_dir(&temp_dir);
        assert!(!diff.is_git);
        assert_eq!(diff.files.len(), 0);
        let _ = fs::remove_dir_all(&temp_dir);
    }
}
