# Smara Desktop Rust Backend Boundary

## Current Boundary

Smara Desktop and Smara CLI are separate products.

Smara Desktop:

- does not discover or execute a Smara CLI binary;
- does not start or stop a Go web backend;
- does not connect to port `8080`;
- owns its Tauri commands, settings, history, workspace state, provider health,
  approvals, built-in workspace tools, Chat sessions, local Memory, and
  reusable Skills, approval-gated Workflows, MCP stdio servers/tools, and
  Graphify workspace knowledge graphs, and local Media APIs.

The previous transitional adapters `cli_bridge.rs` and `web_backend.rs` have
been removed.

## Future Native Work

Features not currently available in Desktop must be implemented directly in
Rust/Tauri. They must not be restored through a CLI or Go-web compatibility
bridge.

Candidate future modules:

1. None currently tracked in this document.

Each new module requires Rust tests, frontend integration tests, and native IPC
smoke coverage.
