//! Unit tests for the thumbnail naming/hash logic.
//!
//! Kept separate from the production code (generate_thumbnails.rs).

use super::*;
use crate::test_support::TempDir;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use std::time::Duration;

static PROCESS_ENV_LOCK: Mutex<()> = Mutex::new(());

fn create_short_video(directory: &std::path::Path) -> PathBuf {
    let video = directory.join("short.mp4");
    let output = video.to_str().expect("fixture path must be valid UTF-8");
    let status = Command::new("ffmpeg")
        .args([
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=blue:s=320x180:r=10",
            "-t",
            "0.25",
            "-c:v",
            "mpeg4",
            "-q:v",
            "5",
            output,
        ])
        .status()
        .expect("ffmpeg must be executable for the acceptance fixtures");
    assert!(
        status.success(),
        "ffmpeg failed to create the short fixture"
    );
    video
}

fn assert_no_temporary_thumbnails(directory: &std::path::Path) {
    assert_eq!(
        fs::read_dir(directory)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_name().to_string_lossy().contains(".tmp.png"))
            .count(),
        0
    );
}

fn assert_png(path: &std::path::Path) {
    let bytes = fs::read(path).unwrap();
    assert_eq!(&bytes[..8], &[137, 80, 78, 71, 13, 10, 26, 10]);
}

#[test]
fn empty_input_hash_matches_fnv1a_offset_basis() {
    assert_eq!(fnv1a_hash(""), 0xcbf2_9ce4_8422_2325);
}

#[test]
fn hash_is_deterministic() {
    assert_eq!(
        fnv1a_hash("/videos/sunset.mp4"),
        fnv1a_hash("/videos/sunset.mp4")
    );
    assert_ne!(fnv1a_hash("/a/sunset.mp4"), fnv1a_hash("/b/sunset.mp4"));
}

#[test]
fn thumbnail_name_contains_stem_and_16_hex_chars() {
    let name = generate_thumbnail_name(&PathBuf::from("/videos/sunset.mp4")).unwrap();
    assert!(name.starts_with("sunset-"));
    let hex = name.trim_start_matches("sunset-").trim_end_matches(".png");
    assert_eq!(hex.len(), 16);
    assert!(hex.chars().all(|c| c.is_ascii_hexdigit()));
}

#[test]
fn same_stem_in_different_folders_never_collides() {
    let a = generate_thumbnail_name(&PathBuf::from("/a/sunset.mp4")).unwrap();
    let b = generate_thumbnail_name(&PathBuf::from("/b/sunset.mp4")).unwrap();
    assert_ne!(a, b);
}

#[cfg(unix)]
#[test]
fn non_utf8_path_is_an_error_not_a_panic() {
    use std::ffi::OsStr;
    use std::os::unix::ffi::OsStrExt;
    let path = PathBuf::from(OsStr::from_bytes(b"/videos/\xff\xfe.mp4"));
    assert!(generate_thumbnail_name(&path).is_err());
}

#[test]
fn path_without_file_stem_reports_error() {
    assert!(generate_thumbnail_name(Path::new(""))
        .unwrap_err()
        .contains("file stem"));
}

#[test]
fn thumbnail_name_handles_unicode_and_preserves_file_stem() {
    let path = Path::new("/videos/café 雨.mov");
    let name = generate_thumbnail_name(path).unwrap();
    assert!(name.starts_with("café 雨-"));
    assert!(name.ends_with(".png"));
}

#[test]
fn only_nonempty_existing_files_are_valid_thumbnails() {
    let tmp = TempDir::new();
    let path = tmp.path().join("thumbnail.png");
    assert!(!is_valid_thumbnail(&path));
    fs::write(&path, []).unwrap();
    assert!(!is_valid_thumbnail(&path));
    fs::write(&path, b"data").unwrap();
    assert!(is_valid_thumbnail(&path));

    let directory = tmp.path().join("thumbnail-directory.png");
    fs::create_dir(&directory).unwrap();
    assert!(!is_valid_thumbnail(&directory));
}

#[test]
fn forced_regeneration_bypasses_a_valid_existing_thumbnail() {
    let tmp = TempDir::new();
    let path = tmp.path().join("thumbnail.png");
    fs::write(&path, b"data").unwrap();
    assert!(should_reuse_thumbnail(&path, false));
    assert!(!should_reuse_thumbnail(&path, true));
}

#[test]
fn thumbnail_directory_creation_failure_is_reported() {
    let tmp = TempDir::new();
    let file = tmp.path().join("already-a-file");
    fs::write(&file, b"data").unwrap();
    let result = tauri::async_runtime::block_on(generate_thumb_in_directory(
        tmp.path().join("missing-video.mp4").display().to_string(),
        file.join("impossible"),
        false,
    ));
    assert!(result
        .unwrap_err()
        .starts_with("Failed to create thumbnails directory:"));
}

#[test]
fn failed_generation_preserves_the_previous_thumbnail() {
    let tmp = TempDir::new();
    let video = tmp.path().join("missing-video.mp4");
    let thumbnail_name = generate_thumbnail_name(&video).unwrap();
    let thumbnail = tmp.path().join(thumbnail_name);
    fs::write(&thumbnail, b"previous-preview").unwrap();

    let result = tauri::async_runtime::block_on(generate_thumb_in_directory(
        video.display().to_string(),
        tmp.path().to_path_buf(),
        true,
    ));

    assert!(result.is_err());
    assert_eq!(fs::read(&thumbnail).unwrap(), b"previous-preview");
    assert_eq!(
        fs::read_dir(tmp.path())
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_name().to_string_lossy().starts_with('.'))
            .count(),
        0
    );
}

#[cfg(unix)]
#[test]
fn redirected_thumbnail_directory_is_rejected_before_generation() {
    let tmp = TempDir::new();
    let target = tmp.path().join("outside");
    let thumbnails = tmp.path().join("thumbnails");
    fs::create_dir(&target).unwrap();
    std::os::unix::fs::symlink(&target, &thumbnails).unwrap();

    let result = tauri::async_runtime::block_on(generate_thumb_in_directory(
        tmp.path().join("video.mp4").display().to_string(),
        thumbnails,
        false,
    ));

    assert!(result.unwrap_err().contains("redirected"));
    assert_eq!(fs::read_dir(&target).unwrap().count(), 0);
}

#[test]
fn bounded_command_runner_reports_spawn_failure() {
    assert_eq!(
        run_command_with_timeout(
            "wallpaper-picker-ui-command-that-does-not-exist",
            &[],
            Duration::from_millis(50),
        ),
        None
    );
}

#[test]
fn bounded_command_runner_kills_a_timed_out_process() {
    #[cfg(unix)]
    let (program, args) = ("sh", vec!["-c", "sleep 1"]);
    #[cfg(windows)]
    let (program, args) = ("cmd", vec!["/C", "ping 127.0.0.1 -n 3 > NUL"]);

    assert_eq!(
        run_command_with_timeout(program, &args, Duration::from_millis(50)),
        Some(false)
    );
}

#[test]
#[ignore = "requires a real ffmpeg installation"]
fn real_short_video_uses_the_first_frame_fallback_and_publishes_png() {
    let _lock = PROCESS_ENV_LOCK.lock().unwrap();
    let tmp = TempDir::new();
    let media = tmp.path().join("media");
    let thumbnails = tmp.path().join("thumbnails");
    fs::create_dir(&media).unwrap();
    let video = create_short_video(&media);

    let result = tauri::async_runtime::block_on(generate_thumb_in_directory(
        video.display().to_string(),
        thumbnails.clone(),
        true,
    ));

    let thumbnail = PathBuf::from(result.expect("short video should generate a thumbnail"));
    assert!(thumbnail.is_file());
    assert!(fs::metadata(&thumbnail).unwrap().len() > 0);
    assert_png(&thumbnail);
    assert_no_temporary_thumbnails(&thumbnails);
}

#[test]
#[ignore = "requires a real ffmpeg installation"]
fn real_malformed_media_fails_without_publishing_partial_output() {
    let _lock = PROCESS_ENV_LOCK.lock().unwrap();
    let tmp = TempDir::new();
    let video = tmp.path().join("malformed.mp4");
    let thumbnails = tmp.path().join("thumbnails");
    fs::write(&video, b"not a valid media file").unwrap();

    let expected_thumbnail = thumbnails.join(generate_thumbnail_name(&video).unwrap());
    let result = tauri::async_runtime::block_on(generate_thumb_in_directory(
        video.display().to_string(),
        thumbnails.clone(),
        true,
    ));

    assert!(result.is_err());
    assert!(!expected_thumbnail.exists());
    assert_no_temporary_thumbnails(&thumbnails);
}

#[test]
#[ignore = "requires a real ffmpeg installation"]
fn real_empty_media_fails_without_publishing_partial_output() {
    let _lock = PROCESS_ENV_LOCK.lock().unwrap();
    let tmp = TempDir::new();
    let video = tmp.path().join("empty.mp4");
    let thumbnails = tmp.path().join("thumbnails");
    fs::write(&video, []).unwrap();

    let expected_thumbnail = thumbnails.join(generate_thumbnail_name(&video).unwrap());
    let result = tauri::async_runtime::block_on(generate_thumb_in_directory(
        video.display().to_string(),
        thumbnails.clone(),
        true,
    ));

    assert!(result.is_err());
    assert!(!expected_thumbnail.exists());
    assert_no_temporary_thumbnails(&thumbnails);
}

#[test]
#[ignore = "requires a real ffmpeg installation"]
fn missing_ffmpeg_executable_fails_closed_before_thumbnail_generation() {
    let _lock = PROCESS_ENV_LOCK.lock().unwrap();
    let tmp = TempDir::new();
    let video = tmp.path().join("video.mp4");
    let thumbnails = tmp.path().join("thumbnails");
    fs::write(&video, b"input is irrelevant when ffmpeg is unavailable").unwrap();

    let previous_path = std::env::var_os("PATH");
    std::env::set_var("PATH", tmp.path());
    let result = tauri::async_runtime::block_on(generate_thumb_in_directory(
        video.display().to_string(),
        thumbnails.clone(),
        true,
    ));
    match previous_path {
        Some(path) => std::env::set_var("PATH", path),
        None => std::env::remove_var("PATH"),
    }

    let error = result.unwrap_err();
    assert!(error.contains("ffmpeg was not found on PATH"));
    assert!(thumbnails.is_dir());
    assert_eq!(fs::read_dir(thumbnails).unwrap().count(), 0);
}
