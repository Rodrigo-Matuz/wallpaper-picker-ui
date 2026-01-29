mod generate_thumbnails;
mod get_videos_list;
mod log_message;
mod select_folder;
mod send_command;

pub use generate_thumbnails::generate_thumb;
pub use get_videos_list::get_videos_list;
pub use log_message::log_message;
pub use select_folder::select_folder;
pub use send_command::send_command;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            log_message,
            get_videos_list,
            select_folder,
            send_command,
            generate_thumb
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
