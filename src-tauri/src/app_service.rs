use serde::Serialize;
use std::time::Instant;
use tauri::State;

pub struct DesktopRuntimeState {
    started_at: Instant,
}

impl Default for DesktopRuntimeState {
    fn default() -> Self {
        Self {
            started_at: Instant::now(),
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct DesktopCapability {
    pub id: &'static str,
    pub label: &'static str,
    pub backend: &'static str,
    pub ready: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct DesktopRuntimeStatus {
    pub ready: bool,
    pub mode: &'static str,
    pub version: &'static str,
    pub uptime_ms: u128,
    pub native_ready: usize,
    pub migration_total: usize,
    pub capabilities: Vec<DesktopCapability>,
}

fn capabilities() -> Vec<DesktopCapability> {
    vec![
        DesktopCapability {
            id: "runtime",
            label: "Application runtime",
            backend: "rust",
            ready: true,
        },
        DesktopCapability {
            id: "settings",
            label: "Desktop settings",
            backend: "rust",
            ready: true,
        },
        DesktopCapability {
            id: "history",
            label: "Run history",
            backend: "rust",
            ready: true,
        },
        DesktopCapability {
            id: "approval",
            label: "Approval policy",
            backend: "rust",
            ready: true,
        },
        DesktopCapability {
            id: "workspace",
            label: "Workspace state",
            backend: "rust",
            ready: true,
        },
        DesktopCapability {
            id: "builtin-tools",
            label: "Built-in workspace tools",
            backend: "rust",
            ready: true,
        },
        DesktopCapability {
            id: "chat",
            label: "Chat sessions and provider completion",
            backend: "rust",
            ready: true,
        },
        DesktopCapability {
            id: "memory",
            label: "Local memory store",
            backend: "rust",
            ready: true,
        },
        DesktopCapability {
            id: "skills",
            label: "Reusable approval-gated skills",
            backend: "rust",
            ready: true,
        },
        DesktopCapability {
            id: "workflow",
            label: "Approval-gated workflows",
            backend: "rust",
            ready: true,
        },
        DesktopCapability {
            id: "mcp",
            label: "MCP stdio client",
            backend: "rust",
            ready: true,
        },
        DesktopCapability {
            id: "graphify",
            label: "Local knowledge graph",
            backend: "rust",
            ready: true,
        },
        DesktopCapability {
            id: "media",
            label: "Local media library",
            backend: "rust",
            ready: true,
        },
        DesktopCapability {
            id: "provider",
            label: "Provider config and health",
            backend: "rust",
            ready: true,
        },
    ]
}

fn runtime_status(state: &DesktopRuntimeState) -> DesktopRuntimeStatus {
    let capabilities = capabilities();
    let native_ready = capabilities
        .iter()
        .filter(|capability| capability.ready)
        .count();

    DesktopRuntimeStatus {
        ready: true,
        mode: "rust-native",
        version: env!("CARGO_PKG_VERSION"),
        uptime_ms: state.started_at.elapsed().as_millis(),
        native_ready,
        migration_total: capabilities.len(),
        capabilities,
    }
}

#[tauri::command]
pub fn get_desktop_runtime_status(state: State<'_, DesktopRuntimeState>) -> DesktopRuntimeStatus {
    runtime_status(&state)
}

#[cfg(test)]
mod tests {
    use super::{runtime_status, DesktopRuntimeState};

    #[test]
    fn runtime_is_ready_without_cli_or_web_backend() {
        let status = runtime_status(&DesktopRuntimeState::default());

        assert!(status.ready);
        assert_eq!(status.mode, "rust-native");
        assert_eq!(status.native_ready, status.migration_total);
        assert!(status
            .capabilities
            .iter()
            .any(|capability| capability.id == "settings" && capability.ready));
        assert!(status
            .capabilities
            .iter()
            .any(|capability| capability.id == "builtin-tools"
                && capability.backend == "rust"
                && capability.ready));
        assert!(status
            .capabilities
            .iter()
            .any(|capability| capability.id == "chat" && capability.ready));
        assert!(status
            .capabilities
            .iter()
            .any(|capability| capability.id == "memory" && capability.ready));
        assert!(status
            .capabilities
            .iter()
            .any(|capability| capability.id == "skills" && capability.ready));
        assert!(status
            .capabilities
            .iter()
            .any(|capability| capability.id == "workflow" && capability.ready));
        assert!(status
            .capabilities
            .iter()
            .any(|capability| capability.id == "mcp" && capability.ready));
        assert!(status
            .capabilities
            .iter()
            .any(|capability| capability.id == "graphify" && capability.ready));
        assert!(status
            .capabilities
            .iter()
            .any(|capability| capability.id == "media" && capability.ready));
        assert!(status
            .capabilities
            .iter()
            .all(|capability| capability.backend == "rust" && capability.ready));
    }
}
