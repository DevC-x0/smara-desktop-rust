use crate::app_state::now_ms;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const MEDIA_FILE: &str = "media-library.json";
const MEDIA_DIR: &str = "media";
const MAX_MEDIA_ITEMS: usize = 1_000;
const MAX_MEDIA_BYTES: u64 = 250 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DesktopMediaAsset {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub file_name: String,
    pub mime: String,
    pub source_path: String,
    pub stored_path: String,
    pub bytes: u64,
    pub checksum: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub created_at_ms: u128,
    pub updated_at_ms: u128,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ImportDesktopMediaRequest {
    pub path: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default = "default_copy_to_library")]
    pub copy_to_library: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SearchDesktopMediaRequest {
    pub query: String,
}

fn default_copy_to_library() -> bool {
    true
}

fn media_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Failed to resolve Desktop config directory: {error}"))?;
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Failed to create Desktop config directory: {error}"))?;
    Ok(dir.join(MEDIA_FILE))
}

fn media_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Failed to resolve Desktop config directory: {error}"))?
        .join(MEDIA_DIR);
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Failed to create Desktop media directory: {error}"))?;
    Ok(dir)
}

fn load_media_from(path: &Path) -> Result<Vec<DesktopMediaAsset>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read media library: {error}"))?;
    serde_json::from_str(&raw).map_err(|error| format!("Failed to parse media library: {error}"))
}

fn save_media_to(path: &Path, media: &[DesktopMediaAsset]) -> Result<(), String> {
    let raw = serde_json::to_string_pretty(media)
        .map_err(|error| format!("Failed to serialize media library: {error}"))?;
    fs::write(path, raw).map_err(|error| format!("Failed to save media library: {error}"))
}

fn normalize_tags(tags: Vec<String>) -> Vec<String> {
    let mut tags = tags
        .into_iter()
        .map(|tag| tag.trim().to_ascii_lowercase())
        .filter(|tag| !tag.is_empty())
        .collect::<Vec<_>>();
    tags.sort();
    tags.dedup();
    tags.truncate(30);
    tags
}

fn classify(extension: &str) -> Option<(&'static str, &'static str)> {
    match extension.to_ascii_lowercase().as_str() {
        "png" => Some(("image", "image/png")),
        "jpg" | "jpeg" => Some(("image", "image/jpeg")),
        "gif" => Some(("image", "image/gif")),
        "webp" => Some(("image", "image/webp")),
        "svg" => Some(("image", "image/svg+xml")),
        "wav" => Some(("audio", "audio/wav")),
        "mp3" => Some(("audio", "audio/mpeg")),
        "m4a" => Some(("audio", "audio/mp4")),
        "ogg" => Some(("audio", "audio/ogg")),
        "flac" => Some(("audio", "audio/flac")),
        "mp4" => Some(("video", "video/mp4")),
        "webm" => Some(("video", "video/webm")),
        "mov" => Some(("video", "video/quicktime")),
        "pdf" => Some(("document", "application/pdf")),
        "txt" => Some(("document", "text/plain")),
        "md" => Some(("document", "text/markdown")),
        _ => None,
    }
}

fn checksum(path: &Path) -> Result<String, String> {
    let bytes =
        fs::read(path).map_err(|error| format!("Failed to read media for checksum: {error}"))?;
    let mut hash = 0xcbf29ce484222325u64;
    for byte in bytes {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    Ok(format!("{hash:016x}"))
}

fn import_media_at(
    library_path: &Path,
    library_dir: &Path,
    request: ImportDesktopMediaRequest,
) -> Result<DesktopMediaAsset, String> {
    let source = PathBuf::from(request.path.trim());
    if source.as_os_str().is_empty() || !source.is_absolute() {
        return Err("Media path must be an absolute path.".to_string());
    }
    let source = source
        .canonicalize()
        .map_err(|error| format!("Failed to resolve media path: {error}"))?;
    let metadata =
        fs::metadata(&source).map_err(|error| format!("Failed to inspect media file: {error}"))?;
    if !metadata.is_file() {
        return Err("Selected media path is not a file.".to_string());
    }
    if metadata.len() > MAX_MEDIA_BYTES {
        return Err(format!(
            "Media file exceeds the Desktop limit of {MAX_MEDIA_BYTES} bytes."
        ));
    }
    let file_name = source
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Media file name is not valid UTF-8.".to_string())?
        .to_string();
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    let (kind, mime) = classify(extension)
        .ok_or_else(|| format!("Unsupported media extension '.{extension}'."))?;
    let mut items = load_media_from(library_path)?;
    if items.len() >= MAX_MEDIA_ITEMS {
        return Err(format!("Desktop media limit of {MAX_MEDIA_ITEMS} reached."));
    }
    let timestamp = now_ms();
    let id = format!("media-{timestamp}-{}", items.len() + 1);
    let stored_path = if request.copy_to_library {
        let target = library_dir.join(format!("{}_{}", id, file_name.replace('/', "_")));
        fs::copy(&source, &target)
            .map_err(|error| format!("Failed to copy media into Desktop library: {error}"))?;
        target
    } else {
        source.clone()
    };
    let title = if request.title.trim().is_empty() {
        file_name.clone()
    } else {
        request.title.trim().to_string()
    };
    let asset = DesktopMediaAsset {
        id,
        title,
        kind: kind.to_string(),
        file_name,
        mime: mime.to_string(),
        source_path: source.display().to_string(),
        stored_path: stored_path.display().to_string(),
        bytes: metadata.len(),
        checksum: checksum(&stored_path)?,
        tags: normalize_tags(request.tags),
        created_at_ms: timestamp,
        updated_at_ms: timestamp,
    };
    items.insert(0, asset.clone());
    save_media_to(library_path, &items)?;
    Ok(asset)
}

fn delete_media_at(library_path: &Path, id: &str) -> Result<bool, String> {
    let mut items = load_media_from(library_path)?;
    let Some(index) = items.iter().position(|item| item.id == id) else {
        return Ok(false);
    };
    let item = items.remove(index);
    if !item.stored_path.is_empty() && item.stored_path != item.source_path {
        let _ = fs::remove_file(&item.stored_path);
    }
    save_media_to(library_path, &items)?;
    Ok(true)
}

fn search_media(items: &[DesktopMediaAsset], query: &str) -> Vec<DesktopMediaAsset> {
    let needle = query.trim().to_ascii_lowercase();
    if needle.is_empty() {
        return items.iter().take(100).cloned().collect();
    }
    items
        .iter()
        .filter(|item| {
            item.title.to_ascii_lowercase().contains(&needle)
                || item.kind.to_ascii_lowercase().contains(&needle)
                || item.file_name.to_ascii_lowercase().contains(&needle)
                || item.tags.iter().any(|tag| tag.contains(&needle))
        })
        .take(100)
        .cloned()
        .collect()
}

#[tauri::command]
pub fn list_desktop_media(app: AppHandle) -> Result<Vec<DesktopMediaAsset>, String> {
    load_media_from(&media_path(&app)?)
}

#[tauri::command]
pub async fn import_desktop_media(
    app: AppHandle,
    request: ImportDesktopMediaRequest,
) -> Result<DesktopMediaAsset, String> {
    let library_path = media_path(&app)?;
    let library_dir = media_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        import_media_at(&library_path, &library_dir, request)
    })
    .await
    .map_err(|error| format!("Failed to wait for media import: {error}"))?
}

#[tauri::command]
pub fn search_desktop_media(
    app: AppHandle,
    request: SearchDesktopMediaRequest,
) -> Result<Vec<DesktopMediaAsset>, String> {
    let items = load_media_from(&media_path(&app)?)?;
    Ok(search_media(&items, &request.query))
}

#[tauri::command]
pub fn delete_desktop_media(app: AppHandle, id: String) -> Result<bool, String> {
    delete_media_at(&media_path(&app)?, &id)
}

#[cfg(test)]
mod tests {
    use super::{
        delete_media_at, import_media_at, load_media_from, search_media, ImportDesktopMediaRequest,
    };
    use std::fs;

    #[test]
    fn media_import_persists_metadata_and_copies_file() {
        let root = std::env::temp_dir().join(format!(
            "smara-media-{}-{}",
            std::process::id(),
            crate::app_state::now_ms()
        ));
        fs::create_dir_all(root.join("library")).unwrap();
        let source = root.join("voice.wav");
        fs::write(&source, b"RIFF....WAVEfmt ").unwrap();
        let library = root.join("media.json");
        let item = import_media_at(
            &library,
            &root.join("library"),
            ImportDesktopMediaRequest {
                path: source.display().to_string(),
                title: "Voice sample".to_string(),
                tags: vec!["Voice".to_string(), "voice".to_string()],
                copy_to_library: true,
            },
        )
        .unwrap();

        assert_eq!(item.kind, "audio");
        assert_eq!(item.tags, vec!["voice"]);
        assert!(std::path::Path::new(&item.stored_path).exists());
        assert_eq!(load_media_from(&library).unwrap().len(), 1);
        assert_eq!(
            search_media(&load_media_from(&library).unwrap(), "voice").len(),
            1
        );
        assert!(delete_media_at(&library, &item.id).unwrap());
        assert!(!std::path::Path::new(&item.stored_path).exists());
        let _ = fs::remove_dir_all(root);
    }
}
