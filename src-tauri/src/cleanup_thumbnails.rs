use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

/// Deletes files in the thumbnails directory that are not in `keep_files`.
///
/// Cleans up orphaned thumbnails left behind by deleted videos or an old
/// thumbnail naming scheme. Files whose name is in `keep_files` are untouched.
///
/// # Returns
///
/// * `Ok(usize)` - The number of files removed.
/// * `Err(String)` - If the background task fails.
#[tauri::command]
pub async fn cleanup_thumbnails(
    thumb_path: String,
    keep_files: Vec<String>,
) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let thumbnails_dir = PathBuf::from(thumb_path);
        let keep: HashSet<String> = keep_files.into_iter().collect();
        let mut removed = 0usize;

        let entries = match fs::read_dir(&thumbnails_dir) {
            Ok(entries) => entries,
            Err(_) => return Ok(0),
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
                continue;
            };

            if !keep.contains(name) && fs::remove_file(&path).is_ok() {
                removed += 1;
            }
        }

        Ok(removed)
    })
    .await
    .map_err(|e| e.to_string())?
}