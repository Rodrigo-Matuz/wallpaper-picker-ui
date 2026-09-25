#[cfg(unix)]
use std::process::Command;

#[tauri::command]
pub async fn select_folder() -> Result<String, String> {
    #[cfg(unix)]
    {
        tauri::async_runtime::spawn_blocking(|| {
            let output = Command::new("zenity")
                .arg("--file-selection")
                .arg("--directory")
                .arg("--title")
                .arg("Select the folder containing your wallpapers")
                .output()
                .map_err(|e| e.to_string())?;

            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    return Ok(path);
                }
            }

            Ok(String::new())
        })
        .await
        .map_err(|e| e.to_string())?
    }

    #[cfg(windows)]
    {
        tauri::async_runtime::spawn_blocking(|| {
            let picked = rfd::FileDialog::new()
                .set_title("Select the folder containing your wallpapers")
                .pick_folder();

            Ok(picked
                .map(|path| path.display().to_string())
                .unwrap_or_default())
        })
        .await
        .map_err(|e| e.to_string())?
    }
}

// use std::process::Command;
// #[tauri::command]
// pub fn select_folder() -> String {
//     let output = Command::new("zenity")
//         .arg("--file-selection")
//         .arg("--directory")
//         .arg("--title")
//         .arg("Select a folder")
//         .arg("--text")
//         .arg("Please select the folder containig your wallpapers")
//         .output()
//         .expect("Failed to execute Zenity");
//     if output.status.success() {
//         let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
//         if !path.is_empty() {
//             return path;
//         }
//     }
//     String::from("")
// }