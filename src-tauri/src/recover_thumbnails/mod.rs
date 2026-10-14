use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;

use crate::generate_thumbnails::generate_thumbnail_name;
use crate::get_videos_list::get_videos_list;

/// Rebuilds an absent index from existing thumbnail files; never generates images.
/// If no saved previews exist, a first launch with discovery disabled does not scan videos.
#[tauri::command]
pub async fn recover_thumbnails(
    directory: String,
    thumb_path: String,
) -> Result<HashMap<String, String>, String> {
    let cached: HashSet<String> = match fs::read_dir(&thumb_path) {
        Ok(entries) => entries
            .filter_map(Result::ok)
            .filter_map(|entry| {
                let path = entry.path();
                let name = path.file_name()?.to_str()?;
                if !name.ends_with(".png")
                    || !matches!(fs::metadata(&path), Ok(meta) if meta.is_file() && meta.len() > 0)
                {
                    return None;
                }
                Some(name.to_owned())
            })
            .collect(),
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
