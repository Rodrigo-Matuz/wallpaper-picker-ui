mod cleanup_thumbnails;
mod generate_thumbnails;
mod get_videos_list;
mod log_message;
mod send_command;
mod validate_video_paths;

pub use cleanup_thumbnails::cleanup_thumbnails;
pub use generate_thumbnails::generate_thumb;
pub use get_videos_list::get_videos_list;
pub use log_message::log_message;
pub use send_command::send_command;
pub use validate_video_paths::validate_video_paths;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            cleanup_thumbnails
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}