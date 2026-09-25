use std::process::Command;

/// Executes the wallpaper command detached from the app.
///
/// - Unix: runs through `sh -c "nohup … >/dev/null 2>&1 &"` (original behavior).
/// - Windows: runs through `cmd /C` with `DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP`
///   so no console window flashes and the process outlives the app.
///
/// Returns `Err` when the process could not be started at all (e.g. `sh`/`cmd`
/// missing) so the frontend can surface the failure to the user. A successful
/// spawn does not guarantee the wallpaper tool itself succeeds — output is
/// intentionally discarded (user-script trust model, see README).
#[cfg(unix)]
fn run_detached(full_command: &str) -> Result<(), String> {
    let output = Command::new("sh")
        .arg("-c")
        .arg(format!("nohup {} > /dev/null 2>&1 &", full_command))
        .output()
        .map_err(|e| format!("Failed to execute command: {}", e))?;

    if !output.stdout.is_empty() {
        eprintln!("stdout: {}", String::from_utf8_lossy(&output.stdout));
    }
    if !output.stderr.is_empty() {
        eprintln!("stderr: {}", String::from_utf8_lossy(&output.stderr));
    }

    Ok(())
}

#[cfg(windows)]
fn run_detached(full_command: &str) -> Result<(), String> {
    use std::os::windows::process::CommandExt;

    // DETACHED_PROCESS: no console window; CREATE_NEW_PROCESS_GROUP: own process group
    const DETACHED_PROCESS: u32 = 0x0000_0008;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;

    Command::new("cmd")
        .args(["/C", full_command])
        .creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to execute command: {}", e))
}

/// Sends the user's wallpaper command for the selected video.
///
/// `$VP` in the configured command is replaced with the quoted video path.
/// The command runs detached (via `spawn_blocking`) so the UI never blocks;
/// only spawn failures (cannot start the shell) are reported back as `Err`.
#[tauri::command]
pub async fn send_command(command: String, path: String) -> Result<String, String> {
    let full_command = command.replace("$VP", &format!("\"{}\"", path));

    tauri::async_runtime::spawn_blocking(move || run_detached(&full_command))
        .await
        .map_err(|e| e.to_string())??;

    Ok("Command is running in the background".to_string())
}