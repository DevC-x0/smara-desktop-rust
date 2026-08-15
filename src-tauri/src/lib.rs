mod app_service;
mod app_state;
mod builtin_tools;
mod chat_service;
mod graphify_service;
mod improvement_service;
mod mcp_service;
mod media_service;
mod memory_service;
mod provider_service;
mod skill_service;
mod workflow_service;
mod workspace_service;

use app_service::{get_desktop_runtime_status, DesktopRuntimeState};
use app_state::{
    clear_run_history, clear_run_history_selective, export_history_json, export_history_to_file,
    export_settings_json, export_settings_to_file, get_desktop_settings, get_run_history,
    import_history_from_file, import_history_json, import_settings_from_file, import_settings_json,
    save_desktop_settings, trim_run_history_to_limit,
};
use builtin_tools::{list_desktop_builtin_tools, run_desktop_builtin_tool};
use chat_service::{
    cancel_desktop_chat_stream, delete_desktop_chat_session, list_desktop_chat_sessions,
    send_desktop_chat, stream_desktop_chat, DesktopChatStreamState,
};
use graphify_service::{build_desktop_graphify, get_desktop_graphify, search_desktop_graphify};
use mcp_service::{
    call_desktop_mcp_tool, check_desktop_mcp_server, delete_desktop_mcp_server,
    list_desktop_mcp_servers, save_desktop_mcp_server, DesktopMcpPoolState,
};
use media_service::{
    delete_desktop_media, import_desktop_media, list_desktop_media, search_desktop_media,
};
use memory_service::{
    create_desktop_memory, delete_desktop_memory, list_desktop_memories, search_desktop_memories,
    search_desktop_memories_ranked, update_desktop_memory,
};
use provider_service::{
    check_desktop_provider_health, get_desktop_provider_config, save_desktop_provider_config,
};
use skill_service::{
    delete_desktop_skill, list_desktop_skills, preview_desktop_skill, run_desktop_skill,
    save_desktop_skill,
};
use workflow_service::{
    delete_desktop_workflow, list_desktop_workflows, preview_desktop_workflow,
    run_desktop_workflow, save_desktop_workflow,
};
use workspace_service::{
    create_desktop_workspace, get_desktop_workspaces, switch_desktop_workspace,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(DesktopRuntimeState::default())
        .manage(DesktopChatStreamState::default())
        .manage(DesktopMcpPoolState::default())
        .invoke_handler(tauri::generate_handler![
            get_desktop_runtime_status,
            list_desktop_builtin_tools,
            run_desktop_builtin_tool,
            list_desktop_chat_sessions,
            send_desktop_chat,
            stream_desktop_chat,
            cancel_desktop_chat_stream,
            delete_desktop_chat_session,
            build_desktop_graphify,
            get_desktop_graphify,
            search_desktop_graphify,
            list_desktop_media,
            import_desktop_media,
            search_desktop_media,
            delete_desktop_media,
            list_desktop_memories,
            create_desktop_memory,
            update_desktop_memory,
            search_desktop_memories,
            search_desktop_memories_ranked,
            delete_desktop_memory,
            list_desktop_skills,
            save_desktop_skill,
            preview_desktop_skill,
            run_desktop_skill,
            delete_desktop_skill,
            list_desktop_workflows,
            save_desktop_workflow,
            preview_desktop_workflow,
            run_desktop_workflow,
            delete_desktop_workflow,
            list_desktop_mcp_servers,
            save_desktop_mcp_server,
            check_desktop_mcp_server,
            call_desktop_mcp_tool,
            delete_desktop_mcp_server,
            get_desktop_workspaces,
            create_desktop_workspace,
            switch_desktop_workspace,
            get_desktop_provider_config,
            save_desktop_provider_config,
            check_desktop_provider_health,
            get_desktop_settings,
            save_desktop_settings,
            export_settings_json,
            import_settings_json,
            get_run_history,
            clear_run_history,
            export_history_json,
            import_history_json,
            export_settings_to_file,
            import_settings_from_file,
            export_history_to_file,
            import_history_from_file,
            clear_run_history_selective,
            trim_run_history_to_limit
        ])
        .build(tauri::generate_context!())
        .expect("error while building Smara Desktop Rust");

    app.run(|_, _| {});
}
