use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::thread;

// Main function
pub fn generate_thumbnails(folder_path: &str, app_config_path: &str) -> HashMap<String, String> {
    let folder_path = Path::new(folder_path);
    let thumbnails_folder = Path::new(app_config_path).join("thumbnails");

    create_thumbnails_folder(&thumbnails_folder);
    let entries = collect_entries(folder_path);

    let thumbnails_map = Arc::new(Mutex::new(HashMap::new()));
    let num_threads = 5;
    let batch_size = (entries.lock().unwrap().len() + num_threads - 1) / num_threads;

    let mut handles = vec![];

    for _ in 0..num_threads {
        let thumbnails_map = Arc::clone(&thumbnails_map);
        let thumbnails_folder = thumbnails_folder.clone();
        let entries = Arc::clone(&entries);

        let handle = thread::spawn(move || {
            process_entries(&thumbnails_folder, entries, batch_size, thumbnails_map);
        });

        handles.push(handle);
    }

    for handle in handles {
        handle.join().expect("Thread panicked");
    }

    Arc::try_unwrap(thumbnails_map)
        .unwrap()
        .into_inner()
        .unwrap()
}

// Sub-function to create the thumbnails folder
fn create_thumbnails_folder(thumbnails_folder: &Path) {
    if !thumbnails_folder.exists() {
        fs::create_dir(thumbnails_folder).expect("Failed to create thumbnails folder");
    }
}

// Sub-function to collect directory entries
fn collect_entries(folder_path: &Path) -> Arc<Mutex<Vec<PathBuf>>> {
    let entries: Vec<_> = fs::read_dir(folder_path)
        .expect("Failed to read directory")
        .filter_map(|entry| entry.ok().map(|e| e.path())) // Only collect successful entries
        .collect();
    Arc::new(Mutex::new(entries))
}

// Sub-function to process entries and generate thumbnails
fn process_entries(
    thumbnails_folder: &Path,
    entries: Arc<Mutex<Vec<PathBuf>>>,
    batch_size: usize,
    thumbnails_map: Arc<Mutex<HashMap<String, String>>>,
) {
    loop {
        let chunk = {
            let mut entries = entries.lock().unwrap();
            if entries.is_empty() {
                break;
            }
            let split_index = batch_size.min(entries.len());
            let chunk = entries.drain(0..split_index).collect::<Vec<_>>();
            chunk
        };

        for path in chunk {
            if !is_video_file(&path) {
                continue;
            }

            let thumbnail_name = generate_thumbnail_name(&path);
            let thumbnail_path = thumbnails_folder.join(&thumbnail_name);

            if thumbnail_path.exists() {
                let mut map = thumbnails_map.lock().unwrap();
                map.insert(thumbnail_name.clone(), path.to_string_lossy().to_string());
                continue;
            }

            if generate_thumbnail(&path, &thumbnail_path) {
                let mut map = thumbnails_map.lock().unwrap();
                map.insert(thumbnail_name.clone(), path.to_string_lossy().to_string());
            } else {
                eprintln!("Failed to generate thumbnail for {:?}", path);
            }
        }
    }
}

// Sub-function to check if a file is a video
fn is_video_file(path: &PathBuf) -> bool {
    if let Some(ext) = path.extension() {
        matches!(
            ext.to_str().unwrap().to_lowercase().as_str(),
            "mp4" | "mkv" | "avi" | "mov" | "wmv"
        )
    } else {
        false
    }
}

// Sub-function to generate a thumbnail name
fn generate_thumbnail_name(path: &PathBuf) -> String {
    path.file_stem().unwrap().to_string_lossy().to_string() + ".png"
}

// Sub-function to generate a thumbnail using ffmpeg
fn generate_thumbnail(video_path: &Path, thumbnail_path: &Path) -> bool {
    let status = Command::new("ffmpeg")
        .args(&[
            "-i",
            video_path.to_str().unwrap(),
            "-ss",
            "00:00:01.000",
            "-vframes",
            "1",
            "-s",
            "222x124",
            thumbnail_path.to_str().unwrap(),
        ])
        .status()
        .expect("Failed to execute ffmpeg");

    status.success()
}
