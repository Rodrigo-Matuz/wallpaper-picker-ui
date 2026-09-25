use std::process::Command;
use std::thread;

/// Executes the wallpaper command detached from the app.
///
/// - Unix: runs through `sh -c "nohup … >/dev/null 2>&1 &"` (original behavior).
/// - Windows: runs through `cmd /C` with `DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP`
///   so no console window flashes and the process outlives the app.
#[cfg(unix)]
fn run_detached(full_command: &str) {
    let output = Command::new("sh")
        .arg("-c")
        .arg(format!("nohup {} > /dev/null 2>&1 &", full_command))
        .output();

    match output {
        Ok(output) => {
            if !output.stdout.is_empty() {
                eprintln!("stdout: {}", String::from_utf8_lossy(&output.stdout));
            }
            if !output.stderr.is_empty() {
                eprintln!("stderr: {}", String::from_utf8_lossy(&output.stderr));
            }
        }
        Err(e) => eprintln!("Failed to execute command: {}", e),
    }
}

#[cfg(windows)]
fn run_detached(full_command: &str) {
    use std::os::windows::process::CommandExt;

    // DETACHED_PROCESS: no console window; CREATE_NEW_PROCESS_GROUP: own process group
    const DETACHED_PROCESS: u32 = 0x0000_0008;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;

    if let Err(e) = Command::new("cmd")
        .args(["/C", full_command])
        .creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP)
        .spawn()
    {
        eprintln!("Failed to execute command: {}", e);
    }
}

#[tauri::command]
pub fn send_command(command: String, path: String) -> String {
    let full_command = command.replace("$VP", &format!("\"{}\"", path));

    thread::spawn(move || run_detached(&full_command));

    "Command is running in the background".to_string()
}