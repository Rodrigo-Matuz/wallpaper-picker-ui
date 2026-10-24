use super::substitute_video_path;

#[test]
fn replaces_every_placeholder_with_a_platform_safe_path() {
    let result = substitute_video_path("player $VP --again $VP", "/videos/a b.mp4").unwrap();

    #[cfg(unix)]
    assert_eq!(
        result,
        "player \"${WALLPAPER_PICKER_UI_VIDEO_PATH}\" --again \"${WALLPAPER_PICKER_UI_VIDEO_PATH}\""
    );

    #[cfg(windows)]
    assert_eq!(
        result,
        r#"player "%WALLPAPER_PICKER_UI_VIDEO_PATH%" --again "%WALLPAPER_PICKER_UI_VIDEO_PATH%""#
    );
}

#[test]
fn leaves_command_without_placeholder_unchanged() {
    assert_eq!(
        substitute_video_path("player --list", "/a.mp4").unwrap(),
        "player --list"
    );
}

#[test]
fn empty_path_and_adjacent_placeholders_keep_original_replacement_semantics() {
    #[cfg(unix)]
    assert_eq!(
        substitute_video_path("$VP$VP", "").unwrap(),
        "\"${WALLPAPER_PICKER_UI_VIDEO_PATH}\"\"${WALLPAPER_PICKER_UI_VIDEO_PATH}\""
    );

    #[cfg(windows)]
    assert_eq!(
        substitute_video_path("$VP$VP", "").unwrap(),
        r#""%WALLPAPER_PICKER_UI_VIDEO_PATH%""%WALLPAPER_PICKER_UI_VIDEO_PATH%""#
    );
}

#[test]
fn partial_placeholder_does_not_match() {
    assert_eq!(substitute_video_path("$V $vp", "file").unwrap(), "$V $vp");
}

#[cfg(unix)]
#[test]
fn unix_placeholder_inside_double_quotes_reuses_the_existing_quote_boundary() {
    assert_eq!(
        substitute_video_path("player \"$VP\"", "/videos/a b'c$(touch p).mp4").unwrap(),
        "player \"${WALLPAPER_PICKER_UI_VIDEO_PATH}\""
    );
}

#[cfg(unix)]
#[test]
fn unix_placeholder_inside_single_quotes_is_rejected() {
    let error = substitute_video_path("player '$VP'", "/videos/a$(touch p).mp4").unwrap_err();
    assert!(error.contains("single-quoted"));
}

#[cfg(unix)]
#[test]
fn unix_escaped_placeholder_is_not_substituted() {
    assert_eq!(
        substitute_video_path(r#"player \$VP"#, "/videos/a b.mp4").unwrap(),
        r#"player \$VP"#
    );
}

#[cfg(windows)]
#[test]
fn windows_paths_are_not_inserted_into_command_source() {
    assert_eq!(
        substitute_video_path("player $VP", r#"C:\Wallpapers\a b&c^d%e!.mp4"#).unwrap(),
        r#"player "%WALLPAPER_PICKER_UI_VIDEO_PATH%""#
    );
}

#[cfg(windows)]
#[test]
fn windows_placeholder_inside_double_quotes_reuses_the_existing_quote_boundary() {
    assert_eq!(
        substitute_video_path("player \"$VP\"", r#"C:\Wallpapers\a&b.mp4"#).unwrap(),
        r#"player "%WALLPAPER_PICKER_UI_VIDEO_PATH%""#
    );
}

#[cfg(windows)]
#[test]
fn windows_command_passes_metacharacters_and_repeated_spaces_as_one_argument() {
    let path = r#"C:\Wallpapers\a  b&c^d%e!.mp4"#;
    let command = super::substitute_video_path("echo $VP", path).unwrap();
    let output = super::build_windows_command(&command, path)
        .output()
        .expect("cmd.exe should start");

    assert!(output.status.success());
    assert_eq!(
        String::from_utf8_lossy(&output.stdout).trim_end(),
        format!(r#""{path}""#)
    );
}

#[cfg(unix)]
#[test]
fn detached_no_op_reports_success() {
    let result =
        tauri::async_runtime::block_on(super::send_command(": $VP".into(), "unused".into()));
    assert_eq!(result.unwrap(), "Command is running in the background");
}
