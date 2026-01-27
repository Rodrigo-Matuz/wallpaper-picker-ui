use std::process::Command;
use std::thread;

#[tauri::command]
pub fn send_command(command: String, path: String) -> String {
    let full_command = command.replace("$VP", &format!("\"{}\"", path));

    thread::spawn(move || {
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
    });

    "Command is running in the background".to_string()
}
