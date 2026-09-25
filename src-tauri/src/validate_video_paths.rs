use std::path::Path;

/// Filters a list of paths, returning only the ones that still exist as files.
///
/// Used by the frontend to prune `thumbnailsHashMap` entries for deleted or
/// renamed videos. The existence check happens here (Rust) because wallpaper
/// paths live outside the webview's fs capabilities.
#[tauri::command]
pub async fn validate_video_paths(paths: Vec<String>) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        Ok(paths
            .into_iter()
            .filter(|p| Path::new(p).is_file())
            .collect())
    })
    .await
    .map_err(|e| e.to_string())?
}