use super::mpv_arguments;
use std::{
    path::Path,
    process::{Child, Command},
    sync::{Mutex, OnceLock},
    thread,
    time::Duration,
};
use windows_sys::Win32::{
    Foundation::{GetLastError, SetLastError, BOOL, HWND, LPARAM},
    UI::WindowsAndMessaging::{
        EnumWindows, FindWindowExW, FindWindowW, GetSystemMetrics, GetWindowLongPtrW,
        GetWindowThreadProcessId, IsWindowVisible, SendMessageTimeoutW, SetParent,
        SetWindowLongPtrW, SetWindowPos, ShowWindow, GWL_EXSTYLE, GWL_STYLE, HWND_BOTTOM,
        SMTO_NORMAL, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SWP_NOACTIVATE, SWP_NOOWNERZORDER,
        SWP_SHOWWINDOW, SW_SHOWNOACTIVATE, WS_CAPTION, WS_CHILD, WS_CLIPCHILDREN, WS_CLIPSIBLINGS,
        WS_EX_APPWINDOW, WS_EX_TOPMOST, WS_MAXIMIZEBOX, WS_MINIMIZEBOX, WS_POPUP, WS_SYSMENU,
        WS_THICKFRAME, WS_VISIBLE,
    },
};

const WORKER_W_MESSAGE: u32 = 0x052c;
const WINDOW_WAIT_ATTEMPTS: usize = 100;
const WINDOW_WAIT_STEP: Duration = Duration::from_millis(50);

struct PlaybackSession {
    child: Child,
}

static SESSION: OnceLock<Mutex<Option<PlaybackSession>>> = OnceLock::new();

fn session() -> &'static Mutex<Option<PlaybackSession>> {
    SESSION.get_or_init(|| Mutex::new(None))
}

#[tauri::command]
pub async fn start_windows_playback(video_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || start_sync(&video_path))
        .await
        .map_err(|error| format!("Windows playback worker failed: {error}"))?
}

#[tauri::command]
pub async fn stop_windows_playback() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(stop_windows_playback_sync)
        .await
        .map_err(|error| format!("Windows playback worker failed: {error}"))?;
    Ok(())
}

pub fn stop_windows_playback_sync() {
    let Ok(mut state) = session().lock() else {
        return;
    };
    stop_session(&mut state);
}

fn start_sync(video_path: &str) -> Result<String, String> {
    if !Path::new(video_path).is_file() {
        return Err("The selected wallpaper file does not exist".to_string());
    }

    let mut state = session()
        .lock()
        .map_err(|_| "Windows playback state is unavailable".to_string())?;
    stop_session(&mut state);

    let mut child = Command::new("mpv")
        .args(mpv_arguments(video_path))
        .spawn()
        .map_err(|error| format!("Could not start mpv: {error}"))?;

    let window = match wait_for_player_window(&mut child) {
        Ok(window) => window,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
    };

    if let Err(error) = attach_to_desktop(window) {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error);
    }

    *state = Some(PlaybackSession { child });
    Ok("Windows wallpaper playback started".to_string())
}

fn stop_session(state: &mut Option<PlaybackSession>) {
    let Some(mut playback) = state.take() else {
        return;
    };

    let _ = playback.child.kill();
    let _ = playback.child.wait();
}

fn wait_for_player_window(child: &mut Child) -> Result<HWND, String> {
    let process_id = child.id();
    for _ in 0..WINDOW_WAIT_ATTEMPTS {
        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("mpv exited before creating a window: {error}"))?
        {
            return Err(format!("mpv exited before creating a window ({status})"));
        }

        if let Some(window) = find_window_for_process(process_id) {
            return Ok(window);
        }
        thread::sleep(WINDOW_WAIT_STEP);
    }

    Err("Timed out waiting for the mpv window".to_string())
}

struct ProcessWindowSearch {
    process_id: u32,
    window: HWND,
}

unsafe extern "system" fn find_process_window(hwnd: HWND, parameter: LPARAM) -> BOOL {
    let search = unsafe { &mut *(parameter as *mut ProcessWindowSearch) };
    let mut process_id = 0;
    unsafe {
        GetWindowThreadProcessId(hwnd, &mut process_id);
    }

    if process_id == search.process_id && unsafe { IsWindowVisible(hwnd) } != 0 {
        search.window = hwnd;
        return 0;
    }
    1
}

fn find_window_for_process(process_id: u32) -> Option<HWND> {
    let mut search = ProcessWindowSearch {
        process_id,
        window: std::ptr::null_mut(),
    };
    unsafe {
        EnumWindows(
            Some(find_process_window),
            (&mut search as *mut ProcessWindowSearch).cast::<std::ffi::c_void>() as LPARAM,
        );
    }
    (!search.window.is_null()).then_some(search.window)
}

fn attach_to_desktop(window: HWND) -> Result<(), String> {
    let parent = desktop_parent()?;

    unsafe {
        SetLastError(0);
        SetParent(window, parent);
        let error = GetLastError();
        if error != 0 {
            return Err(format!("Could not attach mpv to the desktop ({error})"));
        }

        let style = GetWindowLongPtrW(window, GWL_STYLE) as u32;
        let borderless_child = (style | WS_CHILD | WS_VISIBLE | WS_CLIPCHILDREN | WS_CLIPSIBLINGS)
            & !(WS_POPUP
                | WS_CAPTION
                | WS_THICKFRAME
                | WS_SYSMENU
                | WS_MINIMIZEBOX
                | WS_MAXIMIZEBOX);
        SetWindowLongPtrW(window, GWL_STYLE, borderless_child as isize);

        let ex_style = GetWindowLongPtrW(window, GWL_EXSTYLE) as u32;
        SetWindowLongPtrW(
            window,
            GWL_EXSTYLE,
            (ex_style & !(WS_EX_APPWINDOW | WS_EX_TOPMOST)) as isize,
        );

        let width = GetSystemMetrics(SM_CXVIRTUALSCREEN);
        let height = GetSystemMetrics(SM_CYVIRTUALSCREEN);
        if width <= 0 || height <= 0 {
            return Err("Windows returned an invalid virtual desktop size".to_string());
        }

        if SetWindowPos(
            window,
            HWND_BOTTOM,
            0,
            0,
            width,
            height,
            SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_SHOWWINDOW,
        ) == 0
        {
            return Err("Could not size the mpv wallpaper window".to_string());
        }
        ShowWindow(window, SW_SHOWNOACTIVATE);
    }

    Ok(())
}

struct DesktopWindowSearch {
    worker: HWND,
}

unsafe extern "system" fn find_worker_window(hwnd: HWND, parameter: LPARAM) -> BOOL {
    let search = unsafe { &mut *(parameter as *mut DesktopWindowSearch) };
    let desktop_view = unsafe {
        FindWindowExW(
            hwnd,
            std::ptr::null_mut(),
            wide("SHELLDLL_DefView").as_ptr(),
            std::ptr::null(),
        )
    };
    if !desktop_view.is_null() {
        search.worker = unsafe {
            FindWindowExW(
                std::ptr::null_mut(),
                hwnd,
                wide("WorkerW").as_ptr(),
                std::ptr::null(),
            )
        };
        if !search.worker.is_null() {
            return 0;
        }
    }
    1
}

fn desktop_parent() -> Result<HWND, String> {
    let progman = unsafe { FindWindowW(wide("Progman").as_ptr(), std::ptr::null()) };
    if progman.is_null() {
        return Err("Could not locate the Windows desktop shell".to_string());
    }

    let mut result = 0usize;
    unsafe {
        SendMessageTimeoutW(
            progman,
            WORKER_W_MESSAGE,
            0,
            0,
            SMTO_NORMAL,
            1000,
            &mut result,
        );
    }

    let mut search = DesktopWindowSearch {
        worker: std::ptr::null_mut(),
    };
    unsafe {
        EnumWindows(
            Some(find_worker_window),
            (&mut search as *mut DesktopWindowSearch).cast::<std::ffi::c_void>() as LPARAM,
        );
    }

    Ok(if search.worker.is_null() {
        progman
    } else {
        search.worker
    })
}

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}
