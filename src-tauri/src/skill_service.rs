use crate::app_state::now_ms;
use crate::builtin_tools::{
    list_desktop_builtin_tools_internal, run_desktop_builtin_tool_internal,
    DesktopBuiltinToolRequest, DesktopBuiltinToolResult, DesktopToolApproval,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const SKILLS_FILE: &str = "skills.json";
const MAX_SKILLS: usize = 500;
const MAX_STEPS: usize = 50;
const APPROVAL_MAX_AGE_MS: u128 = 5 * 60 * 1000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DesktopSkillStep {
    pub tool: String,
    #[serde(default)]
    pub args: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DesktopSkill {
    pub name: String,
    pub description: String,
    pub version: u32,
    #[serde(default)]
    pub tags: Vec<String>,
    pub steps: Vec<DesktopSkillStep>,
    pub created_at_ms: u128,
    pub updated_at_ms: u128,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SaveDesktopSkillRequest {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub steps: Vec<DesktopSkillStep>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RunDesktopSkillRequest {
    pub name: String,
    pub workspace_root: String,
    #[serde(default)]
    pub params: HashMap<String, Value>,
    pub approval: Option<DesktopSkillApproval>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DesktopSkillApproval {
    pub skill_name: String,
    pub workspace_root: String,
    pub approved: bool,
    pub approved_at_ms: u128,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct DesktopSkillPreviewStep {
    pub index: usize,
    pub tool: String,
    pub args: Value,
    pub risk_level: String,
    pub requires_approval: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct DesktopSkillPreview {
    pub skill_name: String,
    pub workspace_root: String,
    pub requires_approval: bool,
    pub mutation_count: usize,
    pub steps: Vec<DesktopSkillPreviewStep>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct DesktopSkillRunResult {
    pub skill_name: String,
    pub success: bool,
    pub outputs: Vec<DesktopBuiltinToolResult>,
    pub summary: String,
}

fn skills_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Failed to resolve Desktop config directory: {error}"))?;
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Failed to create Desktop config directory: {error}"))?;
    Ok(dir.join(SKILLS_FILE))
}

fn load_skills_from(path: &Path) -> Result<Vec<DesktopSkill>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read Desktop skills: {error}"))?;
    serde_json::from_str(&raw).map_err(|error| format!("Failed to parse Desktop skills: {error}"))
}

fn save_skills_to(path: &Path, skills: &[DesktopSkill]) -> Result<(), String> {
    let raw = serde_json::to_string_pretty(skills)
        .map_err(|error| format!("Failed to serialize Desktop skills: {error}"))?;
    fs::write(path, raw).map_err(|error| format!("Failed to save Desktop skills: {error}"))
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

fn validate_request(request: &SaveDesktopSkillRequest) -> Result<(), String> {
    let name = request.name.trim();
    if name.is_empty() {
        return Err("Skill name cannot be empty.".to_string());
    }
    if name.chars().count() > 80 {
        return Err("Skill name cannot exceed 80 characters.".to_string());
    }
    if request.steps.is_empty() {
        return Err("Skill must contain at least one step.".to_string());
    }
    if request.steps.len() > MAX_STEPS {
        return Err(format!("Skill cannot exceed {MAX_STEPS} steps."));
    }
    let tools = list_desktop_builtin_tools_internal();
    for (index, step) in request.steps.iter().enumerate() {
        if !tools.iter().any(|tool| tool.name == step.tool.trim()) {
            return Err(format!(
                "Skill step {} uses unsupported tool '{}'.",
                index + 1,
                step.tool
            ));
        }
        if !step.args.is_object() {
            return Err(format!(
                "Skill step {} args must be a JSON object.",
                index + 1
            ));
        }
    }
    Ok(())
}

fn save_skill_at(path: &Path, request: SaveDesktopSkillRequest) -> Result<DesktopSkill, String> {
    validate_request(&request)?;
    let mut skills = load_skills_from(path)?;
    let name = request.name.trim().to_string();
    let existing = skills.iter().position(|skill| skill.name == name);
    if existing.is_none() && skills.len() >= MAX_SKILLS {
        return Err(format!("Desktop skill limit of {MAX_SKILLS} reached."));
    }
    let timestamp = now_ms();
    let previous = existing.map(|index| skills.remove(index));
    let skill = DesktopSkill {
        name,
        description: request.description.trim().to_string(),
        version: previous.as_ref().map_or(1, |skill| skill.version + 1),
        tags: normalize_tags(request.tags),
        steps: request
            .steps
            .into_iter()
            .map(|step| DesktopSkillStep {
                tool: step.tool.trim().to_string(),
                args: step.args,
            })
            .collect(),
        created_at_ms: previous
            .as_ref()
            .map_or(timestamp, |skill| skill.created_at_ms),
        updated_at_ms: timestamp,
    };
    skills.insert(0, skill.clone());
    save_skills_to(path, &skills)?;
    Ok(skill)
}

pub(crate) fn list_desktop_skills_internal(app: &AppHandle) -> Result<Vec<DesktopSkill>, String> {
    load_skills_from(&skills_path(app)?)
}

pub(crate) fn save_desktop_skill_internal(
    app: &AppHandle,
    request: SaveDesktopSkillRequest,
) -> Result<DesktopSkill, String> {
    save_skill_at(&skills_path(app)?, request)
}

fn delete_skill_at(path: &Path, name: &str) -> Result<bool, String> {
    let mut skills = load_skills_from(path)?;
    let before = skills.len();
    skills.retain(|skill| skill.name != name);
    if skills.len() == before {
        return Ok(false);
    }
    save_skills_to(path, &skills)?;
    Ok(true)
}

fn substitute_params(value: Value, params: &HashMap<String, Value>) -> Value {
    match value {
        Value::String(mut text) => {
            for (name, value) in params {
                let replacement = value
                    .as_str()
                    .map(str::to_string)
                    .unwrap_or_else(|| value.to_string());
                text = text.replace(&format!("__PARAM__{name}"), &replacement);
            }
            Value::String(text)
        }
        Value::Array(items) => Value::Array(
            items
                .into_iter()
                .map(|item| substitute_params(item, params))
                .collect(),
        ),
        Value::Object(items) => Value::Object(
            items
                .into_iter()
                .map(|(key, value)| (key, substitute_params(value, params)))
                .collect(),
        ),
        value => value,
    }
}

fn preview_skill_at(
    path: &Path,
    request: &RunDesktopSkillRequest,
) -> Result<DesktopSkillPreview, String> {
    let skill = load_skills_from(path)?
        .into_iter()
        .find(|skill| skill.name == request.name)
        .ok_or_else(|| format!("Desktop skill '{}' was not found.", request.name))?;
    let tools = list_desktop_builtin_tools_internal();
    let steps = skill
        .steps
        .into_iter()
        .enumerate()
        .map(|(index, step)| {
            let tool = tools
                .iter()
                .find(|tool| tool.name == step.tool)
                .ok_or_else(|| format!("Unsupported Desktop built-in tool '{}'.", step.tool))?;
            Ok(DesktopSkillPreviewStep {
                index: index + 1,
                tool: step.tool,
                args: substitute_params(step.args, &request.params),
                risk_level: tool.risk_level.to_string(),
                requires_approval: tool.requires_approval,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    let mutation_count = steps.iter().filter(|step| step.requires_approval).count();
    Ok(DesktopSkillPreview {
        skill_name: request.name.clone(),
        workspace_root: request.workspace_root.clone(),
        requires_approval: mutation_count > 0,
        mutation_count,
        steps,
    })
}

fn validate_skill_approval<'a>(
    request: &'a RunDesktopSkillRequest,
    requires_approval: bool,
) -> Result<Option<&'a DesktopSkillApproval>, String> {
    if !requires_approval {
        return Ok(None);
    }
    let approval = request
        .approval
        .as_ref()
        .ok_or_else(|| format!("Skill '{}' requires explicit approval.", request.name))?;
    if !approval.approved {
        return Err("Skill approval has approved=false.".to_string());
    }
    if approval.skill_name.trim() != request.name {
        return Err("Skill approval does not match the requested skill.".to_string());
    }
    if approval.workspace_root.trim() != request.workspace_root.trim() {
        return Err("Skill approval does not match the requested workspace.".to_string());
    }
    if approval.summary.trim().is_empty() {
        return Err("Skill approval summary cannot be empty.".to_string());
    }
    let current = now_ms();
    if approval.approved_at_ms > current.saturating_add(30_000) {
        return Err("Skill approval timestamp is in the future.".to_string());
    }
    if current.saturating_sub(approval.approved_at_ms) > APPROVAL_MAX_AGE_MS {
        return Err("Skill approval is too old.".to_string());
    }
    Ok(Some(approval))
}

fn run_skill_at(
    path: &Path,
    request: RunDesktopSkillRequest,
) -> Result<DesktopSkillRunResult, String> {
    let preview = preview_skill_at(path, &request)?;
    let approval = validate_skill_approval(&request, preview.requires_approval)?;
    let mut outputs = Vec::with_capacity(preview.steps.len());
    for step in preview.steps {
        let tool_approval = if step.requires_approval {
            approval.map(|approval| DesktopToolApproval {
                action: step.tool.clone(),
                approved: true,
                approved_at_ms: approval.approved_at_ms,
                summary: approval.summary.clone(),
            })
        } else {
            None
        };
        let result = run_desktop_builtin_tool_internal(DesktopBuiltinToolRequest {
            tool: step.tool.clone(),
            workspace_root: request.workspace_root.clone(),
            args: step.args,
            approval: tool_approval,
        })
        .map_err(|error| {
            format!(
                "Skill '{}' failed at step {} ({}): {error}",
                request.name, step.index, step.tool
            )
        })?;
        outputs.push(result);
    }
    Ok(DesktopSkillRunResult {
        skill_name: request.name,
        success: true,
        summary: format!(
            "Completed {} Desktop skill step(s), including {} workspace mutation(s).",
            outputs.len(),
            outputs.iter().filter(|output| output.mutated).count()
        ),
        outputs,
    })
}

#[tauri::command]
pub fn list_desktop_skills(app: AppHandle) -> Result<Vec<DesktopSkill>, String> {
    load_skills_from(&skills_path(&app)?)
}

#[tauri::command]
pub fn save_desktop_skill(
    app: AppHandle,
    request: SaveDesktopSkillRequest,
) -> Result<DesktopSkill, String> {
    save_skill_at(&skills_path(&app)?, request)
}

#[tauri::command]
pub fn delete_desktop_skill(app: AppHandle, name: String) -> Result<bool, String> {
    delete_skill_at(&skills_path(&app)?, &name)
}

#[tauri::command]
pub fn preview_desktop_skill(
    app: AppHandle,
    request: RunDesktopSkillRequest,
) -> Result<DesktopSkillPreview, String> {
    preview_skill_at(&skills_path(&app)?, &request)
}

#[tauri::command]
pub async fn run_desktop_skill(
    app: AppHandle,
    request: RunDesktopSkillRequest,
) -> Result<DesktopSkillRunResult, String> {
    let path = skills_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || run_skill_at(&path, request))
        .await
        .map_err(|error| format!("Failed to wait for Desktop skill: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::{
        delete_skill_at, load_skills_from, preview_skill_at, run_skill_at, save_skill_at,
        DesktopSkillApproval, DesktopSkillStep, RunDesktopSkillRequest, SaveDesktopSkillRequest,
    };
    use crate::app_state::now_ms;
    use serde_json::json;
    use std::collections::HashMap;
    use std::fs;

    #[test]
    fn real_skill_workflow_persists_substitutes_and_runs_read_only_tools() {
        let root = std::env::temp_dir().join(format!(
            "smara-desktop-skill-{}-{}",
            std::process::id(),
            now_ms()
        ));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("notes.txt"), "desktop skill marker").unwrap();
        let path = root.join("skills.json");
        let skill = save_skill_at(
            &path,
            SaveDesktopSkillRequest {
                name: "inspect project".to_string(),
                description: "Search project safely".to_string(),
                tags: vec!["Desktop".to_string(), "desktop".to_string()],
                steps: vec![
                    DesktopSkillStep {
                        tool: "grep_search".to_string(),
                        args: json!({"query": "__PARAM__query"}),
                    },
                    DesktopSkillStep {
                        tool: "analyze_workspace".to_string(),
                        args: json!({"depth": 2}),
                    },
                ],
            },
        )
        .unwrap();
        assert_eq!(skill.version, 1);
        assert_eq!(skill.tags, vec!["desktop"]);
        let result = run_skill_at(
            &path,
            RunDesktopSkillRequest {
                name: skill.name.clone(),
                workspace_root: root.display().to_string(),
                params: HashMap::from([("query".to_string(), json!("skill marker"))]),
                approval: None,
            },
        )
        .unwrap();
        assert!(result.success);
        assert_eq!(result.outputs.len(), 2);
        assert!(result.outputs[0].output.contains("notes.txt"));
        assert!(delete_skill_at(&path, &skill.name).unwrap());
        assert!(load_skills_from(&path).unwrap().is_empty());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn mutating_skills_require_fresh_bound_approval() {
        let root = std::env::temp_dir().join(format!(
            "smara-desktop-skill-blocked-{}-{}",
            std::process::id(),
            now_ms()
        ));
        fs::create_dir_all(&root).unwrap();
        let skill = save_skill_at(
            &root.join("skills.json"),
            SaveDesktopSkillRequest {
                name: "unsafe".to_string(),
                description: String::new(),
                tags: Vec::new(),
                steps: vec![DesktopSkillStep {
                    tool: "write_file".to_string(),
                    args: json!({"path": "unsafe.txt", "content": "blocked"}),
                }],
            },
        )
        .unwrap();
        let request = RunDesktopSkillRequest {
            name: skill.name.clone(),
            workspace_root: root.display().to_string(),
            params: HashMap::new(),
            approval: None,
        };
        let preview = preview_skill_at(&root.join("skills.json"), &request).unwrap();
        assert!(preview.requires_approval);
        assert_eq!(preview.mutation_count, 1);
        assert!(run_skill_at(&root.join("skills.json"), request).is_err());
        assert!(!root.join("unsafe.txt").exists());
        let result = run_skill_at(
            &root.join("skills.json"),
            RunDesktopSkillRequest {
                name: skill.name.clone(),
                workspace_root: root.display().to_string(),
                params: HashMap::new(),
                approval: Some(DesktopSkillApproval {
                    skill_name: skill.name,
                    workspace_root: root.display().to_string(),
                    approved: true,
                    approved_at_ms: now_ms(),
                    summary: "Approved mutation integration test".to_string(),
                }),
            },
        )
        .unwrap();
        assert_eq!(result.outputs.len(), 1);
        assert!(result.outputs[0].mutated);
        assert!(root.join("unsafe.txt").exists());
        let _ = fs::remove_dir_all(root);
    }
}
