//! Unit tests for the thumbnail naming/hash logic.
//!
//! Kept separate from the production code (generate_thumbnails.rs).

use super::*;
use std::path::PathBuf;

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