use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;

use crate::generate_thumbnails::generate_thumbnail_name;
use crate::get_videos_list::get_videos_list;
use crate::thumbnail_security::{existing_safe_thumbnail_directory, inspect_thumbnail_entry};
use tauri::Manager;

fn collect_cached_thumbnail_names<I>(entries: I) -> Result<HashSet<String>, String>
where
    I: IntoIterator<Item = std::io::Result<fs::DirEntry>>,
{
    let mut cached = HashSet::new();
    for entry in entries {
        let entry =
            entry.map_err(|error| format!("Failed to read cached thumbnail entry: {error}"))?;
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if !name.ends_with(".png") {
            continue;
        }
        let Some(metadata) = inspect_thumbnail_entry(&path)? else {
            continue;
        };
        if metadata.is_file() && metadata.len() > 0 {
            cached.insert(name.to_owned());
        }
    }
    Ok(cached)
}

/// Rebuilds an absent index from existing thumbnail files; never generates images.
/// If no saved previews exist, a first launch with discovery disabled does not scan videos.
#[tauri::command]
pub async fn recover_thumbnails(
    app: tauri::AppHandle,
    directory: String,
) -> Result<HashMap<String, String>, String> {
    let thumbnails_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to locate application data directory: {error}"))?
        .join("thumbnails");
    recover_thumbnails_from_directory(directory, thumbnails_dir).await
}

pub(crate) async fn recover_thumbnails_from_directory(
    directory: String,
    thumb_path: std::path::PathBuf,
) -> Result<HashMap<String, String>, String> {
    if !existing_safe_thumbnail_directory(&thumb_path)? {
        return Ok(HashMap::new());
    }
    let cached: HashSet<String> = match fs::read_dir(&thumb_path) {
        Ok(entries) => collect_cached_thumbnail_names(entries)?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(HashMap::new()),
        Err(error) => return Err(format!("Failed to read cached thumbnails: {error}")),
    };
    if cached.is_empty() || directory.is_empty() {
        return Ok(HashMap::new());
    }

    let mut recovered = HashMap::new();
    for video in get_videos_list(directory).await? {
        if let Ok(file_name) = generate_thumbnail_name(Path::new(&video)) {
            if cached.contains(&file_name) {
                recovered.insert(file_name, video);
            }
        }
    }
    Ok(recovered)
}

#[cfg(test)]
mod tests;
