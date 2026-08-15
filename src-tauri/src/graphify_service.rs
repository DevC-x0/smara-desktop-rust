use crate::app_state::now_ms;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const MAX_GRAPH_FILES: usize = 500;
const MAX_FILE_BYTES: u64 = 512 * 1024;
const MAX_NODES: usize = 2_000;
const MAX_EDGES: usize = 4_000;
const GRAPHIFY_FILE: &str = "graphify-last.json";

#[derive(Debug, Clone, Deserialize)]
pub struct BuildDesktopGraphifyRequest {
    pub workspace_root: String,
    #[serde(default)]
    pub max_files: Option<usize>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SearchDesktopGraphifyRequest {
    pub workspace_root: String,
    pub query: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DesktopGraphNode {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub path: String,
    pub weight: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DesktopGraphEdge {
    pub source: String,
    pub target: String,
    pub relation: String,
    pub evidence: String,
    pub weight: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DesktopGraphifyGraph {
    pub workspace_root: String,
    pub generated_at_ms: u128,
    pub file_count: usize,
    pub node_count: usize,
    pub edge_count: usize,
    pub nodes: Vec<DesktopGraphNode>,
    pub edges: Vec<DesktopGraphEdge>,
    pub report: String,
}

fn graphify_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Failed to resolve Desktop config directory: {error}"))?;
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Failed to create Desktop config directory: {error}"))?;
    Ok(dir.join(GRAPHIFY_FILE))
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

fn supported(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default(),
        "rs" | "ts" | "tsx" | "js" | "jsx" | "mjs" | "html" | "css" | "md" | "json" | "toml"
    )
}

fn walk(root: &Path, max_files: usize) -> Result<Vec<PathBuf>, String> {
    fn visit(
        root: &Path,
        dir: &Path,
        files: &mut Vec<PathBuf>,
        max_files: usize,
    ) -> Result<(), String> {
        if files.len() >= max_files {
            return Ok(());
        }
        let mut entries = fs::read_dir(dir)
            .map_err(|error| format!("Failed to list '{}': {error}", dir.display()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("Failed to inspect directory entry: {error}"))?;
        entries.sort_by_key(|entry| entry.file_name());
        for entry in entries {
            if files.len() >= max_files {
                break;
            }
            let path = entry.path();
            let file_type = entry
                .file_type()
                .map_err(|error| format!("Failed to inspect directory entry type: {error}"))?;
            if file_type.is_symlink() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if file_type.is_dir() {
                if matches!(name.as_str(), ".git" | "node_modules" | "target" | "dist") {
                    continue;
                }
                visit(root, &path, files, max_files)?;
            } else if file_type.is_file() && supported(&path) {
                let canonical = path
                    .canonicalize()
                    .map_err(|error| format!("Failed to resolve file path: {error}"))?;
                if canonical.starts_with(root) {
                    files.push(canonical);
                }
            }
        }
        Ok(())
    }
    let mut files = Vec::new();
    visit(root, root, &mut files, max_files)?;
    Ok(files)
}

fn node_id(kind: &str, path: &str, label: &str) -> String {
    format!("{kind}:{path}:{label}")
}

fn add_node(
    nodes: &mut BTreeMap<String, DesktopGraphNode>,
    kind: &str,
    path: &str,
    label: &str,
    weight: u32,
) -> String {
    let id = node_id(kind, path, label);
    nodes
        .entry(id.clone())
        .and_modify(|node| node.weight = node.weight.saturating_add(weight))
        .or_insert_with(|| DesktopGraphNode {
            id: id.clone(),
            label: label.to_string(),
            kind: kind.to_string(),
            path: path.to_string(),
            weight,
        });
    id
}

fn add_edge(
    edges: &mut BTreeMap<String, DesktopGraphEdge>,
    source: &str,
    target: &str,
    relation: &str,
    evidence: &str,
) {
    let key = format!("{source}->{relation}->{target}");
    edges
        .entry(key)
        .and_modify(|edge| edge.weight = edge.weight.saturating_add(1))
        .or_insert_with(|| DesktopGraphEdge {
            source: source.to_string(),
            target: target.to_string(),
            relation: relation.to_string(),
            evidence: evidence.chars().take(160).collect(),
            weight: 1,
        });
}

fn symbol_from_line(line: &str) -> Option<(&'static str, String)> {
    let trimmed = line.trim_start();
    let patterns = [
        ("function ", "function"),
        ("async function ", "function"),
        ("fn ", "function"),
        ("pub fn ", "function"),
        ("struct ", "type"),
        ("pub struct ", "type"),
        ("enum ", "type"),
        ("pub enum ", "type"),
        ("type ", "type"),
        ("class ", "type"),
        ("const ", "constant"),
    ];
    for (prefix, kind) in patterns {
        if let Some(rest) = trimmed.strip_prefix(prefix) {
            let label = rest
                .chars()
                .take_while(|ch| ch.is_alphanumeric() || *ch == '_' || *ch == '-')
                .collect::<String>();
            if !label.is_empty() {
                return Some((kind, label));
            }
        }
    }
    if let Some(rest) = trimmed.strip_prefix('#') {
        let label = rest.trim_matches('#').trim();
        if !label.is_empty() {
            return Some(("heading", label.chars().take(80).collect()));
        }
    }
    None
}

fn import_from_line(line: &str) -> Option<String> {
    let trimmed = line.trim();
    if let Some(rest) = trimmed.strip_prefix("use ") {
        return Some(
            rest.trim_end_matches(';')
                .split("::")
                .next()
                .unwrap_or(rest)
                .trim()
                .to_string(),
        );
    }
    if let Some(rest) = trimmed.strip_prefix("mod ") {
        return Some(rest.trim_end_matches(';').trim().to_string());
    }
    if trimmed.starts_with("import ") || trimmed.starts_with("export ") {
        if let Some(index) = trimmed.rfind(" from ") {
            return Some(
                trimmed[index + 6..]
                    .trim_matches(&['"', '\'', ';'][..])
                    .to_string(),
            );
        }
    }
    None
}

fn terms(text: &str) -> Vec<String> {
    let stop = HashSet::from([
        "the", "and", "for", "with", "from", "yang", "dan", "untuk", "atau", "ini", "itu", "pub",
        "let", "const", "type", "async", "function", "return", "string",
    ]);
    let mut counts = HashMap::<String, u32>::new();
    for raw in text.split(|ch: char| !ch.is_alphanumeric()) {
        let term = raw.to_ascii_lowercase();
        if term.len() >= 4 && !stop.contains(term.as_str()) {
            *counts.entry(term).or_default() += 1;
        }
    }
    let mut items = counts.into_iter().collect::<Vec<_>>();
    items.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    items.into_iter().take(8).map(|(term, _)| term).collect()
}

pub fn build_graphify_internal(
    request: BuildDesktopGraphifyRequest,
) -> Result<DesktopGraphifyGraph, String> {
    let root = workspace_root(&request.workspace_root)?;
    let max_files = request
        .max_files
        .unwrap_or(MAX_GRAPH_FILES)
        .clamp(1, MAX_GRAPH_FILES);
    let files = walk(&root, max_files)?;
    let mut nodes = BTreeMap::new();
    let mut edges = BTreeMap::new();
    let mut file_node_ids = Vec::<String>::new();

    for path in &files {
        if nodes.len() >= MAX_NODES {
            break;
        }
        let metadata =
            fs::metadata(path).map_err(|error| format!("Failed to inspect file: {error}"))?;
        if metadata.len() > MAX_FILE_BYTES {
            continue;
        }
        let relative = path
            .strip_prefix(&root)
            .unwrap_or(path)
            .to_string_lossy()
            .to_string();
        if relative
            .split(std::path::MAIN_SEPARATOR)
            .any(|part| matches!(part, "node_modules" | "target" | "dist" | ".."))
        {
            continue;
        }
        let content = fs::read_to_string(path).unwrap_or_default();
        let file_id = add_node(&mut nodes, "file", &relative, &relative, 3);
        file_node_ids.push(file_id.clone());

        for line in content.lines().take(1_500) {
            if nodes.len() >= MAX_NODES || edges.len() >= MAX_EDGES {
                break;
            }
            if let Some((kind, label)) = symbol_from_line(line) {
                let id = add_node(&mut nodes, kind, &relative, &label, 2);
                add_edge(&mut edges, &file_id, &id, "contains", line.trim());
            }
            if let Some(import) = import_from_line(line) {
                if !import.is_empty() {
                    let id = add_node(&mut nodes, "dependency", "", &import, 1);
                    add_edge(&mut edges, &file_id, &id, "imports", line.trim());
                }
            }
        }
        for term in terms(&content) {
            if nodes.len() >= MAX_NODES || edges.len() >= MAX_EDGES {
                break;
            }
            let id = add_node(&mut nodes, "concept", "", &term, 1);
            add_edge(&mut edges, &file_id, &id, "mentions", &term);
        }
    }

    let mut node_values = nodes.into_values().collect::<Vec<_>>();
    node_values.sort_by(|a, b| b.weight.cmp(&a.weight).then_with(|| a.label.cmp(&b.label)));
    let mut edge_values = edges.into_values().collect::<Vec<_>>();
    edge_values.sort_by(|a, b| {
        b.weight
            .cmp(&a.weight)
            .then_with(|| a.relation.cmp(&b.relation))
    });
    let node_count = node_values.len();
    let edge_count = edge_values.len();
    let top = node_values
        .iter()
        .take(8)
        .map(|node| node.label.clone())
        .collect::<Vec<_>>()
        .join(", ");
    let report = format!(
        "Graphify native selesai: {} file, {} node, {} edge. Node utama: {}",
        file_node_ids.len(),
        node_count,
        edge_count,
        if top.is_empty() { "-" } else { &top }
    );
    Ok(DesktopGraphifyGraph {
        workspace_root: root.display().to_string(),
        generated_at_ms: now_ms(),
        file_count: file_node_ids.len(),
        node_count,
        edge_count,
        nodes: node_values,
        edges: edge_values,
        report,
    })
}

pub fn search_graphify_internal(
    graph: &DesktopGraphifyGraph,
    query: &str,
) -> Vec<DesktopGraphNode> {
    let needle = query.trim().to_ascii_lowercase();
    if needle.is_empty() {
        return graph.nodes.iter().take(50).cloned().collect();
    }
    graph
        .nodes
        .iter()
        .filter(|node| {
            node.label.to_ascii_lowercase().contains(&needle)
                || node.kind.to_ascii_lowercase().contains(&needle)
                || node.path.to_ascii_lowercase().contains(&needle)
        })
        .take(50)
        .cloned()
        .collect()
}

#[tauri::command]
pub async fn build_desktop_graphify(
    app: AppHandle,
    request: BuildDesktopGraphifyRequest,
) -> Result<DesktopGraphifyGraph, String> {
    let path = graphify_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let graph = build_graphify_internal(request)?;
        let raw = serde_json::to_string_pretty(&graph)
            .map_err(|error| format!("Failed to serialize Graphify graph: {error}"))?;
        fs::write(&path, raw).map_err(|error| format!("Failed to save Graphify graph: {error}"))?;
        Ok(graph)
    })
    .await
    .map_err(|error| format!("Failed to wait for Graphify build: {error}"))?
}

#[tauri::command]
pub fn get_desktop_graphify(app: AppHandle) -> Result<Option<DesktopGraphifyGraph>, String> {
    let path = graphify_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read Graphify graph: {error}"))?;
    serde_json::from_str(&raw)
        .map(Some)
        .map_err(|error| format!("Failed to parse Graphify graph: {error}"))
}

#[tauri::command]
pub fn search_desktop_graphify(
    app: AppHandle,
    request: SearchDesktopGraphifyRequest,
) -> Result<Vec<DesktopGraphNode>, String> {
    let graph = get_desktop_graphify(app)?
        .ok_or_else(|| "No Graphify graph has been built yet.".to_string())?;
    let root = workspace_root(&request.workspace_root)?;
    if graph.workspace_root != root.display().to_string() {
        return Err("Saved Graphify graph belongs to a different workspace.".to_string());
    }
    Ok(search_graphify_internal(&graph, &request.query))
}

#[cfg(test)]
mod tests {
    use super::{build_graphify_internal, search_graphify_internal, BuildDesktopGraphifyRequest};
    use std::fs;

    #[test]
    fn graphify_builds_workspace_graph_without_cli() {
        let root = std::env::temp_dir().join(format!(
            "smara-graphify-{}-{}",
            std::process::id(),
            crate::app_state::now_ms()
        ));
        fs::create_dir_all(root.join("src")).unwrap();
        fs::write(
            root.join("src/lib.rs"),
            "use serde::Serialize;\npub struct MemoryStore {}\npub fn build_graph() {}\n",
        )
        .unwrap();
        fs::write(
            root.join("README.md"),
            "# Memory Graph\nGraphify connects memory and workflow concepts.",
        )
        .unwrap();

        let graph = build_graphify_internal(BuildDesktopGraphifyRequest {
            workspace_root: root.display().to_string(),
            max_files: Some(20),
        })
        .unwrap();

        assert!(graph.node_count >= 5);
        assert!(graph.edges.iter().any(|edge| edge.relation == "contains"));
        assert!(graph.edges.iter().any(|edge| edge.relation == "imports"));
        assert!(search_graphify_internal(&graph, "Memory")
            .iter()
            .any(|node| node.label.contains("Memory")));
        let _ = fs::remove_dir_all(root);
    }
}
