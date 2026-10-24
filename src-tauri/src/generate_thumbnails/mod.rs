use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::thumbnail_security::{inspect_thumbnail_entry, require_safe_thumbnail_directory};
use tauri::Manager;

const THUMBNAIL_WIDTH: u32 = 222;
const THUMBNAIL_HEIGHT: u32 = 124;
const FFMPEG_TIMEOUT: Duration = Duration::from_secs(30);
const THUMBNAIL_WAIT_TIMEOUT: Duration = Duration::from_secs(1);

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
pub async fn generate_thumb(
    app: tauri::AppHandle,
    video_path: String,
    force_regenerate: bool,
) -> Result<String, String> {
    let thumbnails_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to locate application data directory: {error}"))?
        .join("thumbnails");
    generate_thumb_in_directory(video_path, thumbnails_dir, force_regenerate).await
}

#[cfg_attr(not(test), allow(dead_code))]
pub(crate) async fn generate_thumb_in_directory(
    video_path: String,
    thumbnails_dir: PathBuf,
    force_regenerate: bool,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let video_path = PathBuf::from(&video_path);

        // Ensure the thumbnails directory exists
        fs::create_dir_all(&thumbnails_dir)
            .map_err(|e| format!("Failed to create thumbnails directory: {}", e))?;
        require_safe_thumbnail_directory(&thumbnails_dir)?;

        // Fail with a clear message instead of panicking per video when ffmpeg is missing
        if !ffmpeg_available() {
            return Err(
                "ffmpeg was not found on PATH. Install ffmpeg to generate thumbnails.".to_string(),
            );
        }

        let thumbnail_name = generate_thumbnail_name(&video_path)?;
        let thumbnail_path = thumbnails_dir.join(&thumbnail_name);
        inspect_thumbnail_entry(&thumbnail_path)?;

        // Skip only when a valid (existing and non-empty) thumbnail is present
        if should_reuse_thumbnail(&thumbnail_path, force_regenerate) {
            return Ok(thumbnail_path.to_string_lossy().to_string());
        }

        // Generate into a unique sibling file. A forced rebuild must not destroy
        // the last readable preview when ffmpeg fails or times out.
        let temporary_path = temporary_thumbnail_path(&thumbnail_path);
        if inspect_thumbnail_entry(&temporary_path)?.is_some() {
            fs::remove_file(&temporary_path).map_err(|error| {
                format!(
                    "Failed to remove stale temporary thumbnail '{}': {error}",
                    temporary_path.display()
                )
            })?;
        }

        // Generate the thumbnail using ffmpeg
        if !generate_thumbnail(&video_path, &temporary_path) {
            let _ = fs::remove_file(&temporary_path);
            return Err(format!("Failed to generate thumbnail for {:?}", video_path));
        }

        if let Err(error) = replace_thumbnail(&temporary_path, &thumbnail_path) {
            let _ = fs::remove_file(&temporary_path);
            return Err(error);
        }

        Ok(thumbnail_path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn should_reuse_thumbnail(path: &Path, force_regenerate: bool) -> bool {
    !force_regenerate && is_valid_thumbnail(path)
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
pub(crate) fn generate_thumbnail_name(path: &Path) -> Result<String, String> {
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
    matches!(inspect_thumbnail_entry(path), Ok(Some(meta)) if meta.is_file() && meta.len() > 0)
}

fn temporary_thumbnail_path(path: &Path) -> PathBuf {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("thumbnail.png");
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    path.with_file_name(format!(
        ".{file_name}.{}.{}.tmp.png",
        std::process::id(),
        timestamp
    ))
}

fn replace_thumbnail(temporary_path: &Path, thumbnail_path: &Path) -> Result<(), String> {
    if let Some(metadata) = inspect_thumbnail_entry(thumbnail_path)? {
        if !metadata.is_file() {
            return Err(format!(
                "Refusing to replace non-file thumbnail '{}'",
                thumbnail_path.display()
            ));
        }
    }

    // Unix rename atomically replaces an existing file. Windows does not, so
    // remove the old regular file only after the new image was generated.
    #[cfg(windows)]
    if let Err(error) = fs::remove_file(thumbnail_path) {
        if error.kind() != std::io::ErrorKind::NotFound {
            return Err(format!(
                "Failed to replace thumbnail '{}': {error}",
                thumbnail_path.display()
            ));
        }
    }

    fs::rename(temporary_path, thumbnail_path).map_err(|error| {
        format!(
            "Failed to replace thumbnail '{}': {error}",
            thumbnail_path.display()
        )
    })
}

/// Cheap sanity check that ffmpeg can be executed.
fn ffmpeg_available() -> bool {
    let mut command = Command::new("ffmpeg");
    command
        .arg("-version")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    matches!(
        run_command_with_timeout_command(command, "ffmpeg", FFMPEG_TIMEOUT),
        Some(true)
    )
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
        let args = [
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
        ];

        match run_ffmpeg(&args) {
            Some(true) if wait_for_thumbnail(thumbnail_path) => return true,
            Some(true) | Some(false) | None => continue,
        }
    }

    eprintln!("Warning: failed to generate thumbnail {:?}", thumbnail_path);
    false
}

/// Runs ffmpeg with a hard upper bound so a broken input or hung decoder cannot
/// hold a thumbnail worker forever.
fn run_ffmpeg(args: &[&str]) -> Option<bool> {
    run_command_with_timeout("ffmpeg", args, FFMPEG_TIMEOUT)
}

/// Runs an external command with a hard upper bound and cleans up timed-out
/// children before returning.
fn run_command_with_timeout(program: &str, args: &[&str], timeout: Duration) -> Option<bool> {
    let mut command = Command::new(program);
    command.args(args);
    run_command_with_timeout_command(command, program, timeout)
}

fn run_command_with_timeout_command(
    mut command: Command,
    program: &str,
    timeout: Duration,
) -> Option<bool> {
    let mut child = command.spawn().ok()?;
    let start = Instant::now();

    loop {
        match child.try_wait() {
            Ok(Some(status)) => return Some(status.success()),
            Ok(None) if start.elapsed() >= timeout => {
                let _ = child.kill();
                let _ = child.wait();
                eprintln!("Warning: {program} timed out after {timeout:?}");
                return Some(false);
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                eprintln!("Warning: failed to poll {program}: {error}");
                return None;
            }
        }
    }
}

/// Polls until the thumbnail file exists and has content (with a short safety timeout).
fn wait_for_thumbnail(thumbnail_path: &Path) -> bool {
    let start = Instant::now();
    let sleep_step = Duration::from_millis(20);

    while start.elapsed() < THUMBNAIL_WAIT_TIMEOUT {
        if is_valid_thumbnail(thumbnail_path) {
            return true;
        }
        std::thread::sleep(sleep_step);
    }

    false
}

// Tests live in a dedicated file (src/generate_thumbnails/tests.rs),
// separate from the production code.
#[cfg(test)]
mod tests;
