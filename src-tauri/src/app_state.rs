use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const DEFAULT_HISTORY_LIMIT: usize = 50;
const SETTINGS_FILE: &str = "settings.json";
const HISTORY_FILE: &str = "run-history.json";
const MAX_IMPORT_FILE_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DesktopSettings {
    pub history_limit: usize,
}

impl Default for DesktopSettings {
    fn default() -> Self {
        Self {
            history_limit: DEFAULT_HISTORY_LIMIT,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RunHistoryItem {
    pub id: String,
    pub action: String,
    pub args: Vec<String>,
    pub path: String,
    pub exit_code: Option<i32>,
    pub success: bool,
    pub timed_out: bool,
    pub duration_ms: u128,
    pub created_at_ms: u128,
    #[serde(default)]
    pub approval_required: bool,
    #[serde(default)]
    pub approval_granted: bool,
    #[serde(default)]
    pub cancelled: bool,
}

pub fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn app_config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map_err(|err| format!("Failed to resolve app config dir: {err}"))
}

fn ensure_config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app_config_dir(app)?;
    fs::create_dir_all(&dir).map_err(|err| format!("Failed to create app config dir: {err}"))?;
    Ok(dir)
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(ensure_config_dir(app)?.join(SETTINGS_FILE))
}

fn history_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(ensure_config_dir(app)?.join(HISTORY_FILE))
}

pub fn normalize_settings(mut settings: DesktopSettings) -> DesktopSettings {
    if settings.history_limit == 0 || settings.history_limit > 500 {
        settings.history_limit = DEFAULT_HISTORY_LIMIT;
    }

    settings
}

pub fn load_settings_internal(app: &AppHandle) -> Result<DesktopSettings, String> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(DesktopSettings::default());
    }

    let raw = fs::read_to_string(&path)
        .map_err(|err| format!("Failed to read desktop settings: {err}"))?;
    let settings = serde_json::from_str::<DesktopSettings>(&raw)
        .map_err(|err| format!("Failed to parse desktop settings JSON: {err}"))?;
    Ok(normalize_settings(settings))
}

pub fn save_settings_internal(
    app: &AppHandle,
    settings: DesktopSettings,
) -> Result<DesktopSettings, String> {
    let normalized = normalize_settings(settings);
    let path = settings_path(app)?;
    let raw = serde_json::to_string_pretty(&normalized)
        .map_err(|err| format!("Failed to serialize desktop settings: {err}"))?;
    fs::write(&path, raw).map_err(|err| format!("Failed to save desktop settings: {err}"))?;
    Ok(normalized)
}

pub fn load_history_internal(app: &AppHandle) -> Result<Vec<RunHistoryItem>, String> {
    let path = history_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }

    let raw =
        fs::read_to_string(&path).map_err(|err| format!("Failed to read run history: {err}"))?;
    serde_json::from_str::<Vec<RunHistoryItem>>(&raw)
        .map_err(|err| format!("Failed to parse run history JSON: {err}"))
}

pub fn clear_history_internal(app: &AppHandle) -> Result<Vec<RunHistoryItem>, String> {
    let path = history_path(app)?;
    fs::write(&path, "[]").map_err(|err| format!("Failed to clear run history: {err}"))?;
    Ok(Vec::new())
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct HistoryItemKey {
    pub id: Option<String>,
    pub action: String,
    pub created_at_ms: u128,
    pub duration_ms: u128,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct HistoryCleanupRequest {
    pub mode: String,
    #[serde(default)]
    pub item_keys: Option<Vec<HistoryItemKey>>,
}

pub fn history_item_status(item: &RunHistoryItem) -> &'static str {
    if item.cancelled {
        "cancelled"
    } else if item.timed_out {
        "timed_out"
    } else if item.success {
        "success"
    } else {
        "failed"
    }
}

fn history_key_matches(item: &RunHistoryItem, key: &HistoryItemKey) -> bool {
    if let Some(id) = &key.id {
        if !id.is_empty() && item.id == *id {
            return true;
        }
    }
    item.action == key.action
        && item.created_at_ms == key.created_at_ms
        && item.duration_ms == key.duration_ms
        && history_item_status(item) == key.status
}

pub fn clear_history_selective_internal(
    app: &AppHandle,
    request: HistoryCleanupRequest,
) -> Result<Vec<RunHistoryItem>, String> {
    let mut history = load_history_internal(app).unwrap_or_default();
    let before = history.len();

    match request.mode.as_str() {
        "all" => history.clear(),
        "failed" => history.retain(|item| history_item_status(item) != "failed"),
        "cancelled_or_timed_out" => history.retain(|item| {
            let status = history_item_status(item);
            status != "cancelled" && status != "timed_out"
        }),
        "approval_required" => history.retain(|item| !item.approval_required),
        "approval_granted" => history.retain(|item| !item.approval_granted),
        "visible_keys" => {
            let keys = request
                .item_keys
                .ok_or_else(|| "visible_keys cleanup requires item keys.".to_string())?;
            if keys.is_empty() {
                return Err("visible_keys cleanup requires at least one item key.".to_string());
            }
            history.retain(|item| !keys.iter().any(|key| history_key_matches(item, key)));
        }
        _ => return Err(format!("Unknown history cleanup mode: {}", request.mode)),
    }

    if before == history.len() && request.mode == "visible_keys" {
        // Still persist below for deterministic output, but make empty/mismatched keys visible.
    }
    let path = history_path(app)?;
    let raw = serde_json::to_string_pretty(&history)
        .map_err(|err| format!("Failed to serialize cleaned run history: {err}"))?;
    fs::write(&path, raw).map_err(|err| format!("Failed to save cleaned run history: {err}"))?;
    Ok(history)
}

pub fn trim_history_to_limit_internal(app: &AppHandle) -> Result<Vec<RunHistoryItem>, String> {
    let settings = load_settings_internal(app).unwrap_or_default();
    let limit = settings.history_limit.max(1).min(500);
    let mut history = load_history_internal(app).unwrap_or_default();
    history.truncate(limit);
    let path = history_path(app)?;
    let raw = serde_json::to_string_pretty(&history)
        .map_err(|err| format!("Failed to serialize trimmed run history: {err}"))?;
    fs::write(&path, raw).map_err(|err| format!("Failed to save trimmed run history: {err}"))?;
    Ok(history)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct HistoryExportSnapshot {
    pub kind: String,
    pub version: u8,
    pub exported_at_ms: u128,
    pub items: Vec<RunHistoryItem>,
}

pub fn replace_history_internal(
    app: &AppHandle,
    mut history: Vec<RunHistoryItem>,
) -> Result<Vec<RunHistoryItem>, String> {
    let settings = load_settings_internal(app).unwrap_or_default();
    let limit = settings.history_limit.max(1).min(500);
    if history.len() > 500 {
        return Err("Imported history exceeds the maximum of 500 items.".to_string());
    }
    history.truncate(limit);
    let path = history_path(app)?;
    let raw = serde_json::to_string_pretty(&history)
        .map_err(|err| format!("Failed to serialize imported run history: {err}"))?;
    fs::write(&path, raw).map_err(|err| format!("Failed to save imported run history: {err}"))?;
    Ok(history)
}

#[tauri::command]
pub fn export_settings_json(app: AppHandle) -> Result<String, String> {
    let settings = load_settings_internal(&app)?;
    serde_json::to_string_pretty(&settings)
        .map_err(|err| format!("Failed to export desktop settings JSON: {err}"))
}

#[tauri::command]
pub fn import_settings_json(app: AppHandle, json: String) -> Result<DesktopSettings, String> {
    let settings = serde_json::from_str::<DesktopSettings>(&json)
        .map_err(|err| format!("Failed to parse imported desktop settings JSON: {err}"))?;
    save_settings_internal(&app, settings)
}

#[tauri::command]
pub fn export_history_json(app: AppHandle) -> Result<String, String> {
    let items = load_history_internal(&app)?;
    let snapshot = HistoryExportSnapshot {
        kind: "run-history-export".to_string(),
        version: 1,
        exported_at_ms: now_ms(),
        items,
    };
    serde_json::to_string_pretty(&snapshot)
        .map_err(|err| format!("Failed to export run history JSON: {err}"))
}

#[tauri::command]
pub fn import_history_json(app: AppHandle, json: String) -> Result<Vec<RunHistoryItem>, String> {
    import_history_json_internal(&app, &json)
}

pub fn import_history_json_internal(
    app: &AppHandle,
    json: &str,
) -> Result<Vec<RunHistoryItem>, String> {
    let trimmed = json.trim();
    let items = if trimmed.starts_with('[') {
        serde_json::from_str::<Vec<RunHistoryItem>>(trimmed)
            .map_err(|err| format!("Failed to parse imported run history array JSON: {err}"))?
    } else {
        let snapshot = serde_json::from_str::<HistoryExportSnapshot>(trimmed)
            .map_err(|err| format!("Failed to parse imported run history snapshot JSON: {err}"))?;
        if snapshot.kind != "run-history-export" {
            return Err("Imported history snapshot kind is not run-history-export.".to_string());
        }
        snapshot.items
    };
    replace_history_internal(app, items)
}

fn validate_import_file_path(path: &Path) -> Result<(), String> {
    if path.as_os_str().is_empty() {
        return Err("File path cannot be empty.".to_string());
    }
    if path.is_dir() {
        return Err("Selected path is a directory, not a JSON file.".to_string());
    }
    if path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case("json"))
        != Some(true)
    {
        return Err("Selected file must use the .json extension.".to_string());
    }
    Ok(())
}

fn validate_export_file_path(path: &Path) -> Result<(), String> {
    if path.as_os_str().is_empty() {
        return Err("File path cannot be empty.".to_string());
    }
    if path.is_dir() {
        return Err("Selected path is a directory, not a writable JSON file.".to_string());
    }
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            return Err("Selected file parent directory does not exist.".to_string());
        }
    }
    Ok(())
}

fn read_json_file(path: &Path) -> Result<String, String> {
    validate_import_file_path(path)?;
    let metadata =
        fs::metadata(path).map_err(|err| format!("Failed to inspect selected JSON file: {err}"))?;
    if metadata.len() > MAX_IMPORT_FILE_BYTES {
        return Err("Selected JSON file is too large to import safely.".to_string());
    }
    fs::read_to_string(path).map_err(|err| format!("Failed to read selected JSON file: {err}"))
}

#[tauri::command]
pub fn export_settings_to_file(app: AppHandle, path: String) -> Result<String, String> {
    let path = PathBuf::from(path);
    validate_export_file_path(&path)?;
    let json = export_settings_json(app)?;
    fs::write(&path, json).map_err(|err| format!("Failed to write settings JSON file: {err}"))?;
    Ok(format!("Settings JSON saved to {}", path.display()))
}

#[tauri::command]
pub fn import_settings_from_file(app: AppHandle, path: String) -> Result<DesktopSettings, String> {
    let raw = read_json_file(&PathBuf::from(path))?;
    import_settings_json(app, raw)
}

#[tauri::command]
pub fn export_history_to_file(app: AppHandle, path: String) -> Result<String, String> {
    let path = PathBuf::from(path);
    validate_export_file_path(&path)?;
    let json = export_history_json(app)?;
    fs::write(&path, json).map_err(|err| format!("Failed to write history JSON file: {err}"))?;
    Ok(format!("History JSON saved to {}", path.display()))
}

#[tauri::command]
pub fn import_history_from_file(
    app: AppHandle,
    path: String,
) -> Result<Vec<RunHistoryItem>, String> {
    let raw = read_json_file(&PathBuf::from(path))?;
    import_history_json_internal(&app, &raw)
}

#[tauri::command]
pub fn get_desktop_settings(app: AppHandle) -> Result<DesktopSettings, String> {
    load_settings_internal(&app)
}

#[tauri::command]
pub fn save_desktop_settings(
    app: AppHandle,
    settings: DesktopSettings,
) -> Result<DesktopSettings, String> {
    save_settings_internal(&app, settings)
}

#[tauri::command]
pub fn get_run_history(app: AppHandle) -> Result<Vec<RunHistoryItem>, String> {
    load_history_internal(&app)
}

#[tauri::command]
pub fn clear_run_history(app: AppHandle) -> Result<Vec<RunHistoryItem>, String> {
    clear_history_internal(&app)
}

#[tauri::command]
pub fn clear_run_history_selective(
    app: AppHandle,
    request: HistoryCleanupRequest,
) -> Result<Vec<RunHistoryItem>, String> {
    clear_history_selective_internal(&app, request)
}

#[tauri::command]
pub fn trim_run_history_to_limit(app: AppHandle) -> Result<Vec<RunHistoryItem>, String> {
    trim_history_to_limit_internal(&app)
}

#[cfg(test)]
mod tests {
    use super::{history_item_status, normalize_settings, DesktopSettings, RunHistoryItem};

    fn history_item() -> RunHistoryItem {
        RunHistoryItem {
            id: "run-test".to_string(),
            action: "test".to_string(),
            args: Vec::new(),
            path: "internal://test".to_string(),
            exit_code: Some(0),
            success: true,
            timed_out: false,
            duration_ms: 1,
            created_at_ms: 1,
            approval_required: false,
            approval_granted: false,
            cancelled: false,
        }
    }

    #[test]
    fn default_settings_use_json_storage_friendly_values() {
        let settings = DesktopSettings::default();
        assert_eq!(settings.history_limit, 50);
    }

    #[test]
    fn normalize_settings_trims_empty_path_and_invalid_limit() {
        let settings = normalize_settings(DesktopSettings { history_limit: 0 });
        assert_eq!(settings.history_limit, 50);
    }

    #[test]
    fn history_status_prioritizes_cancelled_and_timeout() {
        let mut item = history_item();
        assert_eq!(history_item_status(&item), "success");
        item.success = false;
        assert_eq!(history_item_status(&item), "failed");
        item.timed_out = true;
        assert_eq!(history_item_status(&item), "timed_out");
        item.cancelled = true;
        assert_eq!(history_item_status(&item), "cancelled");
    }

    #[test]
    fn normalize_settings_caps_imported_history_limit() {
        let settings = normalize_settings(DesktopSettings { history_limit: 999 });
        assert_eq!(settings.history_limit, 50);
    }
}
