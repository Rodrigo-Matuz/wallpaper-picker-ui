use super::mpv_arguments;
use std::ffi::OsString;

#[test]
fn mpv_arguments_keep_the_video_path_as_a_separate_argument() {
    let path = r"C:\Wallpapers\quiet sunset & rain.mp4";
    let arguments = mpv_arguments(path);

    assert_eq!(arguments.last(), Some(&OsString::from(path)));
    assert!(arguments.contains(&OsString::from("--no-audio")));
    assert!(arguments.contains(&OsString::from("--loop-file=inf")));
}

#[test]
fn mpv_arguments_do_not_use_a_shell_wrapper() {
    let arguments = mpv_arguments("wallpaper.mp4");

    assert!(!arguments.iter().any(|argument| argument == "cmd"));
    assert!(!arguments.iter().any(|argument| argument == "/C"));
    assert!(!arguments.iter().any(|argument| argument == "sh"));
}
