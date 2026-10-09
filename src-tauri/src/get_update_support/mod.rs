//! Read-only installation policy for the in-app updater.
//! No target is authorized until packaged native upgrade tests pass.

use serde::Serialize;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use tauri::utils::config::BundleType;
use tauri::Manager;

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum SupportMode {
    Development,
    PackageManaged,
    ManualOnly,
    Unknown,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum InstallerKind {
    Nsis,
    Msi,
    AppImage,
    Deb,
    Rpm,
    Nix,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum SupportReason {
    DevelopmentBuild,
    UnsupportedPlatform,
    UnsupportedArchitecture,
    ExecutableUnavailable,
    InstallerUnidentified,
    ConflictingMetadata,
    PackageManaged,
    NixManaged,
    AppImageMetadataInvalid,
    AppImageReadOnly,
    NativeValidationPending,
}

/// Minimal serializable policy; never exposes native paths or installer resources.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSupport {
    pub mode: SupportMode,
    pub platform: &'static str,
    pub architecture: &'static str,
    pub installer: Option<InstallerKind>,
    pub target: Option<&'static str>,
    pub reason: SupportReason,
}

struct InstallationContext {
    development: bool,
    platform: &'static str,
    architecture: &'static str,
    bundle: Option<BundleType>,
    executable: Option<PathBuf>,
    appimage: Option<PathBuf>,
    appdir: Option<PathBuf>,
}

/// Returns installation-method guidance without checking, downloading, or installing.
/// All methods remain manual-only until the packaged native acceptance gate passes.
#[tauri::command]
pub async fn get_update_support(app: tauri::AppHandle) -> Result<UpdateSupport, String> {
    let context = collect_native_context(&app.env());
    tauri::async_runtime::spawn_blocking(move || classify(&context))
        .await
        .map_err(|error| error.to_string())
}

fn collect_native_context(_env: &tauri::utils::Env) -> InstallationContext {
    InstallationContext {
        development: cfg!(debug_assertions) || tauri::is_dev(),
        platform: std::env::consts::OS,
        architecture: std::env::consts::ARCH,
        bundle: tauri::utils::platform::bundle_type(),
        // Tauri caches and canonicalizes this path before main starts.
        executable: tauri::utils::platform::current_exe().ok(),
        #[cfg(target_os = "linux")]
        appimage: _env.appimage.as_ref().map(PathBuf::from),
        #[cfg(not(target_os = "linux"))]
        appimage: None,
        #[cfg(target_os = "linux")]
        appdir: _env.appdir.as_ref().map(PathBuf::from),
        #[cfg(not(target_os = "linux"))]
        appdir: None,
    }
}

fn policy(
    context: &InstallationContext,
    mode: SupportMode,
    installer: Option<InstallerKind>,
    reason: SupportReason,
) -> UpdateSupport {
    UpdateSupport {
        mode,
        platform: context.platform,
        architecture: context.architecture,
        installer,
        // Identification alone does not establish safe replacement/relaunch.
        // Keep every target disabled until the native acceptance gate passes.
        target: None,
        reason,
    }
}

// Correlate the embedded bundle marker with the actual launch path. Neither
// APPIMAGE alone nor a writable executable is sufficient evidence.
fn inspect_appimage(context: &InstallationContext) -> Option<UpdateSupport> {
    let appimage = context.appimage.as_ref()?;
    let appdir = context.appdir.as_ref()?;
    if !appimage.is_absolute() || !appdir.is_absolute() {
        return None;
    }
    let metadata = fs::symlink_metadata(appimage).ok()?;
    if !metadata.file_type().is_file() {
        return None;
    }
    let expected_executable = fs::canonicalize(appdir.join("usr/bin/wallpaper-picker-ui")).ok()?;
    if context.executable.as_ref() != Some(&expected_executable) {
        return None;
    }
    let mut header = [0; 11];
    fs::File::open(appimage)
        .ok()?
        .read_exact(&mut header)
        .ok()?;
    if &header[..4] != b"\x7fELF" || &header[8..] != b"AI\x02" {
        return None;
    }
    let resolved_origin = fs::canonicalize(appimage).ok()?;
    let parent = fs::metadata(appimage.parent()?).ok()?;
    Some(validated_appimage_policy(
        context,
        &resolved_origin,
        metadata.permissions().readonly() || parent.permissions().readonly(),
    ))
}

// Only validated AppImage launch evidence may supply this resolved origin.
fn validated_appimage_policy(
    context: &InstallationContext,
    resolved_origin: &Path,
    read_only: bool,
) -> UpdateSupport {
    if resolved_origin.starts_with("/nix/store") {
        return policy(
            context,
            SupportMode::PackageManaged,
            Some(InstallerKind::Nix),
            SupportReason::NixManaged,
        );
    }
    // Writable mode bits are only a hint, not an ACL/effective-user or rename test.
    policy(
        context,
        SupportMode::ManualOnly,
        Some(InstallerKind::AppImage),
        if read_only {
            SupportReason::AppImageReadOnly
        } else {
            SupportReason::NativeValidationPending
        },
    )
}

fn classify(context: &InstallationContext) -> UpdateSupport {
    if context.development {
        return policy(
            context,
            SupportMode::Development,
            None,
            SupportReason::DevelopmentBuild,
        );
    }
    if !matches!(context.platform, "windows" | "linux") {
        return policy(
            context,
            SupportMode::Unknown,
            None,
            SupportReason::UnsupportedPlatform,
        );
    }
    if context.architecture != "x86_64" {
        return policy(
            context,
            SupportMode::Unknown,
            None,
            SupportReason::UnsupportedArchitecture,
        );
    }
    let Some(executable) = &context.executable else {
        return policy(
            context,
            SupportMode::Unknown,
            None,
            SupportReason::ExecutableUnavailable,
        );
    };
    if context.platform == "linux" && executable.starts_with("/nix/store") {
        return policy(
            context,
            SupportMode::PackageManaged,
            Some(InstallerKind::Nix),
            SupportReason::NixManaged,
        );
    }
    match (context.platform, context.bundle.as_ref()) {
        ("windows", Some(BundleType::Nsis)) => policy(
            context,
            SupportMode::ManualOnly,
            Some(InstallerKind::Nsis),
            SupportReason::NativeValidationPending,
        ),
        ("windows", Some(BundleType::Msi)) => policy(
            context,
            SupportMode::ManualOnly,
            Some(InstallerKind::Msi),
            SupportReason::NativeValidationPending,
        ),
        ("linux", Some(BundleType::Deb)) => policy(
            context,
            SupportMode::PackageManaged,
            Some(InstallerKind::Deb),
            SupportReason::PackageManaged,
        ),
        ("linux", Some(BundleType::Rpm)) => policy(
            context,
            SupportMode::PackageManaged,
            Some(InstallerKind::Rpm),
            SupportReason::PackageManaged,
        ),
        ("linux", Some(BundleType::AppImage)) => match inspect_appimage(context) {
            Some(support) => support,
            None => policy(
                context,
                SupportMode::Unknown,
                None,
                SupportReason::AppImageMetadataInvalid,
            ),
        },
        ("windows", Some(BundleType::Deb | BundleType::Rpm | BundleType::AppImage))
        | ("linux", Some(BundleType::Nsis | BundleType::Msi)) => policy(
            context,
            SupportMode::Unknown,
            None,
            SupportReason::ConflictingMetadata,
        ),
        _ => policy(
            context,
            SupportMode::Unknown,
            None,
            SupportReason::InstallerUnidentified,
        ),
    }
}

#[cfg(test)]
mod tests;
