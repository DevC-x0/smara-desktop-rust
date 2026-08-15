# Smara Desktop Rust

Standalone native desktop application built with Rust, Tauri v2, Vite, and
TypeScript.

Smara Desktop owns its runtime, settings, history, approvals, workspaces,
provider health checks, and built-in workspace tools. It does not discover,
execute, start, stop, or connect to Smara CLI or the old Go web backend.

## Native Capabilities

- Rust/Tauri application runtime
- Desktop settings and run history
- Approval policy
- Workspace state
- Provider configuration and health
- Rust-native streaming Chat sessions with direct OpenAI-compatible or
  Anthropic-native provider requests, relevant local Memory context, and
  session deletion, cancellation, and retry
- Local persistent Memory with create, edit, list, hybrid semantic-like ranking,
  and delete
- Persistent reusable Skills with preview and fresh explicit approval for
  workspace mutations
- Persistent Workflows that sequence built-in and MCP tools, substitute runtime
  parameters, branch with `run_if`, run adjacent `parallel_group` steps
  concurrently, preview risk, and require fresh approval for risky steps
- MCP stdio JSON-RPC client with local server configuration, health/tool
  discovery, process pooling, and request timeout
- Local Graphify knowledge graph builder with workspace scanning, symbol/import
  extraction, concept nodes, persisted last graph, node search, and an SVG
  visual canvas
- Local Media library APIs for image, audio/voice, video, and document files
  with metadata, checksum, optional copy into Desktop storage, search, and
  delete, plus local image/audio/video/document preview
- Built-in workspace tools:
  - `read_file`, `view_file`, `list_dir`
  - `grep_search`, `search_path`, `analyze_workspace`
  - `planning_template`
  - approval-gated `write_file`, `edit_file`, `delete_file`

All built-in tool paths are constrained to the selected workspace. Recursive
search does not follow symlinks, and workspace mutations require a fresh
explicit approval receipt.

## Development

```bash
cd smara-desktop-rust
npm install
make dev
```

## Validation

```bash
npm run check
npm run test:smoke
npm run test:e2e
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
npm run build
SMARA_NATIVE_E2E_STRICT=1 npm run test:e2e:native
```

The strict native smoke test opens the release Tauri application and verifies
the built-in tool catalog, executor, Chat, Memory, Skills, Workflow, MCP,
Graphify, and Media storage/commands through real Tauri IPC.

## Desktop Skills

Skills are stored by Smara Desktop and do not read Smara CLI skill files. Each
skill is a JSON-compatible sequence of Rust-native built-in tool calls. Runtime
parameters use placeholders such as `__PARAM__query`.

Read-only Skills run immediately. Skills containing `write_file`, `edit_file`,
or `delete_file` can be saved, but each execution requires an inline preview,
an explicit user checkbox, and a fresh approval receipt bound to the selected
Skill and workspace.

## Local Memory Ranking

Memory search and Chat context use the same local hybrid ranker. It combines
normalized Indonesian/English concepts, lightweight stemming, weighted tags,
character trigrams, cosine similarity, term coverage, and exact-phrase boosts.
No Memory content is sent to an external embedding service.

## Workflow And MCP

Workflow steps use JSON with `kind: "builtin"` or `kind: "mcp"`. MCP steps
also specify `server_name`; arguments support placeholders such as
`__PARAM__query`. Optional `run_if` reads a boolean/string/number runtime param
and skips the step when false. Adjacent steps sharing the same `parallel_group`
run concurrently after approval validation. Built-in mutations and every MCP
call require an inline preview and fresh approval before a Workflow runs.

MCP servers are launched directly by Rust without a shell. Desktop performs the
MCP initialize handshake, discovers tools using `tools/list`, and invokes tools
using `tools/call`. Healthy server processes are pooled by server config
signature and reused until the config changes, the server is deleted, or a
request fails. Server commands, args, and environment values are stored in
Desktop configuration, independently from Smara CLI.

## Graphify

Graphify runs inside the Desktop Rust process. It scans supported workspace
files while skipping heavy generated folders, extracts file, symbol, heading,
dependency, and concept nodes, creates `contains`, `imports`, and `mentions`
edges, persists the last graph, supports local node search, and renders a
lightweight SVG graph canvas. It does not invoke the previous Python/CLI
Graphify pipeline.

## Media

Media APIs run locally in Rust. Desktop can import supported image,
audio/voice, video, and document files, optionally copy them into Desktop
storage, store title/tags/kind/MIME/size/checksum metadata, search the library,
and delete assets. No media action depends on Smara CLI or the old web backend.

## Chat Provider

Chat streams responses directly from Rust to the Desktop UI using Tauri events.
OpenAI-compatible providers use SSE deltas from:

```text
{provider endpoint}/chat/completions
```

Custom local endpoints, OpenAI-compatible providers, and Anthropic's native
Messages API are supported. Cloud API
keys are read from environment variables and are not stored in Desktop JSON:

- `OPENAI_API_KEY`
- `OPENROUTER_API_KEY`
- `ANTHROPIC_API_KEY`

For Anthropic-native Chat, configure the endpoint as
`https://api.anthropic.com/v1`; Desktop streams `/v1/messages`
`content_block_delta` events.

## Release

```bash
npm run check:versions
npm run build
npm run check:release-artifacts
```
