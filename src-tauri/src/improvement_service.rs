use crate::app_state::now_ms;
use crate::builtin_tools::list_desktop_builtin_tools_internal;
use crate::chat_service::{request_completion, DesktopChatMessage, DesktopChatSession};
use crate::memory_service::upsert_desktop_self_improvement;
use crate::provider_service::DesktopProviderConfig;
use crate::skill_service::{
    list_desktop_skills_internal, save_desktop_skill_internal, DesktopSkill,
    SaveDesktopSkillRequest,
};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const PATTERNS_FILE: &str = "auto-skill-patterns.json";
const AUTO_SKILL_THRESHOLD: u32 = 3;

#[derive(Debug, Clone)]
pub struct DesktopImprovementEvent {
    pub kind: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DesktopAutoSkillPattern {
    signature: String,
    sample_prompt: String,
    count: u32,
    skill_name: Option<String>,
    updated_at_ms: u128,
}

fn patterns_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Failed to resolve Desktop config directory: {error}"))?;
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Failed to create Desktop config directory: {error}"))?;
    Ok(dir.join(PATTERNS_FILE))
}

fn load_patterns(app: &AppHandle) -> Result<Vec<DesktopAutoSkillPattern>, String> {
    let path = patterns_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read Desktop auto-skill patterns: {error}"))?;
    serde_json::from_str(&raw)
        .map_err(|error| format!("Failed to parse Desktop auto-skill patterns: {error}"))
}

fn save_patterns(app: &AppHandle, patterns: &[DesktopAutoSkillPattern]) -> Result<(), String> {
    let raw = serde_json::to_string_pretty(patterns)
        .map_err(|error| format!("Failed to serialize Desktop auto-skill patterns: {error}"))?;
    fs::write(patterns_path(app)?, raw)
        .map_err(|error| format!("Failed to save Desktop auto-skill patterns: {error}"))
}

fn normalized_terms(text: &str) -> Vec<String> {
    const STOP: &[&str] = &[
        "a", "agar", "aja", "akan", "aku", "and", "atau", "buat", "buatkan", "dari", "di", "ini",
        "itu", "ke", "lagi", "please", "saya", "sekarang", "the", "tolong", "untuk", "yang",
    ];
    let mut terms = text
        .to_ascii_lowercase()
        .split(|character: char| !character.is_alphanumeric())
        .filter(|term| term.len() >= 3 && !STOP.contains(term))
        .map(str::to_string)
        .collect::<Vec<_>>();
    terms.sort();
    terms.dedup();
    terms.truncate(18);
    terms
}

fn signature(text: &str) -> String {
    normalized_terms(text).join("|")
}

fn contains_any(text: &str, markers: &[&str]) -> bool {
    let lower = text.to_ascii_lowercase();
    markers.iter().any(|marker| lower.contains(marker))
}

fn is_correction(text: &str) -> bool {
    contains_any(
        text,
        &[
            "mulai sekarang",
            "ingat",
            "jangan",
            "harus",
            "selalu",
            "koreksi",
            "perbaiki",
            "seharusnya",
            "salah",
            "belum bisa",
            "tidak bisa",
            "ada bug",
        ],
    )
}

fn requests_skill(text: &str) -> bool {
    contains_any(
        text,
        &[
            "buat skill",
            "buatkan skill",
            "jadikan skill",
            "simpan sebagai skill",
            "create skill",
            "auto create skill",
        ],
    )
}

fn requests_enhancement(text: &str) -> bool {
    contains_any(
        text,
        &[
            "enhance skill",
            "refine skill",
            "upgrade skill",
            "tingkatkan skill",
            "perbarui skill",
            "update skill",
        ],
    )
}

fn record_pattern(app: &AppHandle, prompt: &str) -> Result<DesktopAutoSkillPattern, String> {
    let prompt_signature = signature(prompt);
    let mut patterns = load_patterns(app)?;
    if let Some(index) = patterns
        .iter()
        .position(|pattern| pattern.signature == prompt_signature)
    {
        let mut pattern = patterns.remove(index);
        pattern.count = pattern.count.saturating_add(1);
        pattern.sample_prompt = prompt.to_string();
        pattern.updated_at_ms = now_ms();
        patterns.insert(0, pattern.clone());
        save_patterns(app, &patterns)?;
        return Ok(pattern);
    }
    let pattern = DesktopAutoSkillPattern {
        signature: prompt_signature,
        sample_prompt: prompt.to_string(),
        count: 1,
        skill_name: None,
        updated_at_ms: now_ms(),
    };
    patterns.insert(0, pattern.clone());
    patterns.truncate(500);
    save_patterns(app, &patterns)?;
    Ok(pattern)
}

fn mark_pattern_captured(app: &AppHandle, signature: &str, skill_name: &str) -> Result<(), String> {
    let mut patterns = load_patterns(app)?;
    if let Some(pattern) = patterns
        .iter_mut()
        .find(|pattern| pattern.signature == signature)
    {
        pattern.skill_name = Some(skill_name.to_string());
        pattern.updated_at_ms = now_ms();
    }
    save_patterns(app, &patterns)
}

fn skill_score(skill: &DesktopSkill, prompt: &str) -> usize {
    let prompt_terms = normalized_terms(prompt).into_iter().collect::<HashSet<_>>();
    normalized_terms(&format!(
        "{} {} {}",
        skill.name,
        skill.description,
        skill.tags.join(" ")
    ))
    .into_iter()
    .filter(|term| prompt_terms.contains(term))
    .count()
}

fn relevant_skill(app: &AppHandle, prompt: &str) -> Result<Option<DesktopSkill>, String> {
    Ok(list_desktop_skills_internal(app)?
        .into_iter()
        .map(|skill| {
            let score = skill_score(&skill, prompt);
            (skill, score)
        })
        .filter(|(_, score)| *score >= 2)
        .max_by_key(|(_, score)| *score)
        .map(|(skill, _)| skill))
}

fn extract_json_object(text: &str) -> Result<&str, String> {
    let start = text
        .find('{')
        .ok_or_else(|| "Skill generator did not return a JSON object.".to_string())?;
    let end = text
        .rfind('}')
        .filter(|end| *end > start)
        .ok_or_else(|| "Skill generator returned incomplete JSON.".to_string())?;
    Ok(&text[start..=end])
}

fn generate_skill_request(
    config: &DesktopProviderConfig,
    prompt: &str,
    response: &str,
    existing: Option<&DesktopSkill>,
) -> Result<SaveDesktopSkillRequest, String> {
    let tools = list_desktop_builtin_tools_internal()
        .into_iter()
        .map(|tool| format!("- {}: {}", tool.name, tool.description))
        .collect::<Vec<_>>()
        .join("\n");
    let task = if let Some(skill) = existing {
        format!(
            "Perbarui skill berikut berdasarkan koreksi user. Pertahankan name persis '{}'.\nExisting skill JSON:\n{}",
            skill.name,
            serde_json::to_string_pretty(skill)
                .map_err(|error| format!("Failed to serialize existing skill: {error}"))?
        )
    } else {
        "Buat skill Desktop baru yang reusable dari percakapan berhasil berikut.".to_string()
    };
    let instruction = format!(
        "{task}\n\nUser request:\n{prompt}\n\nAssistant result:\n{response}\n\nTool yang diizinkan:\n{tools}\n\nOutput HANYA satu JSON object dengan schema: {{\"name\":\"kebab-case\",\"description\":\"...\",\"tags\":[\"...\"],\"steps\":[{{\"tool\":\"nama_tool\",\"args\":{{}}}}]}}. Gunakan placeholder __PARAM__nama untuk nilai yang berubah. Jangan gunakan tool di luar daftar."
    );
    let message = DesktopChatMessage {
        id: format!("skill-generator-{}", now_ms()),
        role: "user".to_string(),
        content: instruction,
        attachments: Vec::new(),
        created_at_ms: now_ms(),
    };
    let output = request_completion(config, &[message], &[])?;
    let mut request: SaveDesktopSkillRequest = serde_json::from_str(extract_json_object(&output)?)
        .map_err(|error| format!("Skill generator returned invalid JSON: {error}"))?;
    if let Some(skill) = existing {
        request.name = skill.name.clone();
        request.tags.push("auto-enhanced".to_string());
    } else {
        request.tags.push("auto-created".to_string());
    }
    Ok(request)
}

fn save_lesson(app: &AppHandle, prompt: &str, kind: &str, summary: &str) -> Result<(), String> {
    let identity = format!("lesson-{}", signature(prompt));
    upsert_desktop_self_improvement(
        app,
        &format!("[{kind}] {summary}\nLesson: {}", prompt.trim()),
        &identity,
        vec![kind.to_string(), "desktop-chat".to_string()],
    )?;
    Ok(())
}

pub fn learn_from_desktop_chat(
    app: &AppHandle,
    config: &DesktopProviderConfig,
    session: &DesktopChatSession,
) -> Result<Vec<DesktopImprovementEvent>, String> {
    let user = session
        .messages
        .iter()
        .rev()
        .find(|message| message.role == "user")
        .map(|message| message.content.trim())
        .unwrap_or_default();
    let assistant = session
        .messages
        .iter()
        .rev()
        .find(|message| message.role == "assistant")
        .map(|message| message.content.trim())
        .unwrap_or_default();
    if user.len() < 8 || assistant.is_empty() {
        return Ok(Vec::new());
    }

    let mut events = Vec::new();
    let correction = is_correction(user);
    if correction {
        save_lesson(
            app,
            user,
            "correction",
            "Koreksi user yang harus diterapkan pada percakapan berikutnya.",
        )?;
        events.push(DesktopImprovementEvent {
            kind: "memory".to_string(),
            text: "Koreksi disimpan sebagai self-improvement memory.".to_string(),
        });
    }

    let pattern = record_pattern(app, user)?;
    let enhancement_requested = requests_enhancement(user);
    let existing = if correction || enhancement_requested {
        relevant_skill(app, user)?
    } else {
        None
    };
    let should_create = pattern.skill_name.is_none()
        && (requests_skill(user) || pattern.count >= AUTO_SKILL_THRESHOLD);
    if existing.is_none() && !should_create {
        return Ok(events);
    }

    let request = generate_skill_request(config, user, assistant, existing.as_ref())?;
    let skill = save_desktop_skill_internal(app, request)?;
    mark_pattern_captured(app, &pattern.signature, &skill.name)?;
    let action = if existing.is_some() {
        "ditingkatkan"
    } else {
        "dibuat otomatis"
    };
    save_lesson(
        app,
        user,
        if existing.is_some() {
            "skill-enhanced"
        } else {
            "skill-created"
        },
        &format!("Skill '{}' v{} {action}.", skill.name, skill.version),
    )?;
    events.push(DesktopImprovementEvent {
        kind: "skill".to_string(),
        text: format!("Skill '{}' v{} {action}.", skill.name, skill.version),
    });
    Ok(events)
}

#[cfg(test)]
mod tests {
    use super::{is_correction, requests_enhancement, requests_skill, signature, skill_score};
    use crate::skill_service::DesktopSkill;

    #[test]
    fn detects_learning_intents_and_stable_patterns() {
        assert!(is_correction("mulai sekarang jangan hapus file"));
        assert!(requests_skill("tolong buatkan skill untuk audit project"));
        assert!(requests_enhancement("enhance skill audit-rust"));
        assert_eq!(
            signature("tolong audit project rust sekarang"),
            signature("audit project rust")
        );
        let skill = DesktopSkill {
            name: "audit-rust-project".to_string(),
            description: "Audit project Rust".to_string(),
            version: 1,
            tags: vec!["rust".to_string()],
            steps: Vec::new(),
            created_at_ms: 1,
            updated_at_ms: 1,
        };
        assert!(skill_score(&skill, "perbaiki audit project rust") >= 2);
    }
}
