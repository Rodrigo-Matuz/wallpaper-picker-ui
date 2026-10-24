use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

use crate::thumbnail_security::existing_safe_thumbnail_directory;
use tauri::Manager;

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
    app: tauri::AppHandle,
    keep_files: Vec<String>,
) -> Result<usize, String> {
    let thumbnails_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to locate application data directory: {error}"))?
        .join("thumbnails");
    cleanup_thumbnails_in_directory(thumbnails_dir, keep_files).await
}

pub(crate) async fn cleanup_thumbnails_in_directory(
    thumbnails_dir: PathBuf,
    keep_files: Vec<String>,
) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let keep: HashSet<String> = keep_files.into_iter().collect();
        let mut removed = 0usize;

        if !existing_safe_thumbnail_directory(&thumbnails_dir)? {
            return Ok(0);
        }

        let entries = match fs::read_dir(&thumbnails_dir) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(0),
            Err(error) => {
                return Err(format!(
                    "Failed to read thumbnails directory '{}': {error}",
                    thumbnails_dir.display()
                ));
            }
        };

        for entry in entries {
            let entry = entry.map_err(|error| {
                format!(
                    "Failed to read an entry in thumbnails directory '{}': {error}",
                    thumbnails_dir.display()
                )
            })?;
            let path = entry.path();
            let metadata = crate::thumbnail_security::inspect_thumbnail_entry(&path)?;
            if !metadata.is_some_and(|metadata| metadata.is_file()) {
                continue;
            }

            let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
                continue;
            };

            // The index lives in this directory but is not a generated preview.
            if name != "map.json" && !keep.contains(name) {
                match fs::remove_file(&path) {
                    Ok(()) => removed += 1,
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                    Err(error) => {
                        return Err(format!(
                            "Failed to remove orphaned thumbnail '{}': {error}",
                            path.display()
                        ));
                    }
                }
            }
        }

        Ok(removed)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests;
