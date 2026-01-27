use walkdir::WalkDir;

#[tauri::command]
pub fn get_videos_list(directory: &str) -> Vec<String> {
    let video_formats = ["mp4", "mkv", "avi", "mov", "wmv"];
    let mut video_paths = Vec::new();

    for entry in WalkDir::new(directory).into_iter().filter_map(Result::ok) {
        if entry.file_type().is_file() {
            if let Some(ext) = entry.path().extension() {
                if let Some(ext_str) = ext.to_str() {
                    if video_formats.contains(&ext_str) {
                        video_paths.push(entry.path().display().to_string());
                    }
                }
            }
        }
    }
    video_paths
}
