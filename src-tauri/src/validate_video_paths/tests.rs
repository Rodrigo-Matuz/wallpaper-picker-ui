use super::validate_video_paths;
use crate::test_support::TempDir;
use std::fs;

#[test]
fn retains_only_regular_files_in_input_order_including_duplicates() {
    let tmp = TempDir::new();
    let first = tmp.path().join("first.mp4");
    let second = tmp.path().join("second.mp4");
    let folder = tmp.path().join("folder.mp4");
    fs::write(&first, []).unwrap();
    fs::write(&second, b"video").unwrap();
    fs::create_dir(&folder).unwrap();
    let inputs = vec![
        second.display().to_string(),
        folder.display().to_string(),
        first.display().to_string(),
        tmp.path().join("missing.mp4").display().to_string(),
        second.display().to_string(),
    ];
    let actual = tauri::async_runtime::block_on(validate_video_paths(inputs.clone())).unwrap();
    assert_eq!(
        actual,
        vec![inputs[0].clone(), inputs[2].clone(), inputs[4].clone()]
    );
}

#[test]
fn empty_list_returns_empty_list() {
    assert!(tauri::async_runtime::block_on(validate_video_paths(vec![]))
        .unwrap()
        .is_empty());
}

#[test]
fn deleted_file_is_not_retained() {
    let tmp = TempDir::new();
    let video = tmp.path().join("gone.mp4");
    fs::write(&video, b"video").unwrap();
    fs::remove_file(&video).unwrap();
    assert!(
        tauri::async_runtime::block_on(validate_video_paths(vec![video.display().to_string()]))
            .unwrap()
            .is_empty()
    );
}

#[cfg(unix)]
#[test]
fn valid_symlink_is_kept_but_dangling_symlink_is_rejected() {
    use std::os::unix::fs::symlink;
    let tmp = TempDir::new();
    let target = tmp.path().join("video.mp4");
    fs::write(&target, b"data").unwrap();
    let valid = tmp.path().join("valid.mp4");
    let dangling = tmp.path().join("dangling.mp4");
    symlink(&target, &valid).unwrap();
    symlink(tmp.path().join("missing.mp4"), &dangling).unwrap();
    assert_eq!(
        tauri::async_runtime::block_on(validate_video_paths(vec![
            valid.display().to_string(),
            dangling.display().to_string()
        ]))
        .unwrap(),
        vec![valid.display().to_string()]
    );
}
