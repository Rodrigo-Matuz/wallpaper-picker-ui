use colored::*;

#[tauri::command]
pub fn log_message(level: String, message: String) {
    match level.as_str() {
        "info" => println!("{}", message),
        "warn" => println!("{}", message.yellow()),
        "error" => println!("{}", message.red()),
        "positive" => println!("{}", message.green()),
        _ => println!("{}", message),
    }
}
