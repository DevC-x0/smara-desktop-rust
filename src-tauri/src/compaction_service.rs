use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CompactionStats {
    pub original_chars: usize,
    pub compacted_chars: usize,
    pub pruned_tool_outputs: usize,
    pub saved_ratio_percent: u32,
    pub is_compacted: bool,
}

impl CompactionStats {
    pub fn no_compaction(chars: usize) -> Self {
        Self {
            original_chars: chars,
            compacted_chars: chars,
            pruned_tool_outputs: 0,
            saved_ratio_percent: 0,
            is_compacted: false,
        }
    }
}

/// Prunes a verbose tool observation or action block from an older turn to retain only essential status
pub fn prune_verbose_tool_output(content: &str, max_snippet_chars: usize) -> (String, bool) {
    if content.len() <= max_snippet_chars {
        return (content.to_string(), false);
    }

    let lines: Vec<&str> = content.lines().collect();
    if lines.len() <= 6 {
        let head = crate::app_state::safe_truncate_str(content, max_snippet_chars / 2);
        let tail_start = content.len().saturating_sub(max_snippet_chars / 2);
        let mut tail_idx = tail_start;
        while !content.is_char_boundary(tail_idx) && tail_idx < content.len() {
            tail_idx += 1;
        }
        let tail = &content[tail_idx..];
        let pruned = format!(
            "{}\n\n... [Output pruned: {} bytes compacted for context efficiency] ...\n\n{}",
            head.trim_end(),
            content.len().saturating_sub(max_snippet_chars),
            tail.trim_start()
        );
        return (pruned, true);
    }

    let head_lines = &lines[..lines.len().min(3)];
    let tail_lines = &lines[lines.len().saturating_sub(2)..];

    let head_text = head_lines.join("\n");
    let tail_text = tail_lines.join("\n");
    let pruned_lines_count = lines.len().saturating_sub(5);

    let pruned = format!(
        "{}\n... [Output pruned: {} lines ({} bytes) compacted for context efficiency] ...\n{}",
        head_text,
        pruned_lines_count,
        content.len().saturating_sub(head_text.len() + tail_text.len()),
        tail_text
    );

    (pruned, true)
}

/// Compacts a list of OpenAI/Anthropic format message values by pruning verbose older tool outputs and summarizing ancient turns
pub fn compact_chat_context(messages: &[Value], max_allowed_chars: usize) -> (Vec<Value>, CompactionStats) {
    let original_total_chars: usize = messages
        .iter()
        .map(|m| {
            m.get("content")
                .and_then(Value::as_str)
                .map(|s| s.len())
                .unwrap_or(0)
        })
        .sum();

    if messages.len() <= 3 || original_total_chars <= max_allowed_chars {
        return (messages.to_vec(), CompactionStats::no_compaction(original_total_chars));
    }

    let mut compacted_messages = Vec::with_capacity(messages.len());
    let mut pruned_count = 0;
    let total_len = messages.len();
    // Keep the system prompt (index 0) and the last 4 turns untouched
    let untouched_tail_start = total_len.saturating_sub(4);

    for (idx, msg) in messages.iter().enumerate() {
        if idx == 0 || idx >= untouched_tail_start {
            compacted_messages.push(msg.clone());
            continue;
        }

        let role = msg.get("role").and_then(Value::as_str).unwrap_or_default();
        let content_str = msg.get("content").and_then(Value::as_str).unwrap_or_default();

        let is_tool_obs = role == "tool"
            || (role == "user" && content_str.starts_with("[System Tool Observation"));
        let is_action_block = role == "assistant"
            && (content_str.contains("```action") || content_str.contains("\"tool\":"));

        if (is_tool_obs || is_action_block) && content_str.len() > 250 {
            let (pruned_text, was_pruned) = prune_verbose_tool_output(content_str, 250);
            if was_pruned {
                pruned_count += 1;
                let mut new_msg = msg.clone();
                if let Some(obj) = new_msg.as_object_mut() {
                    obj.insert("content".to_string(), Value::String(pruned_text));
                }
                compacted_messages.push(new_msg);
                continue;
            }
        }

        compacted_messages.push(msg.clone());
    }

    let new_total_chars: usize = compacted_messages
        .iter()
        .map(|m| {
            m.get("content")
                .and_then(Value::as_str)
                .map(|s| s.len())
                .unwrap_or(0)
        })
        .sum();

    let saved_chars = original_total_chars.saturating_sub(new_total_chars);
    let saved_ratio = if original_total_chars > 0 {
        ((saved_chars as f64 / original_total_chars as f64) * 100.0) as u32
    } else {
        0
    };

    let is_compacted = pruned_count > 0 && saved_chars > 0;

    let stats = CompactionStats {
        original_chars: original_total_chars,
        compacted_chars: new_total_chars,
        pruned_tool_outputs: pruned_count,
        saved_ratio_percent: saved_ratio,
        is_compacted,
    };

    (compacted_messages, stats)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_prune_verbose_tool_output() {
        let long_output = "Line 1: Compiling smara-desktop\nLine 2: building target\nLine 3: checking crates\nLine 4: finished\nLine 5: finished\nLine 6: finished\nLine 7: test ok\nLine 8: exit 0";
        let (pruned, was_pruned) = prune_verbose_tool_output(long_output, 40);
        assert!(was_pruned);
        assert!(pruned.contains("Output pruned"));
        assert!(pruned.contains("Line 1:"));
        assert!(pruned.contains("Line 8: exit 0"));
    }

    #[test]
    fn test_compact_chat_context_preserves_recent_turns() {
        let messages = vec![
            json!({ "role": "system", "content": "System prompt" }),
            json!({
                "role": "user",
                "content": "[System Tool Observation - Result of `run_command`]:\n".to_string() + &"A".repeat(1000)
            }),
            json!({ "role": "assistant", "content": "Old turn explanation" }),
            json!({ "role": "user", "content": "Recent question 1" }),
            json!({ "role": "assistant", "content": "Recent answer 1" }),
            json!({
                "role": "user",
                "content": "[System Tool Observation - Result of `run_command`]:\n".to_string() + &"B".repeat(1000)
            }),
            json!({ "role": "assistant", "content": "Recent final answer" }),
        ];

        let (compacted, stats) = compact_chat_context(&messages, 500);
        assert!(stats.is_compacted);
        assert_eq!(stats.pruned_tool_outputs, 1);
        assert!(stats.saved_ratio_percent > 0);

        // Turn 1 (old tool observation) should be pruned
        let turn1_content = compacted[1]["content"].as_str().unwrap();
        assert!(turn1_content.contains("Output pruned"));

        // Turn 5 (recent tool observation in tail) should be preserved untouched
        let turn5_content = compacted[5]["content"].as_str().unwrap();
        assert_eq!(turn5_content.len(), 1000 + "[System Tool Observation - Result of `run_command`]:\n".len());
    }
}
