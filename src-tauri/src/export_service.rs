use crate::chat_service::{list_desktop_chat_sessions, DesktopChatSession};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DesktopExportResult {
    pub session_id: String,
    pub title: String,
    pub format: String,
    pub content: String,
    pub file_name: String,
}

pub fn export_chat_markdown(session: &DesktopChatSession) -> String {
    let mut out = String::new();
    out.push_str(&format!("# {}\n\n", session.title.trim()));
    out.push_str(&format!(
        "- **Workspace:** {}\n- **ID Sesi:** `{}`\n- **Jumlah Pesan:** {}\n\n---\n\n",
        session.workspace.as_deref().unwrap_or("General (default)"),
        session.id,
        session.messages.len()
    ));

    for msg in &session.messages {
        let role_label = match msg.role.as_str() {
            "user" => "👤 **User**",
            "assistant" => "🤖 **Assistant (Smara)**",
            "system" => "⚙️ **System**",
            _ => "💬 **Message**",
        };
        out.push_str(&format!("### {}\n\n", role_label));

        if !msg.processes.is_empty() {
            out.push_str("<details>\n<summary>🔍 <i>Agent Execution Trajectory (");
            out.push_str(&format!("{} steps)</i></summary>\n\n", msg.processes.len()));
            for p in &msg.processes {
                out.push_str(&format!("- `[{}]` {}\n", p.kind, p.text));
            }
            out.push_str("\n</details>\n\n");
        }

        out.push_str(&msg.content);
        out.push_str("\n\n");

        if !msg.attachments.is_empty() {
            out.push_str("**Lampiran:**\n");
            for att in &msg.attachments {
                out.push_str(&format!("- 📎 `{}` ({} bytes, {})\n", att.name, att.bytes, att.mime));
            }
            out.push_str("\n");
        }

        out.push_str("---\n\n");
    }

    out
}

pub fn export_chat_json(session: &DesktopChatSession) -> String {
    serde_json::to_string_pretty(session).unwrap_or_else(|_| "{}".to_string())
}

pub fn export_chat_html(session: &DesktopChatSession) -> String {
    let safe_title = html_escape(&session.title);
    let ws_name = html_escape(session.workspace.as_deref().unwrap_or("General"));

    let mut body_html = String::new();
    for msg in &session.messages {
        let is_user = msg.role == "user";
        let role_class = if is_user { "msg-user" } else { "msg-assistant" };
        let role_badge = if is_user { "👤 User" } else { "🤖 Smara AI" };

        body_html.push_str(&format!(
            r#"<div class="message-card {role_class}">
  <div class="message-header">
    <span class="role-badge">{role_badge}</span>
  </div>
  <div class="message-body">{}</div>"#,
            html_escape(&msg.content).replace('\n', "<br/>")
        ));

        if !msg.processes.is_empty() {
            body_html.push_str(r#"<div class="trajectory-box"><details><summary>🔍 Trajectory Steps</summary><ul>"#);
            for p in &msg.processes {
                body_html.push_str(&format!(
                    r#"<li><span class="step-kind">{}</span> {}</li>"#,
                    html_escape(&p.kind),
                    html_escape(&p.text)
                ));
            }
            body_html.push_str("</ul></details></div>");
        }

        if !msg.attachments.is_empty() {
            body_html.push_str(r#"<div class="attachments-box">"#);
            for att in &msg.attachments {
                body_html.push_str(&format!(
                    r#"<span class="attachment-pill">📎 {} ({} bytes)</span>"#,
                    html_escape(&att.name),
                    att.bytes
                ));
            }
            body_html.push_str("</div>");
        }

        body_html.push_str("</div>\n");
    }

    format!(
        r#"<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>{safe_title} - Smara Export</title>
  <style>
    :root {{
      --bg: #030703;
      --card-bg: rgba(255, 255, 255, 0.03);
      --user-bg: rgba(190, 242, 100, 0.08);
      --border: rgba(255, 255, 255, 0.1);
      --text: #F1F5F9;
      --text-muted: #94A3B8;
      --accent: #BEF264;
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 32px 16px;
    }}
    .container {{
      max-width: 860px;
      margin: 0 auto;
    }}
    .header {{
      padding-bottom: 24px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 32px;
    }}
    .header h1 {{
      font-size: 24px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 8px;
    }}
    .meta-pills {{
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }}
    .meta-pill {{
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 9999px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--border);
      color: var(--text-muted);
    }}
    .message-card {{
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 18px;
    }}
    .message-card.msg-user {{
      background: var(--user-bg);
      border-color: rgba(190, 242, 100, 0.2);
    }}
    .role-badge {{
      font-size: 12px;
      font-weight: 600;
      color: var(--accent);
      margin-bottom: 8px;
      display: inline-block;
    }}
    .message-body {{
      font-size: 14px;
      color: #E2E8F0;
      white-space: pre-wrap;
      word-break: break-word;
    }}
    .trajectory-box {{
      margin-top: 12px;
      padding: 8px 12px;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 6px;
      font-size: 12px;
      color: var(--text-muted);
    }}
    .trajectory-box summary {{
      cursor: pointer;
      color: #A3E635;
    }}
    .trajectory-box ul {{
      margin-top: 8px;
      padding-left: 16px;
    }}
    .step-kind {{
      font-family: monospace;
      color: #38BDF8;
      font-size: 11px;
    }}
    .attachments-box {{
      margin-top: 12px;
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }}
    .attachment-pill {{
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border);
    }}
    @media print {{
      body {{ background: #FFF; color: #000; }}
      .message-card {{ border: 1px solid #CCC; background: #FAFAFA; }}
      .message-card.msg-user {{ background: #F0FDF4; }}
    }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{safe_title}</h1>
      <div class="meta-pills">
        <span class="meta-pill">📁 Workspace: {ws_name}</span>
        <span class="meta-pill">💬 {count} Pesan</span>
        <span class="meta-pill">⚡ Smara Desktop</span>
      </div>
    </div>
    <div class="messages">
      {body_html}
    </div>
  </div>
</body>
</html>"#,
        safe_title = safe_title,
        ws_name = ws_name,
        count = session.messages.len(),
        body_html = body_html
    )
}

fn html_escape(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

#[tauri::command]
pub fn export_desktop_chat_session(
    app: AppHandle,
    session_id: String,
    format: String,
) -> Result<DesktopExportResult, String> {
    let sessions = list_desktop_chat_sessions(app)?;
    let session = sessions
        .into_iter()
        .find(|s| s.id == session_id)
        .ok_or_else(|| format!("Sesi chat ID {} tidak ditemukan.", session_id))?;

    let clean_title = session
        .title
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect::<String>();
    let clean_title = if clean_title.trim().is_empty() {
        "smara_chat".to_string()
    } else {
        clean_title
    };

    match format.to_lowercase().as_str() {
        "md" | "markdown" => {
            let content = export_chat_markdown(&session);
            Ok(DesktopExportResult {
                session_id: session.id,
                title: session.title,
                format: "markdown".to_string(),
                content,
                file_name: format!("{}.md", clean_title),
            })
        }
        "json" => {
            let content = export_chat_json(&session);
            Ok(DesktopExportResult {
                session_id: session.id,
                title: session.title,
                format: "json".to_string(),
                content,
                file_name: format!("{}.json", clean_title),
            })
        }
        "html" => {
            let content = export_chat_html(&session);
            Ok(DesktopExportResult {
                session_id: session.id,
                title: session.title,
                format: "html".to_string(),
                content,
                file_name: format!("{}.html", clean_title),
            })
        }
        other => Err(format!("Format ekspor tidak didukung: {}", other)),
    }
}

#[tauri::command]
pub fn save_exported_chat(path: String, content: String) -> Result<bool, String> {
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(p, content).map_err(|e| e.to_string())?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chat_service::{ChatProcessEntry, DesktopChatMessage};

    #[test]
    fn test_export_chat_markdown_and_html() {
        let session = DesktopChatSession {
            id: "session-test".to_string(),
            title: "Testing Export Sesi".to_string(),
            workspace: Some("Workspace-Lab".to_string()),
            created_at_ms: 1787000000000,
            updated_at_ms: 1787000000000,
            messages: vec![
                DesktopChatMessage {
                    id: "msg-1".to_string(),
                    role: "user".to_string(),
                    content: "Halo Smara".to_string(),
                    attachments: vec![],
                    processes: vec![],
                    created_at_ms: 1787000000000,
                },
                DesktopChatMessage {
                    id: "msg-2".to_string(),
                    role: "assistant".to_string(),
                    content: "Halo! Ada yang bisa saya bantu?".to_string(),
                    attachments: vec![],
                    processes: vec![ChatProcessEntry {
                        kind: "thinking".to_string(),
                        text: "Memproses salam".to_string(),
                        created_at: 1787000000000,
                    }],
                    created_at_ms: 1787000000000,
                },
            ],
            memory_context_count: 0,
        };

        let md = export_chat_markdown(&session);
        assert!(md.contains("# Testing Export Sesi"));
        assert!(md.contains("Halo Smara"));
        assert!(md.contains("Memproses salam"));

        let json_str = export_chat_json(&session);
        assert!(json_str.contains("Testing Export Sesi"));

        let html_str = export_chat_html(&session);
        assert!(html_str.contains("Testing Export Sesi - Smara Export"));
        assert!(html_str.contains("Halo Smara"));
        assert!(html_str.contains("Memproses salam"));
    }
}
