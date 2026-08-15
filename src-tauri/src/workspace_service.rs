use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
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

fn workspaces_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Failed to resolve Desktop config directory: {error}"))?;
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Failed to create Desktop config directory: {error}"))?;
    Ok(dir.join(WORKSPACES_FILE))
}

fn load_workspace_state(app: &AppHandle) -> Result<DesktopWorkspaceState, String> {
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

#[cfg(test)]
mod tests {
    use super::{create_workspace, switch_workspace, DesktopWorkspaceState};

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
}
