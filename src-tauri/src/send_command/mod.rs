use std::process::Command;

/// The selected path is passed as data through a private child-process
/// environment variable. It is never inserted into the shell command text.
const VIDEO_PATH_ENV: &str = "WALLPAPER_PICKER_UI_VIDEO_PATH";

#[derive(Clone, Copy, PartialEq, Eq)]
enum QuoteState {
    Unquoted,
    #[cfg(unix)]
    Single,
    Double,
}

fn placeholder_replacement(state: QuoteState) -> Result<String, String> {
    #[cfg(unix)]
    {
        if state == QuoteState::Single {
            return Err(
                "$VP cannot be used inside a single-quoted shell string; remove the single quotes so the selected path can be passed as data".to_string(),
            );
        }

        return Ok(if state == QuoteState::Double {
            format!("${{{VIDEO_PATH_ENV}}}")
        } else {
            format!("\"${{{VIDEO_PATH_ENV}}}\"")
        });
    }

    #[cfg(windows)]
    {
        return Ok(if state == QuoteState::Double {
            format!("%{VIDEO_PATH_ENV}%")
        } else {
            format!("\"%{VIDEO_PATH_ENV}%\"")
        });
    }

    #[allow(unreachable_code)]
    Err("$VP substitution is unsupported on this platform".to_string())
}

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
fn run_detached(full_command: &str, video_path: &str) -> Result<(), String> {
    let output = Command::new("sh")
        .env(VIDEO_PATH_ENV, video_path)
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
fn build_windows_command(full_command: &str, video_path: &str) -> Command {
    use std::os::windows::process::CommandExt;

    let mut command = Command::new("cmd");
    command.env(VIDEO_PATH_ENV, video_path);
    // `raw_arg` is intentional: normal `args` escaping turns the quotes
    // around the environment-variable reference into literal backslashes
    // before `cmd.exe` parses the `/C` command line.
    command.raw_arg(format!("/C {full_command}"));
    command
}

#[cfg(windows)]
fn run_detached(full_command: &str, video_path: &str) -> Result<(), String> {
    use std::os::windows::process::CommandExt;

    // DETACHED_PROCESS: no console window; CREATE_NEW_PROCESS_GROUP: own process group
    const DETACHED_PROCESS: u32 = 0x0000_0008;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;

    build_windows_command(full_command, video_path)
        .creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to execute command: {}", e))
}

/// Substitutes every `$VP` with a quoted reference to the private path
/// environment variable. The replacement respects shell quote context:
/// unquoted placeholders receive their own quotes, while placeholders already
/// inside double quotes reuse those quotes. Unix single-quoted placeholders
/// are rejected because their contents cannot safely carry external data.
fn substitute_video_path(command: &str, _path: &str) -> Result<String, String> {
    let chars: Vec<char> = command.chars().collect();
    let mut result = String::with_capacity(command.len());
    let mut state = QuoteState::Unquoted;
    let mut index = 0;

    while index < chars.len() {
        #[cfg(unix)]
        if state != QuoteState::Single
            && chars[index] == '\\'
            && chars.get(index + 1) == Some(&'$')
            && chars.get(index + 2) == Some(&'V')
            && chars.get(index + 3) == Some(&'P')
        {
            result.push('\\');
            result.push('$');
            result.push('V');
            result.push('P');
            index += 4;
            continue;
        }

        if chars[index] == '$'
            && chars.get(index + 1) == Some(&'V')
            && chars.get(index + 2) == Some(&'P')
        {
            result.push_str(&placeholder_replacement(state)?);
            index += 3;
            continue;
        }

        let current = chars[index];
        result.push(current);

        #[cfg(unix)]
        {
            // Backslash has no escaping meaning inside a POSIX single-quoted
            // string. Elsewhere, copy an escaped pair unchanged so an escaped
            // quote cannot alter context or an escaped `$VP` become a token.
            if state == QuoteState::Single {
                if current == '\'' {
                    state = QuoteState::Unquoted;
                }
            } else {
                if current == '\\' && index + 1 < chars.len() {
                    result.push(chars[index + 1]);
                    index += 2;
                    continue;
                }
                match state {
                    QuoteState::Unquoted if current == '\'' => state = QuoteState::Single,
                    QuoteState::Unquoted if current == '"' => state = QuoteState::Double,
                    QuoteState::Double if current == '"' => state = QuoteState::Unquoted,
                    _ => {}
                }
            }
        }

        #[cfg(windows)]
        {
            // `cmd.exe` does not treat single quotes as delimiters. Carets
            // escape the next character in the command source.
            if current == '^' && index + 1 < chars.len() {
                result.push(chars[index + 1]);
                index += 2;
                continue;
            }
            if current == '"' {
                state = if state == QuoteState::Double {
                    QuoteState::Unquoted
                } else {
                    QuoteState::Double
                };
            }
        }

        index += 1;
    }

    Ok(result)
}

/// Sends the user's wallpaper command for the selected video.
///
/// `$VP` in the configured command is replaced with a platform-safe video
/// path. The command runs detached (via `spawn_blocking`) so the UI never
/// blocks; only spawn failures (cannot start the shell) are reported back as
/// `Err`.
#[tauri::command]
pub async fn send_command(command: String, path: String) -> Result<String, String> {
    let full_command = substitute_video_path(&command, &path)?;

    tauri::async_runtime::spawn_blocking(move || run_detached(&full_command, &path))
        .await
        .map_err(|e| e.to_string())??;

    Ok("Command is running in the background".to_string())
}

#[cfg(test)]
mod tests;
