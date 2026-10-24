use super::get_videos_list;
use crate::test_support::TempDir;
use std::fs;
use std::path::Path;

fn listed(root: &Path) -> Result<Vec<String>, String> {
    tauri::async_runtime::block_on(get_videos_list(root.display().to_string()))
}

#[test]
fn recursively_lists_supported_extensions_but_not_unrelated_files_or_directories() {
    let tmp = TempDir::new();
    let nested = tmp.path().join("nested");
    fs::create_dir(&nested).unwrap();
    let expected = ["a.mp4", "b.mkv", "c.avi", "d.mov", "e.wmv"];
    for name in expected {
        fs::write(nested.join(name), b"").unwrap();
    }
    fs::write(nested.join("not-video.txt"), b"").unwrap();
    fs::create_dir(nested.join("directory.mp4")).unwrap();
    let mut actual = listed(tmp.path()).unwrap();
    actual.sort();
    let mut wanted: Vec<_> = expected
        .iter()
        .map(|name| nested.join(name).display().to_string())
        .collect();
    wanted.sort();
    assert_eq!(actual, wanted);
}

#[test]
fn ignores_hidden_and_system_directories_but_keeps_visible_siblings() {
    let tmp = TempDir::new();
    for name in [
        ".hidden",
        "$RECYCLE.BIN",
        "System Volume Information",
        "lost+found",
        "proc",
        "sys",
        "dev",
        "run",
    ] {
        let dir = tmp.path().join(name);
        fs::create_dir(&dir).unwrap();
        fs::write(dir.join("skip.mp4"), b"").unwrap();
    }
    let visible = tmp.path().join("visible");
    fs::create_dir(&visible).unwrap();
    fs::write(visible.join("keep.mp4"), b"").unwrap();
    fs::write(tmp.path().join(".secret.mp4"), b"").unwrap();
    assert_eq!(
        listed(tmp.path()).unwrap(),
        vec![visible.join("keep.mp4").display().to_string()]
    );
}

#[test]
fn extension_matching_is_case_sensitive() {
    let tmp = TempDir::new();
    fs::write(tmp.path().join("upper.MP4"), b"").unwrap();
    fs::write(tmp.path().join("double.mp4.bak"), b"").unwrap();
    fs::write(tmp.path().join("lower.mp4"), b"").unwrap();
    assert_eq!(
        listed(tmp.path()).unwrap(),
        vec![tmp.path().join("lower.mp4").display().to_string()]
    );
}

#[test]
fn nonexistent_directory_returns_an_error_instead_of_a_partial_scan() {
    let tmp = TempDir::new();
    let error = listed(&tmp.path().join("absent")).unwrap_err();
    assert!(error.contains("Failed to scan wallpaper directory"));
}

#[test]
fn hidden_root_itself_is_still_scanned() {
    let tmp = TempDir::new();
    let root = tmp.path().join(".wallpapers");
    fs::create_dir(&root).unwrap();
    fs::write(root.join("visible.mp4"), b"").unwrap();
    assert_eq!(
        listed(&root).unwrap(),
        vec![root.join("visible.mp4").display().to_string()]
    );
}
