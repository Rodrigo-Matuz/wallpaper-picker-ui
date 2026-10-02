use super::cleanup_thumbnails;
use crate::test_support::TempDir;
use std::fs;
use std::path::Path;

fn cleanup(path: &Path, keep: &[&str]) -> usize {
    tauri::async_runtime::block_on(cleanup_thumbnails(
        path.display().to_string(),
        keep.iter().map(|s| (*s).to_owned()).collect(),
    ))
    .unwrap()
}

#[test]
fn removes_only_unkept_files_and_counts_successful_removals() {
    let tmp = TempDir::new();
    for name in ["keep.png", "old.png", "old-scheme.jpg"] {
        fs::write(tmp.path().join(name), b"data").unwrap();
    }
    assert_eq!(cleanup(tmp.path(), &["keep.png", "keep.png"]), 2);
    assert!(tmp.path().join("keep.png").exists());
    assert!(!tmp.path().join("old.png").exists());
    assert!(!tmp.path().join("old-scheme.jpg").exists());
    assert_eq!(cleanup(tmp.path(), &["keep.png"]), 0);
}

#[test]
fn leaves_subdirectories_and_their_contents_untouched() {
    let tmp = TempDir::new();
    let nested = tmp.path().join("nested");
    fs::create_dir(&nested).unwrap();
    fs::write(nested.join("orphan.png"), b"data").unwrap();
    assert_eq!(cleanup(tmp.path(), &[]), 0);
    assert!(nested.join("orphan.png").exists());
}

#[test]
fn absent_directory_is_a_no_op() {
    let tmp = TempDir::new();
    assert_eq!(cleanup(&tmp.path().join("missing"), &[]), 0);
}

#[test]
fn keep_list_matches_file_name_not_full_path() {
    let tmp = TempDir::new();
    let thumbnail = tmp.path().join("one.png");
    fs::write(&thumbnail, b"data").unwrap();
    assert_eq!(cleanup(tmp.path(), &[&thumbnail.display().to_string()]), 1);
    assert!(!thumbnail.exists());
}

#[cfg(unix)]
#[test]
fn non_utf8_file_name_is_left_untouched() {
    use std::ffi::OsStr;
    use std::os::unix::ffi::OsStrExt;
    let tmp = TempDir::new();
    let thumbnail = tmp.path().join(OsStr::from_bytes(b"\xff.png"));
    fs::write(&thumbnail, b"data").unwrap();
    assert_eq!(cleanup(tmp.path(), &[]), 0);
    assert!(thumbnail.exists());
}
