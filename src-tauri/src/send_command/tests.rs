use super::substitute_video_path;

#[test]
fn replaces_every_placeholder_with_double_quoted_path() {
    assert_eq!(
        substitute_video_path("player $VP --again $VP", "/videos/a b.mp4"),
        "player \"/videos/a b.mp4\" --again \"/videos/a b.mp4\""
    );
}

#[test]
fn leaves_command_without_placeholder_unchanged() {
    assert_eq!(
        substitute_video_path("player --list", "/a.mp4"),
        "player --list"
    );
}

#[test]
fn empty_path_and_adjacent_placeholders_keep_original_replacement_semantics() {
    assert_eq!(substitute_video_path("$VP$VP", ""), "\"\"\"\"");
}

#[test]
fn partial_placeholder_does_not_match() {
    assert_eq!(substitute_video_path("$V $vp", "file"), "$V $vp");
}

#[cfg(unix)]
#[test]
fn detached_no_op_reports_success() {
    let result =
        tauri::async_runtime::block_on(super::send_command(": $VP".into(), "unused".into()));
    assert_eq!(result.unwrap(), "Command is running in the background");
}
