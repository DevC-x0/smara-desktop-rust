use crate::app_state::now_ms;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const MEMORY_FILE: &str = "memories.json";
const MAX_MEMORY_ITEMS: usize = 10_000;
const MAX_CONTENT_CHARS: usize = 20_000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DesktopMemory {
    pub id: String,
    pub content: String,
    pub tags: Vec<String>,
    pub created_at_ms: u128,
    pub updated_at_ms: u128,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct DesktopMemorySearchResult {
    pub memory: DesktopMemory,
    pub score: f64,
    pub matched_terms: Vec<String>,
    pub match_kind: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateMemoryRequest {
    pub content: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateMemoryRequest {
    pub id: String,
    pub content: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

fn normalize_tags(tags: Vec<String>) -> Vec<String> {
    let mut tags = tags
        .into_iter()
        .map(|tag| tag.trim().to_ascii_lowercase())
        .filter(|tag| !tag.is_empty())
        .collect::<Vec<_>>();
    tags.sort();
    tags.dedup();
    tags.truncate(20);
    tags
}

fn validate_content(content: &str) -> Result<String, String> {
    let content = content.trim();
    if content.is_empty() {
        return Err("Memory content cannot be empty.".to_string());
    }
    if content.chars().count() > MAX_CONTENT_CHARS {
        return Err(format!(
            "Memory content exceeds {MAX_CONTENT_CHARS} characters."
        ));
    }
    Ok(content.to_string())
}

fn memory_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Failed to resolve Desktop config directory: {error}"))?;
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Failed to create Desktop config directory: {error}"))?;
    Ok(dir.join(MEMORY_FILE))
}

fn load_memories_from(path: &Path) -> Result<Vec<DesktopMemory>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read Desktop memories: {error}"))?;
    serde_json::from_str(&raw).map_err(|error| format!("Failed to parse Desktop memories: {error}"))
}

fn save_memories_to(path: &Path, memories: &[DesktopMemory]) -> Result<(), String> {
    let raw = serde_json::to_string_pretty(memories)
        .map_err(|error| format!("Failed to serialize Desktop memories: {error}"))?;
    fs::write(path, raw).map_err(|error| format!("Failed to save Desktop memories: {error}"))
}

fn create_memory_at(path: &Path, request: CreateMemoryRequest) -> Result<DesktopMemory, String> {
    let mut memories = load_memories_from(path)?;
    if memories.len() >= MAX_MEMORY_ITEMS {
        return Err(format!(
            "Desktop memory limit of {MAX_MEMORY_ITEMS} items reached."
        ));
    }
    let timestamp = now_ms();
    let memory = DesktopMemory {
        id: format!("memory-{timestamp}-{}", memories.len() + 1),
        content: validate_content(&request.content)?,
        tags: normalize_tags(request.tags),
        created_at_ms: timestamp,
        updated_at_ms: timestamp,
    };
    memories.insert(0, memory.clone());
    save_memories_to(path, &memories)?;
    Ok(memory)
}

fn upsert_tagged_memory_at(
    path: &Path,
    content: &str,
    tags: Vec<String>,
    identity_tag: &str,
) -> Result<DesktopMemory, String> {
    let mut memories = load_memories_from(path)?;
    let normalized_tags = normalize_tags(tags);
    let timestamp = now_ms();
    if let Some(index) = memories
        .iter()
        .position(|memory| memory.tags.iter().any(|tag| tag == identity_tag))
    {
        let mut memory = memories.remove(index);
        memory.content = validate_content(content)?;
        memory.tags = normalized_tags;
        memory.updated_at_ms = timestamp;
        memories.insert(0, memory.clone());
        save_memories_to(path, &memories)?;
        return Ok(memory);
    }
    if memories.len() >= MAX_MEMORY_ITEMS {
        return Err(format!(
            "Desktop memory limit of {MAX_MEMORY_ITEMS} items reached."
        ));
    }
    let memory = DesktopMemory {
        id: format!("memory-{timestamp}-{}", memories.len() + 1),
        content: validate_content(content)?,
        tags: normalized_tags,
        created_at_ms: timestamp,
        updated_at_ms: timestamp,
    };
    memories.insert(0, memory.clone());
    save_memories_to(path, &memories)?;
    Ok(memory)
}

pub(crate) fn upsert_desktop_self_improvement(
    app: &AppHandle,
    content: &str,
    identity_tag: &str,
    mut tags: Vec<String>,
) -> Result<DesktopMemory, String> {
    tags.extend([
        "self-improvement".to_string(),
        "auto-apply".to_string(),
        identity_tag.to_string(),
    ]);
    upsert_tagged_memory_at(&memory_path(app)?, content, tags, identity_tag)
}

fn update_memory_at(path: &Path, request: UpdateMemoryRequest) -> Result<DesktopMemory, String> {
    let mut memories = load_memories_from(path)?;
    let index = memories
        .iter()
        .position(|memory| memory.id == request.id)
        .ok_or_else(|| format!("Desktop memory '{}' was not found.", request.id))?;
    let mut memory = memories.remove(index);
    memory.content = validate_content(&request.content)?;
    memory.tags = normalize_tags(request.tags);
    memory.updated_at_ms = now_ms();
    memories.insert(0, memory.clone());
    save_memories_to(path, &memories)?;
    Ok(memory)
}

fn canonical_term(term: &str) -> String {
    match term {
        "db" | "database" | "databases" | "store" | "stored" | "storage" | "penyimpanan"
        | "simpan" | "tersimpan" => "storage".to_string(),
        "bug" | "bugs" | "error" | "errors" | "issue" | "issues" | "masalah" => {
            "problem".to_string()
        }
        "chat" | "conversation" | "conversations" | "percakapan" => "chat".to_string(),
        "skill" | "skills" | "automation" | "otomasi" => "automation".to_string(),
        "memory" | "memories" | "ingatan" => "memory".to_string(),
        "project" | "projects" | "proyek" => "project".to_string(),
        "file" | "files" | "berkas" => "file".to_string(),
        "delete" | "deleted" | "remove" | "removed" | "hapus" | "dihapus" => "delete".to_string(),
        "edit" | "edited" | "update" | "updated" | "ubah" | "perbarui" => "update".to_string(),
        _ => {
            let mut value = term.to_string();
            for suffix in ["ing", "ed", "es", "s", "kan", "nya"] {
                if value.len() > suffix.len() + 3 && value.ends_with(suffix) {
                    value.truncate(value.len() - suffix.len());
                    break;
                }
            }
            value
        }
    }
}

fn terms(text: &str) -> Vec<String> {
    const STOP_WORDS: &[&str] = &[
        "a", "an", "and", "apa", "are", "atau", "dari", "di", "does", "for", "how", "ini", "is",
        "itu", "ke", "of", "on", "the", "to", "untuk", "what", "where", "yang",
    ];
    text.to_ascii_lowercase()
        .split(|character: char| !character.is_alphanumeric())
        .filter(|term| term.chars().count() >= 2 && !STOP_WORDS.contains(term))
        .map(canonical_term)
        .collect()
}

fn add_feature(features: &mut HashMap<String, f64>, feature: String, weight: f64) {
    *features.entry(feature).or_insert(0.0) += weight;
}

fn add_term_features(features: &mut HashMap<String, f64>, term: &str, weight: f64) {
    add_feature(features, format!("term:{term}"), weight);
    let chars = term.chars().collect::<Vec<_>>();
    if chars.len() >= 3 {
        for window in chars.windows(3) {
            add_feature(
                features,
                format!("tri:{}", window.iter().collect::<String>()),
                weight * 0.12,
            );
        }
    }
}

fn query_features(query: &str) -> HashMap<String, f64> {
    let mut features = HashMap::new();
    for term in terms(query) {
        add_term_features(&mut features, &term, 1.0);
    }
    features
}

fn memory_features(memory: &DesktopMemory) -> HashMap<String, f64> {
    let mut features = HashMap::new();
    for term in terms(&memory.content) {
        add_term_features(&mut features, &term, 1.0);
    }
    for tag in &memory.tags {
        for term in terms(tag) {
            add_term_features(&mut features, &term, 2.4);
        }
    }
    features
}

fn cosine_similarity(left: &HashMap<String, f64>, right: &HashMap<String, f64>) -> f64 {
    let dot = left
        .iter()
        .map(|(key, value)| value * right.get(key).copied().unwrap_or_default())
        .sum::<f64>();
    let left_norm = left.values().map(|value| value * value).sum::<f64>().sqrt();
    let right_norm = right
        .values()
        .map(|value| value * value)
        .sum::<f64>()
        .sqrt();
    if left_norm == 0.0 || right_norm == 0.0 {
        0.0
    } else {
        dot / (left_norm * right_norm)
    }
}

fn rank_memories(
    memories: Vec<DesktopMemory>,
    query: &str,
    limit: usize,
) -> Vec<DesktopMemorySearchResult> {
    let normalized_query = query.trim().to_ascii_lowercase();
    if normalized_query.is_empty() {
        return memories
            .into_iter()
            .take(limit)
            .map(|memory| DesktopMemorySearchResult {
                memory,
                score: 1.0,
                matched_terms: Vec::new(),
                match_kind: "recent".to_string(),
            })
            .collect();
    }
    let query_terms = terms(query);
    let unique_query_terms = query_terms.iter().cloned().collect::<HashSet<_>>();
    let features = query_features(query);
    let mut results = memories
        .into_iter()
        .filter_map(|memory| {
            let content = memory.content.to_ascii_lowercase();
            let exact_phrase = content.contains(&normalized_query)
                || memory
                    .tags
                    .iter()
                    .any(|tag| tag.contains(&normalized_query));
            let memory_terms = terms(&format!("{} {}", memory.content, memory.tags.join(" ")))
                .into_iter()
                .collect::<HashSet<_>>();
            let mut matched_terms = unique_query_terms
                .intersection(&memory_terms)
                .cloned()
                .collect::<Vec<_>>();
            matched_terms.sort();
            let semantic_score = cosine_similarity(&features, &memory_features(&memory));
            let coverage = if unique_query_terms.is_empty() {
                0.0
            } else {
                matched_terms.len() as f64 / unique_query_terms.len() as f64
            };
            let exact_boost = if exact_phrase { 0.1 } else { 0.0 };
            let score = (semantic_score * 0.68 + coverage * 0.22 + exact_boost).min(1.0);
            (score >= 0.08).then_some(DesktopMemorySearchResult {
                memory,
                score,
                matched_terms,
                match_kind: if exact_phrase {
                    "exact".to_string()
                } else if coverage > 0.0 {
                    "semantic".to_string()
                } else {
                    "fuzzy".to_string()
                },
            })
        })
        .collect::<Vec<_>>();
    results.sort_by(|left, right| {
        right
            .score
            .total_cmp(&left.score)
            .then_with(|| right.memory.updated_at_ms.cmp(&left.memory.updated_at_ms))
    });
    results.truncate(limit);
    results
}

fn search_memories_ranked_at(
    path: &Path,
    query: &str,
    limit: usize,
) -> Result<Vec<DesktopMemorySearchResult>, String> {
    let memories = load_memories_from(path)?;
    Ok(rank_memories(memories, query, limit))
}

fn search_memories_at(path: &Path, query: &str) -> Result<Vec<DesktopMemory>, String> {
    Ok(search_memories_ranked_at(path, query, 100)?
        .into_iter()
        .map(|result| result.memory)
        .collect())
}

fn relevant_memories_at(
    path: &Path,
    query: &str,
    limit: usize,
) -> Result<Vec<DesktopMemory>, String> {
    if query.trim().is_empty() || limit == 0 {
        return Ok(Vec::new());
    }
    Ok(search_memories_ranked_at(path, query, limit)?
        .into_iter()
        .map(|result| result.memory)
        .collect())
}

pub(crate) fn relevant_memories(
    app: &AppHandle,
    query: &str,
    limit: usize,
) -> Result<Vec<DesktopMemory>, String> {
    relevant_memories_at(&memory_path(app)?, query, limit)
}

fn delete_memory_at(path: &Path, id: &str) -> Result<bool, String> {
    let mut memories = load_memories_from(path)?;
    let before = memories.len();
    memories.retain(|memory| memory.id != id);
    if memories.len() == before {
        return Ok(false);
    }
    save_memories_to(path, &memories)?;
    Ok(true)
}

#[tauri::command]
pub fn list_desktop_memories(app: AppHandle) -> Result<Vec<DesktopMemory>, String> {
    load_memories_from(&memory_path(&app)?)
}

#[tauri::command]
pub fn create_desktop_memory(
    app: AppHandle,
    request: CreateMemoryRequest,
) -> Result<DesktopMemory, String> {
    create_memory_at(&memory_path(&app)?, request)
}

#[tauri::command]
pub fn update_desktop_memory(
    app: AppHandle,
    request: UpdateMemoryRequest,
) -> Result<DesktopMemory, String> {
    update_memory_at(&memory_path(&app)?, request)
}

#[tauri::command]
pub fn search_desktop_memories(
    app: AppHandle,
    query: String,
) -> Result<Vec<DesktopMemory>, String> {
    search_memories_at(&memory_path(&app)?, &query)
}

#[tauri::command]
pub fn search_desktop_memories_ranked(
    app: AppHandle,
    query: String,
) -> Result<Vec<DesktopMemorySearchResult>, String> {
    search_memories_ranked_at(&memory_path(&app)?, &query, 100)
}

#[tauri::command]
pub fn delete_desktop_memory(app: AppHandle, id: String) -> Result<bool, String> {
    delete_memory_at(&memory_path(&app)?, &id)
}

#[cfg(test)]
mod tests {
    use super::{
        create_memory_at, delete_memory_at, relevant_memories_at, search_memories_at,
        search_memories_ranked_at, update_memory_at, CreateMemoryRequest, UpdateMemoryRequest,
    };
    use crate::app_state::now_ms;
    use std::fs;

    #[test]
    fn real_memory_workflow_persists_searches_and_deletes() {
        let root = std::env::temp_dir().join(format!(
            "smara-desktop-memory-{}-{}",
            std::process::id(),
            now_ms()
        ));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("memories.json");

        let memory = create_memory_at(
            &path,
            CreateMemoryRequest {
                content: "Project Alpha uses Rust native chat".to_string(),
                tags: vec![
                    "Project".to_string(),
                    "rust".to_string(),
                    "project".to_string(),
                ],
            },
        )
        .unwrap();
        let results = search_memories_at(&path, "rust").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].tags, vec!["project", "rust"]);
        let relevant = relevant_memories_at(&path, "What does Project Alpha use?", 5).unwrap();
        assert_eq!(relevant.len(), 1);
        assert_eq!(relevant[0].id, memory.id);
        let updated = update_memory_at(
            &path,
            UpdateMemoryRequest {
                id: memory.id.clone(),
                content: "Project Alpha database uses updated native memory".to_string(),
                tags: vec!["updated".to_string()],
            },
        )
        .unwrap();
        assert_eq!(updated.id, memory.id);
        assert_eq!(updated.created_at_ms, memory.created_at_ms);
        assert!(updated.updated_at_ms >= memory.updated_at_ms);
        assert_eq!(search_memories_at(&path, "updated").unwrap().len(), 1);
        create_memory_at(
            &path,
            CreateMemoryRequest {
                content: "Cooking notes for weekend dinner".to_string(),
                tags: vec!["food".to_string()],
            },
        )
        .unwrap();
        let semantic = search_memories_ranked_at(&path, "where is project data stored", 5).unwrap();
        assert_eq!(semantic[0].memory.id, memory.id);
        assert!(semantic[0].score > 0.08);
        let fuzzy = search_memories_ranked_at(&path, "projec alpha", 5).unwrap();
        assert_eq!(fuzzy[0].memory.id, memory.id);
        assert!(fuzzy[0].match_kind == "semantic" || fuzzy[0].match_kind == "fuzzy");
        assert!(delete_memory_at(&path, &memory.id).unwrap());
        assert_eq!(search_memories_at(&path, "").unwrap().len(), 1);
        let _ = fs::remove_dir_all(root);
    }
}
