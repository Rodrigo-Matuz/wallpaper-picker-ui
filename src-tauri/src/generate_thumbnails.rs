use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

const THUMBNAIL_WIDTH: u32 = 222;
const THUMBNAIL_HEIGHT: u32 = 124;

/// FNV-1a 64-bit hash.
///
/// Deliberately hand-rolled instead of `std::hash::DefaultHasher`:
/// FNV-1a output is stable across compiler versions and program runs,
/// so persisted thumbnail file names never change for the same input.
fn fnv1a_hash(data: &str) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in data.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

/// Generates a thumbnail for a given video file.
///
/// This function creates a thumbnail image from the specified video file using `ffmpeg`.
/// If the thumbnail already exists in the target directory (and is a non-empty file),
/// it returns the existing path without re-generating the thumbnail.
///
/// Thumbnail file names are derived from the full video path (file stem + path hash)
/// so that two videos with the same file name in different folders never collide.
///
/// # Arguments
///
/// * `video_path` - A `String` representing the full path to the video file.
/// * `thumb_path` - A `String` representing the directory where the thumbnail will be saved.
///
/// # Returns
///
/// * `Ok(String)` - The path to the generated or existing thumbnail image.
/// * `Err(String)` - An error message if thumbnail generation fails.
///
/// # Errors
///
/// This function returns an error in the following cases:
/// - The thumbnails directory cannot be created.
/// - `ffmpeg` is not available on the system PATH.
/// - The video path is not valid UTF-8.
/// - Thumbnail generation with `ffmpeg` fails.
#[tauri::command]
pub async fn generate_thumb(video_path: String, thumb_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let video_path = PathBuf::from(&video_path);
        let thumbnails_dir = PathBuf::from(&thumb_path);

        // Ensure the thumbnails directory exists
        fs::create_dir_all(&thumbnails_dir)
            .map_err(|e| format!("Failed to create thumbnails directory: {}", e))?;

        // Fail with a clear message instead of panicking per video when ffmpeg is missing
        if !ffmpeg_available() {
            return Err(
                "ffmpeg was not found on PATH. Install ffmpeg to generate thumbnails.".to_string(),
            );
        }

        let thumbnail_name = generate_thumbnail_name(&video_path)?;
        let thumbnail_path = thumbnails_dir.join(&thumbnail_name);

        // Skip only when a valid (existing and non-empty) thumbnail is present
        if is_valid_thumbnail(&thumbnail_path) {
            return Ok(thumbnail_path.to_string_lossy().to_string());
        }

        // Remove leftovers from previous failed generations so ffmpeg can write the file
        let _ = fs::remove_file(&thumbnail_path);

        // Generate the thumbnail using ffmpeg
        if generate_thumbnail(&video_path, &thumbnail_path) {
            Ok(thumbnail_path.to_string_lossy().to_string())
        } else {
            Err(format!("Failed to generate thumbnail for {:?}", video_path))
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Generates a thumbnail file name based on the video file path.
///
/// The full path is hashed (FNV-1a) into the name so two videos with the same
/// file name in different folders can never overwrite each other's thumbnail.
///
/// # Arguments
///
/// * `path` - A reference to a `Path` representing the video file path.
///
/// # Returns
///
/// * `Ok(String)` - The generated thumbnail file name (e.g., `video-3f9a2c….png`).
/// * `Err(String)` - If the path or its file stem is not valid UTF-8.
fn generate_thumbnail_name(path: &Path) -> Result<String, String> {
    let path_str = path
        .to_str()
        .ok_or_else(|| "Video path contains invalid UTF-8".to_string())?;

    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| format!("Cannot determine a file stem for {:?}", path))?;

    Ok(format!("{}-{:016x}.png", stem, fnv1a_hash(path_str)))
}

/// A thumbnail is valid when the file exists and is non-empty.
fn is_valid_thumbnail(path: &Path) -> bool {
    matches!(fs::metadata(path), Ok(meta) if meta.len() > 0)
}

/// Cheap sanity check that ffmpeg can be executed.
fn ffmpeg_available() -> bool {
    Command::new("ffmpeg")
        .arg("-version")
        .output()
        .is_ok()
}

/// Generates a thumbnail image for a video using `ffmpeg`.
///
/// Seeks 1s into the video (fast seek, `-ss` before `-i`) and falls back to the
/// first frame for videos shorter than the seek position. Scales to the target
/// size while preserving the aspect ratio (letterboxed, not distorted).
///
/// # Arguments
///
/// * `video_path` - A reference to a `Path` representing the video file path.
/// * `thumbnail_path` - A reference to a `Path` representing the thumbnail file path.
///
/// # Returns
///
/// `true` if the thumbnail generation succeeds, otherwise `false`.
fn generate_thumbnail(video_path: &Path, thumbnail_path: &Path) -> bool {
    let Some(video) = video_path.to_str() else {
        return false;
    };
    let Some(output) = thumbnail_path.to_str() else {
        return false;
    };

    let vf = format!(
        "scale={}:{}:force_original_aspect_ratio=decrease,pad={}:{}:(ow-iw)/2:(oh-ih)/2:color=black",
        THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT
    );

    for seek in ["00:00:01.000", "0"] {
        let status = Command::new("ffmpeg")
            .args([
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-ss",
                seek,
                "-i",
                video,
                "-vframes",
                "1",
                "-vf",
                &vf,
                output,
            ])
            .status();

        match status {
            Ok(status) if status.success() => return wait_for_thumbnail(thumbnail_path),
            _ => continue,
        }
    }

    eprintln!(
        "Warning: failed to generate thumbnail {:?}",
        thumbnail_path
    );
    false
}

/// Polls until the thumbnail file exists and has content (with a safety timeout).
fn wait_for_thumbnail(thumbnail_path: &Path) -> bool {
    let timeout = Duration::from_secs(5); // safety net
    let start = Instant::now();
    let sleep_step = Duration::from_millis(30);

    while start.elapsed() < timeout {
        if is_valid_thumbnail(thumbnail_path) {
            return true;
        }
        std::thread::sleep(sleep_step);
    }

    eprintln!(
        "Warning: thumbnail {:?} not visible after timeout",
        thumbnail_path
    );
    false
}

// Tests live in a dedicated file (src/generate_thumbnails/tests.rs),
// separate from the production code.
#[cfg(test)]
mod tests;