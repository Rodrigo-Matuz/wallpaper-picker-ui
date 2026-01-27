use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

// DOCS:
// By ChatGPT

/// Generates a thumbnail for a given video file.
///
/// This function creates a thumbnail image from the specified video file using `ffmpeg`.
/// If the thumbnail already exists in the target directory, it returns the existing path
/// without re-generating the thumbnail.
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
/// - Thumbnail generation with `ffmpeg` fails.
///
/// # Dependencies
///
/// This function relies on the `ffmpeg` command-line tool to generate thumbnails. Ensure
/// `ffmpeg` is installed and accessible in the system's PATH.
///
/// # Examples
///
/// ```
/// use my_crate::generate_thumb; // Replace `my_crate` with your crate name.
///
/// let video = "/path/to/video.mp4".to_string();
/// let thumb_dir = "/path/to/thumbnails".to_string();
///
/// match generate_thumb(video, thumb_dir) {
///     Ok(thumbnail_path) => println!("Thumbnail generated: {}", thumbnail_path),
///     Err(err) => eprintln!("Error: {}", err),
/// }
/// ```
#[tauri::command]
pub async fn generate_thumb(video_path: String, thumb_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let video_path = PathBuf::from(video_path);
        let thumbnails_dir = PathBuf::from(thumb_path);

        let thumbnail_name = generate_thumbnail_name(&video_path);
        let thumbnail_path = thumbnails_dir.join(&thumbnail_name);

        // Ensure the thumbnails directory exists
        fs::create_dir_all(&thumbnails_dir)
            .map_err(|e| format!("Failed to create thumbnails directory: {}", e))?;

        // Check if the thumbnail already exists
        if thumbnail_path.exists() {
            return Ok(thumbnail_path.to_string_lossy().to_string());
        }

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

/// Generates a thumbnail file name based on the video file name.
///
/// # Arguments
///
/// * `path` - A reference to a `PathBuf` representing the video file path.
///
/// # Returns
///
/// A `String` containing the generated thumbnail file name (e.g., `video.png`).
///
/// # Examples
///
/// ```
/// let path = PathBuf::from("/path/to/video.mp4");
/// let thumb_name = generate_thumbnail_name(&path);
/// assert_eq!(thumb_name, "video.png");
/// ```
fn generate_thumbnail_name(path: &PathBuf) -> String {
    path.file_stem().unwrap().to_string_lossy().to_string() + ".png"
}

/// Generates a thumbnail image for a video using `ffmpeg`.
///
/// # Arguments
///
/// * `video_path` - A reference to a `Path` representing the video file path.
/// * `thumbnail_path` - A reference to a `Path` representing the thumbnail file path.
///
/// # Returns
///
/// `true` if the thumbnail generation succeeds, otherwise `false`.
///
/// # Dependencies
///
/// This function requires `ffmpeg` to be installed and accessible in the system's PATH.
///
/// # Examples
///
/// ```
/// let video_path = Path::new("/path/to/video.mp4");
/// let thumbnail_path = Path::new("/path/to/thumbnails/video.png");
/// assert!(generate_thumbnail(video_path, thumbnail_path));
/// ```
fn generate_thumbnail(video_path: &Path, thumbnail_path: &Path) -> bool {
    let status = Command::new("ffmpeg")
        .args([
            "-i",
            video_path.to_str().unwrap(),
            "-ss",
            "00:00:01.000",
            "-vframes",
            "1",
            "-s",
            "222x124",
            thumbnail_path.to_str().unwrap(),
        ])
        .status()
        .expect("Failed to execute ffmpeg");

    status.success()
}
