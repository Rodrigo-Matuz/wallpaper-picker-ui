use walkdir::WalkDir;

/// Directories that never contain wallpapers and are expensive to walk.
const SKIPPED_DIRS: &[&str] = &[
    "$RECYCLE.BIN", "System Volume Information", "lost+found", "proc", "sys", "dev", "run",
];

/// Skips hidden entries (dot-prefixed, e.g. `.git`, `.cache`) and known noise
/// directories. The root itself (depth 0) is never skipped.
fn is_skipped(entry: &walkdir::DirEntry) -> bool {
    if entry.depth() == 0 {
        return false;
    }

    let name = entry.file_name().to_str().unwrap_or("");
    name.starts_with('.') || SKIPPED_DIRS.contains(&name)
}

/// Recursively collects video files from a directory.
///
/// Supported extensions: `mp4`, `mkv`, `avi`, `mov`, `wmv`. Hidden folders and
/// known system directories are skipped. Runs on a blocking thread so large
/// trees (e.g. network mounts) don't stall the IPC runtime.
#[tauri::command]
pub async fn get_videos_list(directory: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let video_formats = ["mp4", "mkv", "avi", "mov", "wmv"];
        let mut video_paths = Vec::new();

        for entry in WalkDir::new(directory)
            .into_iter()
            .filter_entry(|e| !is_skipped(e))
            .filter_map(Result::ok)
        {
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

        Ok(video_paths)
    })
    .await
    .map_err(|e| e.to_string())?
}