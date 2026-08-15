# Changelog

## Desktop v0.3.0

- Completed the standalone Rust-native Desktop surface across Chat, Memory,
  Skills, Workflow, MCP, Graphify, Media, settings, history, workspace state,
  provider health, approvals, and built-in tools.
- Added Chat streaming cancellation and retry.
- Added local media preview for image, audio/voice, video, and document assets.
- Added Graphify SVG canvas rendering for local knowledge graphs.
- Added MCP stdio process pooling for repeated health checks and tool calls.
- Added Workflow `run_if` branching and `parallel_group` step execution.
- Removed the remaining tracked future native modules from the migration
  boundary document.

## Bridge v29

- Hardened the native Tauri WebDriver smoke harness teardown path.
- Added tauri-driver port availability checks and automatic nearby-port isolation when the default port is busy.
- Added explicit WebDriver session cleanup, graceful driver shutdown, SIGKILL fallback, and driver exit logging.
- Classified known WebKit/GTK teardown warnings as environment noise instead of test failures while preserving strict failure behavior for real smoke errors.

## Bridge v28

- Hardened the native Tauri WebDriver smoke harness teardown path.
- Added tauri-driver port availability checks and automatic nearby-port isolation when the default port is busy.
- Added explicit WebDriver session cleanup, graceful driver shutdown, SIGKILL fallback, and driver exit logging.
- Classified known WebKit/GTK teardown warnings as environment noise instead of test failures while preserving strict failure behavior for real smoke errors.

## Bridge v28


- Redesigned the desktop shell into a Claude-style cowork workspace.
- Added left workspace rail, center transcript, sticky composer, and right tool/result inspector.
- Surfaced allowlisted Smara actions as cowork tools while preserving backend approval and output reveal safety.
- Added transcript messages for user prompts, tool runs, approvals, sensitive-output warnings, and results.
- Extended smoke coverage for the cowork shell.

## Bridge v27

This changelog tracks the incremental bridge milestones for the Tauri-based Smara Desktop Rust app.

## Bridge v26

- Added release artifact checksum verification for Linux `.deb` and `.rpm` bundles.
- Added `npm run check:release-artifacts` to verify current-version release artifacts and write `src-tauri/target/release/bundle/SHA256SUMS`.
- Updated release checklist documentation with checksum verification steps.
- Cleaned up README backend command documentation and older changelog duplicates.

## Bridge v25

- Upgraded the optional native E2E harness to a strict-capable WebDriver smoke path.
- Added real native WebView DOM assertions for the built Tauri app when `tauri-driver`, `WebKitWebDriver`, and a display are available.
- Added robust prerequisite checks, strict mode failure behavior, configurable binary/timeout/driver port, and process cleanup.
- Kept Playwright mocked IPC E2E as the stable default quality gate while enabling `xvfb-run` strict native validation.

## Bridge v24

- Added a safe run history detail drawer for selected history items.
- Added sanitized Copy detail JSON without revealing stdout/stderr by default.
- Kept the drawer client-side and preserved backend approval/file safety boundaries.
- Extended smoke/E2E coverage for history detail selection.

## Bridge v23

- Aligned desktop app version metadata across `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` at `0.2.3`.
- Added `npm run check:versions` to detect version drift before release builds.
- Added release checklist documentation and clarified that Bridge milestones are separate from product semver.

## Bridge v22

- Added optional native Tauri desktop runtime smoke harness via `npm run test:e2e:native`.
- Added prerequisite guards for `tauri-driver` and desktop display availability so the stable quality gate remains reliable.
- Documented native WebView smoke validation, strict mode, and headless Linux `xvfb-run` usage.
- Kept Playwright mocked IPC E2E as the stable default runtime UI quality gate.

## Bridge v21

- Added selective run history retention controls with confirmation-backed cleanup.
- Added guarded backend cleanup modes for visible, failed, cancelled/timed-out, approval-required, approval-granted, and all history items.
- Added trim-to-limit cleanup using the configured history limit.
- Extended smoke/E2E/Rust coverage for retention and status behavior.

## Bridge v20

- Added client-side run history search.
- Added status and approval filters for run history.
- Added visible filtered count summary and empty state.
- Extended DOM smoke and Playwright E2E coverage for history filtering.

## Bridge v19

- Added native file picker support for settings/history import/export via the official Tauri dialog plugin.
- Added guarded backend file read/write commands for JSON backup/restore.
- Kept paste import, Blob download, toast feedback, and Copy Output JSON fallback flows.
- Extended DOM smoke and Playwright E2E coverage for native file dialog seams.

## Bridge v18

- Added approval-required `history-diagnostics`.
- Returns sanitized run history metrics and recent action metadata.
- Omits stdout, stderr, full history output, full paths, secrets, and shell execution.
- Extended backend catalog/approval tests for the sensitive diagnostic action.

## Bridge v16

- Added lightweight toast feedback for export/import success and error states.
- Added **Copy Output JSON** for copying the final output/export JSON to the clipboard.
- Kept export download as a client-side Blob fallback with visible status feedback.
- Updated frontend DOM smoke tests for toast/copy controls.

## Bridge v15

- Added JSON import/export for desktop settings.
- Added JSON import/export for run history.
- Added a paste-based import dialog in the UI.
- Added versioned history export snapshots.
- Added validation/capping for imported history and normalization for imported settings.

## Bridge v13

- Added approval-required `settings-diagnostics` action.
- Returned sanitized local settings/history metadata without shell execution.
- Masked local path previews.
- Extended backend approval tests for sensitive read-only diagnostics.

## Bridge v12

- Added Vitest + jsdom frontend smoke test harness.
- Added pure UI helpers for progress parsing, duration formatting, action argument formatting, and run status mapping.
- Added DOM contract tests for dynamic catalog, approval dialog, observability, and output panels.

## Bridge v11

- Reorganized the UI into a chat-agent console layout.
- Added header/global status, left control sidebar, and main console area.
- Preserved backend allowlisting, approval, timeout, cancellation, and streaming behavior.

## Bridge v10

- Added active stream observability panel.
- Added visual progress bar with deterministic `tick N/M` parsing.
- Added last run summary card.
- Counted stream events, stdout events, stderr events, and elapsed time.

## Bridge v9 / v10 stream test milestone

- Added `stream-test`, an internal deterministic read-only streaming action.
- Supported non-stream deterministic output and streaming tick output.
- Supported cancellation without relying on shell commands or OS-specific `sleep`.

## Bridge v8

- Added backend-driven safe action catalog UI.
- Added selected-action dropdown and metadata card.
- Added `Run Selected` and `Run Selected Stream` controls.
- Added custom in-app approval dialog.
- Kept Rust backend as the security boundary.

## Bridge v7

- Added local desktop settings and run history storage.
- Added CLI path override.
- Recorded run metadata including action, args, path, exit code, success, timeout, cancellation, duration, and approval flags.

## Bridge v6

- Added read-only diagnostics actions:
  - `doctor` -> `smara doctor --json`
  - `skill-list` -> `smara skill list`
- Kept diagnostics allowlisted and non-mutating.

## Bridge v5

- Added stream cancellation.
- Registered active stream processes by stream id.
- Added `cancel_smara_cli_stream` backend command.
- Recorded `cancelled: true` in result/history.

## Bridge v4

- Added event-based streaming runner.
- Added `run_smara_cli_stream` backend command.
- Emitted `smara-cli-stream` events with `start`, `stdout`, `stderr`, `error`, `finish`, and cancellation-related states.

## Bridge v3 and earlier

- Established controlled non-stream CLI bridge behavior.
- Added deterministic fake bridge for UI/Tauri IPC validation.
- Established the initial allowlist-first safety model.
