use super::recover_thumbnails_from_directory;
use crate::generate_thumbnails::generate_thumbnail_name;
use crate::test_support::TempDir;
use std::fs;

#[test]
fn restores_only_existing_nonempty_previews_without_generating() {
    let tmp = TempDir::new();
    let videos = tmp.path().join("videos");
    let thumbs = tmp.path().join("thumbnails");
    fs::create_dir(&videos).unwrap();
    fs::create_dir(&thumbs).unwrap();
    let saved_video = videos.join("cached.mp4");
    let missing_video = videos.join("new.mp4");
    let empty_video = videos.join("empty.mp4");
    for video in [&saved_video, &missing_video, &empty_video] {
        fs::write(video, b"video").unwrap();
    }
    let saved_name = generate_thumbnail_name(&saved_video).unwrap();
    fs::write(thumbs.join(&saved_name), b"image").unwrap();
    fs::write(
        thumbs.join(generate_thumbnail_name(&empty_video).unwrap()),
        [],
    )
    .unwrap();
    fs::write(thumbs.join("unmatched.png"), b"orphan").unwrap();
    let recovered = tauri::async_runtime::block_on(recover_thumbnails_from_directory(
        videos.display().to_string(),
        thumbs.clone(),
    ))
    .unwrap();
    assert_eq!(recovered.len(), 1);
    assert_eq!(
        recovered.get(&saved_name),
        Some(&saved_video.display().to_string())
    );
    assert!(!thumbs
        .join(generate_thumbnail_name(&missing_video).unwrap())
        .exists());
}

#[test]
fn no_cached_files_skips_video_directory_scan() {
    let tmp = TempDir::new();
    let recovered = tauri::async_runtime::block_on(recover_thumbnails_from_directory(
        "/nonexistent-videos".into(),
        tmp.path().join("missing-thumbnails"),
    ))
    .unwrap();
    assert!(recovered.is_empty());
}

#[test]
fn cached_directory_entry_errors_are_reported() {
    let entries: Vec<Result<fs::DirEntry, std::io::Error>> =
        vec![Err(std::io::Error::other("entry unavailable"))];

    let error = super::collect_cached_thumbnail_names(entries).unwrap_err();

    assert!(error.contains("Failed to read cached thumbnail entry"));
    assert!(error.contains("entry unavailable"));
}

#[cfg(unix)]
#[test]
fn recovery_rejects_a_redirected_thumbnail_directory() {
    let tmp = TempDir::new();
    let target = tmp.path().join("outside");
    let thumbnails = tmp.path().join("thumbnails");
    fs::create_dir(&target).unwrap();
    std::os::unix::fs::symlink(&target, &thumbnails).unwrap();

    let result = tauri::async_runtime::block_on(recover_thumbnails_from_directory(
        tmp.path().display().to_string(),
        thumbnails,
    ));

    assert!(result.unwrap_err().contains("redirected"));
}
