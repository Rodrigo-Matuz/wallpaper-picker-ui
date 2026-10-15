#[cfg(any(windows, test))]
use std::ffi::OsString;

/// Arguments shared by the Windows player backend and its contract tests.
///
/// The video path is passed as a separate process argument rather than being
/// interpolated into a shell command. This keeps paths with spaces and shell
/// metacharacters safe.
#[cfg(any(windows, test))]
pub(crate) fn mpv_arguments(video_path: &str) -> Vec<OsString> {
    [
        "--force-window=immediate",
        "--no-terminal",
        "--no-audio",
        "--loop-file=inf",
        "--no-border",
        "--no-osc",
        "--osd-level=0",
        "--input-default-bindings=no",
        "--keep-open=no",
        video_path,
    ]
    .into_iter()
    .map(OsString::from)
    .collect()
}

#[cfg(windows)]
mod native;

#[cfg(windows)]
pub use native::{start_windows_playback, stop_windows_playback, stop_windows_playback_sync};

#[cfg(not(windows))]
#[tauri::command]
pub async fn start_windows_playback(_video_path: String) -> Result<String, String> {
    Err("Windows playback is only available on Windows".to_string())
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn stop_windows_playback() -> Result<(), String> {
    Ok(())
}

#[cfg(not(windows))]
pub fn stop_windows_playback_sync() {}

#[cfg(test)]
mod tests;
