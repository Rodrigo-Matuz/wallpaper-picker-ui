mod check_release_notice;
mod cleanup_thumbnails;
mod generate_thumbnails;
mod get_update_support;
mod get_videos_list;
mod log_message;
mod recover_thumbnails;
mod send_command;
#[cfg(test)]
mod test_support;
mod thumbnail_security;
mod validate_video_paths;
mod windows_playback;

pub use check_release_notice::check_release_notice;
pub use cleanup_thumbnails::cleanup_thumbnails;
pub use generate_thumbnails::generate_thumb;
pub use get_update_support::get_update_support;
pub use get_videos_list::get_videos_list;
pub use log_message::log_message;
pub use recover_thumbnails::recover_thumbnails;
pub use send_command::send_command;
pub use validate_video_paths::validate_video_paths;
pub use windows_playback::{start_windows_playback, stop_windows_playback};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            log_message,
            get_videos_list,
            send_command,
            generate_thumb,
            validate_video_paths,
            cleanup_thumbnails,
            recover_thumbnails,
            get_update_support,
            check_release_notice,
            start_windows_playback,
            stop_windows_playback
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            windows_playback::stop_windows_playback_sync();
        }
    });
}

#[cfg(test)]
mod capability_tests {
    use tauri::ipc::{Origin, RuntimeAuthority};

    fn assert_allowed(authority: &RuntimeAuthority, command: &str) {
        assert!(
            authority
                .resolve_access(command, "main", "main", &Origin::Local)
                .is_some(),
            "expected command to be allowed for the main local webview: {command}"
        );
    }

    fn assert_denied(authority: &RuntimeAuthority, command: &str, window: &str, webview: &str) {
        assert!(
            authority
                .resolve_access(command, window, webview, &Origin::Local)
                .is_none(),
            "expected command to be denied: {command} ({window}, {webview})"
        );
    }

    #[test]
    fn main_capability_denies_unused_commands_and_wrong_window_scope() {
        let mut context: tauri::Context<tauri::test::MockRuntime> = tauri::generate_context!();
        let authority = context.runtime_authority_mut();

        assert_allowed(authority, "plugin:fs|remove");
        assert_allowed(authority, "plugin:dialog|open");
        assert_allowed(authority, "plugin:updater|check");

        assert_denied(authority, "plugin:fs|remove", "other", "other");
        assert_denied(authority, "plugin:fs|unused_command", "main", "main");
        assert_denied(authority, "plugin:opener|open_url", "main", "main");
    }
}
