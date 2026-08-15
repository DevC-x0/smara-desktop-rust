use crate::app_state::now_ms;
use crate::builtin_tools::{
    list_desktop_builtin_tools_internal, run_desktop_builtin_tool_internal,
    DesktopBuiltinToolRequest, DesktopToolApproval,
};
use crate::mcp_service::{call_mcp_tool_at, mcp_servers_path, CallDesktopMcpToolRequest};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::thread;
use tauri::{AppHandle, Manager};

const WORKFLOWS_FILE: &str = "workflows.json";
const MAX_WORKFLOWS: usize = 500;
const MAX_STEPS: usize = 50;
const APPROVAL_MAX_AGE_MS: u128 = 5 * 60 * 1000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DesktopWorkflowStep {
    pub kind: String,
    pub target: String,
    #[serde(default)]
    pub server_name: Option<String>,
    #[serde(default)]
    pub args: Value,
    #[serde(default)]
    pub run_if: Option<String>,
    #[serde(default)]
    pub parallel_group: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DesktopWorkflow {
    pub name: String,
    pub description: String,
    pub version: u32,
    pub steps: Vec<DesktopWorkflowStep>,
    pub created_at_ms: u128,
    pub updated_at_ms: u128,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SaveDesktopWorkflowRequest {
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub steps: Vec<DesktopWorkflowStep>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DesktopWorkflowApproval {
    pub workflow_name: String,
    pub workspace_root: String,
    pub approved: bool,
    pub approved_at_ms: u128,
    pub summary: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RunDesktopWorkflowRequest {
    pub name: String,
    pub workspace_root: String,
    #[serde(default)]
    pub params: HashMap<String, Value>,
    pub approval: Option<DesktopWorkflowApproval>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct DesktopWorkflowPreviewStep {
    pub index: usize,
    pub kind: String,
    pub target: String,
    pub server_name: Option<String>,
    pub args: Value,
    pub risk_level: String,
    pub requires_approval: bool,
    pub skipped: bool,
    pub parallel_group: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct DesktopWorkflowPreview {
    pub workflow_name: String,
    pub workspace_root: String,
    pub requires_approval: bool,
    pub risky_step_count: usize,
    pub steps: Vec<DesktopWorkflowPreviewStep>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct DesktopWorkflowStepResult {
    pub index: usize,
    pub kind: String,
    pub target: String,
    pub output: String,
    pub mutated: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct DesktopWorkflowRunResult {
    pub workflow_name: String,
    pub success: bool,
    pub outputs: Vec<DesktopWorkflowStepResult>,
    pub summary: String,
}

fn workflows_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Failed to resolve Desktop config directory: {error}"))?;
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Failed to create Desktop config directory: {error}"))?;
    Ok(dir.join(WORKFLOWS_FILE))
}

fn load_workflows_from(path: &Path) -> Result<Vec<DesktopWorkflow>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw =
        fs::read_to_string(path).map_err(|error| format!("Failed to read workflows: {error}"))?;
    serde_json::from_str(&raw).map_err(|error| format!("Failed to parse workflows: {error}"))
}

fn save_workflows_to(path: &Path, workflows: &[DesktopWorkflow]) -> Result<(), String> {
    let raw = serde_json::to_string_pretty(workflows)
        .map_err(|error| format!("Failed to serialize workflows: {error}"))?;
    fs::write(path, raw).map_err(|error| format!("Failed to save workflows: {error}"))
}

fn validate_request(request: &SaveDesktopWorkflowRequest) -> Result<(), String> {
    if request.name.trim().is_empty() || request.name.chars().count() > 80 {
        return Err("Workflow name must contain 1-80 characters.".to_string());
    }
    if request.steps.is_empty() || request.steps.len() > MAX_STEPS {
        return Err(format!("Workflow must contain 1-{MAX_STEPS} steps."));
    }
    let tools = list_desktop_builtin_tools_internal();
    for (index, step) in request.steps.iter().enumerate() {
        if !step.args.is_object() {
            return Err(format!(
                "Workflow step {} args must be a JSON object.",
                index + 1
            ));
        }
        match step.kind.trim() {
            "builtin" if tools.iter().any(|tool| tool.name == step.target.trim()) => {}
            "mcp"
                if step
                    .server_name
                    .as_deref()
                    .unwrap_or_default()
                    .trim()
                    .is_empty() =>
            {
                return Err(format!(
                    "Workflow MCP step {} requires server_name.",
                    index + 1
                ));
            }
            "mcp" if !step.target.trim().is_empty() => {}
            "builtin" => {
                return Err(format!(
                    "Workflow step {} uses unsupported built-in tool '{}'.",
                    index + 1,
                    step.target
                ))
            }
            _ => {
                return Err(format!(
                    "Workflow step {} kind must be 'builtin' or 'mcp'.",
                    index + 1
                ))
            }
        }
    }
    Ok(())
}

fn save_workflow_at(
    path: &Path,
    request: SaveDesktopWorkflowRequest,
) -> Result<DesktopWorkflow, String> {
    validate_request(&request)?;
    let mut workflows = load_workflows_from(path)?;
    let name = request.name.trim().to_string();
    let existing = workflows.iter().position(|workflow| workflow.name == name);
    if existing.is_none() && workflows.len() >= MAX_WORKFLOWS {
        return Err(format!(
            "Desktop workflow limit of {MAX_WORKFLOWS} reached."
        ));
    }
    let timestamp = now_ms();
    let previous = existing.map(|index| workflows.remove(index));
    let workflow = DesktopWorkflow {
        name,
        description: request.description.trim().to_string(),
        version: previous.as_ref().map_or(1, |workflow| workflow.version + 1),
        steps: request
            .steps
            .into_iter()
            .map(|step| DesktopWorkflowStep {
                kind: step.kind.trim().to_string(),
                target: step.target.trim().to_string(),
                server_name: step.server_name.map(|name| name.trim().to_string()),
                args: step.args,
                run_if: step
                    .run_if
                    .map(|condition| condition.trim().to_string())
                    .filter(|condition| !condition.is_empty()),
                parallel_group: step
                    .parallel_group
                    .map(|group| group.trim().to_string())
                    .filter(|group| !group.is_empty()),
            })
            .collect(),
        created_at_ms: previous
            .as_ref()
            .map_or(timestamp, |workflow| workflow.created_at_ms),
        updated_at_ms: timestamp,
    };
    workflows.insert(0, workflow.clone());
    save_workflows_to(path, &workflows)?;
    Ok(workflow)
}

fn condition_is_true(condition: Option<&str>, params: &HashMap<String, Value>) -> bool {
    let Some(condition) = condition
        .map(str::trim)
        .filter(|condition| !condition.is_empty())
    else {
        return true;
    };
    let Some(value) = params.get(condition) else {
        return false;
    };
    match value {
        Value::Bool(value) => *value,
        Value::Number(value) => value.as_i64().map(|value| value != 0).unwrap_or(true),
        Value::String(value) => {
            let value = value.trim().to_ascii_lowercase();
            !value.is_empty() && !matches!(value.as_str(), "false" | "0" | "no" | "off")
        }
        Value::Null => false,
        Value::Array(value) => !value.is_empty(),
        Value::Object(value) => !value.is_empty(),
    }
}

fn delete_workflow_at(path: &Path, name: &str) -> Result<bool, String> {
    let mut workflows = load_workflows_from(path)?;
    let before = workflows.len();
    workflows.retain(|workflow| workflow.name != name);
    if before == workflows.len() {
        return Ok(false);
    }
    save_workflows_to(path, &workflows)?;
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

fn preview_workflow_at(
    path: &Path,
    request: &RunDesktopWorkflowRequest,
) -> Result<DesktopWorkflowPreview, String> {
    let workflow = load_workflows_from(path)?
        .into_iter()
        .find(|workflow| workflow.name == request.name)
        .ok_or_else(|| format!("Desktop workflow '{}' was not found.", request.name))?;
    let tools = list_desktop_builtin_tools_internal();
    let steps = workflow
        .steps
        .into_iter()
        .enumerate()
        .map(|(index, step)| {
            let (risk_level, requires_approval) = if step.kind == "mcp" {
                ("external-mcp".to_string(), true)
            } else {
                let tool = tools
                    .iter()
                    .find(|tool| tool.name == step.target)
                    .ok_or_else(|| {
                        format!("Unsupported Desktop built-in tool '{}'.", step.target)
                    })?;
                (tool.risk_level.to_string(), tool.requires_approval)
            };
            Ok(DesktopWorkflowPreviewStep {
                index: index + 1,
                kind: step.kind,
                target: step.target,
                server_name: step.server_name,
                args: substitute_params(step.args, &request.params),
                risk_level,
                requires_approval,
                skipped: !condition_is_true(step.run_if.as_deref(), &request.params),
                parallel_group: step.parallel_group,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    let risky_step_count = steps
        .iter()
        .filter(|step| !step.skipped && step.requires_approval)
        .count();
    Ok(DesktopWorkflowPreview {
        workflow_name: request.name.clone(),
        workspace_root: request.workspace_root.clone(),
        requires_approval: risky_step_count > 0,
        risky_step_count,
        steps,
    })
}

fn run_preview_step(
    request_name: &str,
    workspace_root: &str,
    mcp_path: &Path,
    step: DesktopWorkflowPreviewStep,
    approval: Option<DesktopWorkflowApproval>,
) -> Result<DesktopWorkflowStepResult, String> {
    if step.skipped {
        return Ok(DesktopWorkflowStepResult {
            index: step.index,
            kind: step.kind,
            target: step.target,
            output: "Skipped by run_if condition.".to_string(),
            mutated: false,
        });
    }
    let (output, mutated) = if step.kind == "builtin" {
        let tool_approval = step.requires_approval.then(|| {
            let approval = approval.as_ref().expect("approval validated");
            DesktopToolApproval {
                action: step.target.clone(),
                approved: true,
                approved_at_ms: approval.approved_at_ms,
                summary: approval.summary.clone(),
            }
        });
        let result = run_desktop_builtin_tool_internal(DesktopBuiltinToolRequest {
            tool: step.target.clone(),
            workspace_root: workspace_root.to_string(),
            args: step.args,
            approval: tool_approval,
        })?;
        (result.output, result.mutated)
    } else {
        let result = call_mcp_tool_at(
            mcp_path,
            CallDesktopMcpToolRequest {
                server_name: step.server_name.clone().unwrap_or_default(),
                tool: step.target.clone(),
                arguments: step.args,
            },
        )?;
        if result.is_error {
            return Err(format!(
                "Workflow '{}' failed at MCP step {} ({}): {}",
                request_name, step.index, step.target, result.content
            ));
        }
        (
            serde_json::to_string_pretty(&result.content)
                .unwrap_or_else(|_| result.content.to_string()),
            true,
        )
    };
    Ok(DesktopWorkflowStepResult {
        index: step.index,
        kind: step.kind,
        target: step.target,
        output,
        mutated,
    })
}

fn validate_approval<'a>(
    request: &'a RunDesktopWorkflowRequest,
    required: bool,
) -> Result<Option<&'a DesktopWorkflowApproval>, String> {
    if !required {
        return Ok(None);
    }
    let approval = request
        .approval
        .as_ref()
        .ok_or_else(|| format!("Workflow '{}' requires explicit approval.", request.name))?;
    if !approval.approved
        || approval.workflow_name.trim() != request.name
        || approval.workspace_root.trim() != request.workspace_root.trim()
        || approval.summary.trim().is_empty()
    {
        return Err("Workflow approval receipt does not match this run.".to_string());
    }
    let current = now_ms();
    if approval.approved_at_ms > current.saturating_add(30_000)
        || current.saturating_sub(approval.approved_at_ms) > APPROVAL_MAX_AGE_MS
    {
        return Err("Workflow approval receipt is expired or invalid.".to_string());
    }
    Ok(Some(approval))
}

fn run_workflow_at(
    workflow_path: &Path,
    mcp_path: &Path,
    request: RunDesktopWorkflowRequest,
) -> Result<DesktopWorkflowRunResult, String> {
    let preview = preview_workflow_at(workflow_path, &request)?;
    let approval = validate_approval(&request, preview.requires_approval)?.cloned();
    let mut outputs = Vec::with_capacity(preview.steps.len());
    let mut steps = preview.steps.into_iter().peekable();
    while let Some(step) = steps.next() {
        let group = step
            .parallel_group
            .clone()
            .filter(|group| !group.is_empty());
        if let Some(group) = group {
            let mut grouped = vec![step];
            while steps.peek().and_then(|step| step.parallel_group.as_deref())
                == Some(group.as_str())
            {
                grouped.push(steps.next().expect("peeked step"));
            }
            let mut handles = Vec::with_capacity(grouped.len());
            for step in grouped {
                let request_name = request.name.clone();
                let workspace_root = request.workspace_root.clone();
                let mcp_path = mcp_path.to_path_buf();
                let approval = approval.clone();
                handles.push(thread::spawn(move || {
                    run_preview_step(&request_name, &workspace_root, &mcp_path, step, approval)
                }));
            }
            for handle in handles {
                outputs.push(
                    handle
                        .join()
                        .map_err(|_| "Workflow parallel step panicked.".to_string())??,
                );
            }
        } else {
            outputs.push(run_preview_step(
                &request.name,
                &request.workspace_root,
                mcp_path,
                step,
                approval.clone(),
            )?);
        }
    }
    outputs.sort_by_key(|output| output.index);
    Ok(DesktopWorkflowRunResult {
        workflow_name: request.name,
        success: true,
        summary: format!(
            "Completed {} Desktop workflow step(s), including {} skipped step(s).",
            outputs.len(),
            outputs
                .iter()
                .filter(|output| output.output.contains("Skipped by run_if"))
                .count()
        ),
        outputs,
    })
}

#[tauri::command]
pub fn list_desktop_workflows(app: AppHandle) -> Result<Vec<DesktopWorkflow>, String> {
    load_workflows_from(&workflows_path(&app)?)
}

#[tauri::command]
pub fn save_desktop_workflow(
    app: AppHandle,
    request: SaveDesktopWorkflowRequest,
) -> Result<DesktopWorkflow, String> {
    save_workflow_at(&workflows_path(&app)?, request)
}

#[tauri::command]
pub fn delete_desktop_workflow(app: AppHandle, name: String) -> Result<bool, String> {
    delete_workflow_at(&workflows_path(&app)?, &name)
}

#[tauri::command]
pub fn preview_desktop_workflow(
    app: AppHandle,
    request: RunDesktopWorkflowRequest,
) -> Result<DesktopWorkflowPreview, String> {
    preview_workflow_at(&workflows_path(&app)?, &request)
}

#[tauri::command]
pub async fn run_desktop_workflow(
    app: AppHandle,
    request: RunDesktopWorkflowRequest,
) -> Result<DesktopWorkflowRunResult, String> {
    let workflow_path = workflows_path(&app)?;
    let mcp_path = mcp_servers_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        run_workflow_at(&workflow_path, &mcp_path, request)
    })
    .await
    .map_err(|error| format!("Failed to wait for Desktop workflow: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::{
        delete_workflow_at, load_workflows_from, preview_workflow_at, run_workflow_at,
        save_workflow_at, DesktopWorkflowStep, RunDesktopWorkflowRequest,
        SaveDesktopWorkflowRequest,
    };
    use serde_json::json;
    use std::collections::HashMap;

    #[test]
    fn read_only_workflow_persists_previews_and_runs() {
        let root = std::env::temp_dir().join(format!(
            "smara-workflow-{}-{}",
            std::process::id(),
            crate::app_state::now_ms()
        ));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("marker.txt"), "workflow marker").unwrap();
        let path = root.join("workflows.json");
        let workflow = save_workflow_at(
            &path,
            SaveDesktopWorkflowRequest {
                name: "inspect".to_string(),
                description: String::new(),
                steps: vec![DesktopWorkflowStep {
                    kind: "builtin".to_string(),
                    target: "grep_search".to_string(),
                    server_name: None,
                    args: json!({"query":"__PARAM__query"}),
                    run_if: None,
                    parallel_group: None,
                }],
            },
        )
        .unwrap();
        let request = RunDesktopWorkflowRequest {
            name: workflow.name.clone(),
            workspace_root: root.display().to_string(),
            params: HashMap::from([("query".to_string(), json!("workflow marker"))]),
            approval: None,
        };
        assert!(
            !preview_workflow_at(&path, &request)
                .unwrap()
                .requires_approval
        );
        assert!(run_workflow_at(&path, &root.join("mcp.json"), request)
            .unwrap()
            .outputs[0]
            .output
            .contains("marker.txt"));
        assert!(delete_workflow_at(&path, &workflow.name).unwrap());
        assert!(load_workflows_from(&path).unwrap().is_empty());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn workflow_supports_run_if_branching_and_parallel_groups() {
        let root = std::env::temp_dir().join(format!(
            "smara-workflow-branch-{}-{}",
            std::process::id(),
            crate::app_state::now_ms()
        ));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("alpha.txt"), "alpha branch").unwrap();
        std::fs::write(root.join("beta.txt"), "beta branch").unwrap();
        let path = root.join("workflows.json");
        let workflow = save_workflow_at(
            &path,
            SaveDesktopWorkflowRequest {
                name: "branch parallel".to_string(),
                description: String::new(),
                steps: vec![
                    DesktopWorkflowStep {
                        kind: "builtin".to_string(),
                        target: "grep_search".to_string(),
                        server_name: None,
                        args: json!({"query":"alpha"}),
                        run_if: Some("run_searches".to_string()),
                        parallel_group: Some("searches".to_string()),
                    },
                    DesktopWorkflowStep {
                        kind: "builtin".to_string(),
                        target: "grep_search".to_string(),
                        server_name: None,
                        args: json!({"query":"beta"}),
                        run_if: Some("run_searches".to_string()),
                        parallel_group: Some("searches".to_string()),
                    },
                    DesktopWorkflowStep {
                        kind: "builtin".to_string(),
                        target: "planning_template".to_string(),
                        server_name: None,
                        args: json!({"goal":"Skipped branch"}),
                        run_if: Some("write_plan".to_string()),
                        parallel_group: None,
                    },
                ],
            },
        )
        .unwrap();
        let request = RunDesktopWorkflowRequest {
            name: workflow.name,
            workspace_root: root.display().to_string(),
            params: HashMap::from([
                ("run_searches".to_string(), json!(true)),
                ("write_plan".to_string(), json!(false)),
            ]),
            approval: None,
        };
        let preview = preview_workflow_at(&path, &request).unwrap();
        assert_eq!(
            preview
                .steps
                .iter()
                .filter(|step| step.parallel_group.as_deref() == Some("searches"))
                .count(),
            2
        );
        assert_eq!(preview.steps.iter().filter(|step| step.skipped).count(), 1);
        let result = run_workflow_at(&path, &root.join("mcp.json"), request).unwrap();
        assert!(result
            .outputs
            .iter()
            .any(|output| output.output.contains("alpha.txt")));
        assert!(result
            .outputs
            .iter()
            .any(|output| output.output.contains("beta.txt")));
        assert!(result
            .outputs
            .iter()
            .any(|output| output.output.contains("Skipped by run_if")));
        let _ = std::fs::remove_dir_all(root);
    }
}
