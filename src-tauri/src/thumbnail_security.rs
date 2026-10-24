use std::fs;
use std::io::ErrorKind;
use std::path::Path;

#[cfg(windows)]
use std::os::windows::fs::MetadataExt;
#[cfg(windows)]
use windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_REPARSE_POINT;

/// Returns whether metadata identifies a path that can redirect filesystem
/// operations away from the app-owned thumbnail directory.
fn is_redirecting_entry(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }

    #[cfg(windows)]
    {
        metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    }

    #[cfg(not(windows))]
    false
}

fn validate_directory(path: &Path, metadata: &fs::Metadata) -> Result<(), String> {
    if is_redirecting_entry(metadata) {
        return Err(format!(
            "Refusing to use redirected thumbnail directory '{}'",
            path.display()
        ));
    }
    if !metadata.is_dir() {
        return Err(format!(
            "Thumbnail path '{}' is not a directory",
            path.display()
        ));
    }
    Ok(())
}

/// Validates an app-owned thumbnail directory after it has been created.
pub(crate) fn require_safe_thumbnail_directory(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path).map_err(|error| {
        format!(
            "Failed to inspect thumbnails directory '{}': {error}",
            path.display()
        )
    })?;
    validate_directory(path, &metadata)
}

/// Validates an existing thumbnail directory, returning `false` when it is
/// absent. Missing cache directories are normal on first launch.
pub(crate) fn existing_safe_thumbnail_directory(path: &Path) -> Result<bool, String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(false),
        Err(error) => {
            return Err(format!(
                "Failed to inspect thumbnails directory '{}': {error}",
                path.display()
            ));
        }
    };
    validate_directory(path, &metadata)?;
    Ok(true)
}

/// Inspects a direct thumbnail entry without following symlinks or Windows
/// reparse points. `None` means the entry does not exist.
pub(crate) fn inspect_thumbnail_entry(path: &Path) -> Result<Option<fs::Metadata>, String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(format!(
                "Failed to inspect thumbnail entry '{}': {error}",
                path.display()
            ));
        }
    };

    if is_redirecting_entry(&metadata) {
        return Err(format!(
            "Refusing to use redirected thumbnail entry '{}'",
            path.display()
        ));
    }

    Ok(Some(metadata))
}

#[cfg(test)]
mod tests {
    use super::{existing_safe_thumbnail_directory, inspect_thumbnail_entry};
    use std::fs;

    #[test]
    fn missing_thumbnail_directory_is_allowed_for_first_launch() {
        let directory = std::env::temp_dir().join(format!(
            "wallpaper-picker-ui-missing-thumbnail-dir-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&directory);
        assert!(!existing_safe_thumbnail_directory(&directory).unwrap());
    }

    #[test]
    fn missing_thumbnail_entry_is_not_an_error() {
        let entry = std::env::temp_dir().join(format!(
            "wallpaper-picker-ui-missing-thumbnail-entry-{}",
            std::process::id()
        ));
        let _ = fs::remove_file(&entry);
        assert!(inspect_thumbnail_entry(&entry).unwrap().is_none());
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_thumbnail_directory_is_rejected() {
        let root = std::env::temp_dir().join(format!(
            "wallpaper-picker-ui-thumbnail-security-{}",
            std::process::id()
        ));
        let target = root.join("target");
        let redirected = root.join("thumbnails");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&target).unwrap();
        std::os::unix::fs::symlink(&target, &redirected).unwrap();

        let error = existing_safe_thumbnail_directory(&redirected).unwrap_err();
        assert!(error.contains("redirected"));
        let _ = fs::remove_dir_all(&root);
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_thumbnail_entry_is_rejected() {
        let root = std::env::temp_dir().join(format!(
            "wallpaper-picker-ui-thumbnail-entry-security-{}",
            std::process::id()
        ));
        let target = root.join("outside.png");
        let redirected = root.join("thumbnail.png");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        fs::write(&target, [1u8]).unwrap();
        std::os::unix::fs::symlink(&target, &redirected).unwrap();

        let error = inspect_thumbnail_entry(&redirected).unwrap_err();
        assert!(error.contains("redirected"));
        let _ = fs::remove_dir_all(&root);
    }
}
