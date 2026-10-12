//! Default-only policy matching the generated Tauri CLI 2.12.2 x64 NSIS template.
//! A snapshot authorizes a handoff, not a completed installation or a race-free
//! guarantee about the later installer. The controller refreshes it under lease.
use super::{classify, InstallationContext, SupportMode, SupportReason, UpdateSupport};
use std::collections::BTreeMap;

pub(super) const PRODUCT_KEY: &str = r"Software\matuz\Wallpaper Picker UI";
pub(super) const ARP_ROOT: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall";
pub(super) const ARP_KEY: &str =
    r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Wallpaper Picker UI";
pub(super) const UPGRADE_CODE: &str = "{83118BD9-967B-5A1F-94BE-E18868474288}";
pub(super) const PRODUCT: &str = "Wallpaper Picker UI";
pub(super) const PUBLISHER: &str = "matuz";
pub(super) const BINARY: &str = "wallpaper-picker-ui.exe";
pub(super) type Values = BTreeMap<String, String>;
pub(super) type EvidenceResult<T> = Result<T, ()>;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub(super) enum Scope {
    User64,
    User32,
    Machine64,
    Machine32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum ObjectKind {
    Directory,
    File,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) struct FileId(pub u32, pub u64);

/// Read-only provider boundary. Success means complete, bounded native evidence;
/// missing optional values differ from unreadable/type-invalid/truncated values.
pub(super) trait EvidenceProvider {
    fn local_app_data(&mut self) -> EvidenceResult<String>;
    fn registration(&mut self, scope: Scope, key: &str) -> EvidenceResult<Option<Values>>;
    fn machine_arp_collision(&mut self) -> EvidenceResult<bool>;
    fn related_msi(&mut self, upgrade_code: &str) -> EvidenceResult<bool>;
    /// Verify every literal ancestor is local, non-reparse; object has exact
    /// final native path, kind, effective replacement access and no hard links.
    fn replacement_object(&mut self, path: &str, kind: ObjectKind) -> EvidenceResult<FileId>;
    /// Compare the raw native running image to the registered file identity.
    fn running_image(&mut self) -> EvidenceResult<(String, FileId)>;
    /// Deny other relevant processes and unknown scope, including every other
    /// Restart Manager consumer of the exact executable. Never terminate any.
    fn exclusive_process_scope(&mut self, executable: &str) -> EvidenceResult<()>;
}

pub(super) fn classify_with_provider(
    context: &InstallationContext,
    provider: &mut impl EvidenceProvider,
    version: &str,
) -> UpdateSupport {
    let mut support = classify(context);
    if !context.development
        && context.platform == "windows"
        && context.architecture == "x86_64"
        && matches!(
            context.bundle.as_ref(),
            Some(tauri::utils::config::BundleType::Nsis)
        )
        && context.executable.is_some()
        && approved(provider, version, context.executable.as_ref().unwrap()).is_ok()
    {
        support.mode = SupportMode::SelfManaged;
        support.reason = SupportReason::Supported;
        support.target = Some("windows-x86_64-nsis");
    }
    support
}

fn approved(
    provider: &mut impl EvidenceProvider,
    version: &str,
    cached: &std::path::Path,
) -> EvidenceResult<()> {
    let local = provider.local_app_data()?;
    if !strict_local_path(&local) {
        return Err(());
    }
    let directory = format!("{local}\\{PRODUCT}");
    let executable = format!("{directory}\\{BINARY}");
    let uninstaller = format!("{directory}\\uninstall.exe");
    let product = provider
        .registration(Scope::User64, PRODUCT_KEY)?
        .ok_or(())?;
    let arp = provider.registration(Scope::User64, ARP_KEY)?.ok_or(())?;
    if product.get("") != Some(&directory)
        || arp.get("DisplayName").map(String::as_str) != Some(PRODUCT)
        || arp.get("Publisher").map(String::as_str) != Some(PUBLISHER)
        || arp.get("DisplayVersion").map(String::as_str) != Some(version)
        || arp.get("MainBinaryName").map(String::as_str) != Some(BINARY)
        || arp.get("InstallLocation") != Some(&format!("\"{directory}\""))
        || arp.get("UninstallString") != Some(&format!("\"{uninstaller}\""))
    {
        return Err(());
    }
    if product.contains_key("InstallDir") || arp.contains_key("InstallDir") {
        return Err(());
    }
    for scope in [Scope::Machine64, Scope::Machine32] {
        for key in [PRODUCT_KEY, ARP_KEY] {
            if provider.registration(scope, key)?.is_some() {
                return Err(());
            }
        }
    }
    for (key, expected) in [(PRODUCT_KEY, &product), (ARP_KEY, &arp)] {
        if let Some(alternate) = provider.registration(Scope::User32, key)? {
            if &alternate != expected {
                return Err(());
            }
        }
    }
    // Match the template's concatenated DisplayName+Publisher rule, not a
    // seemingly safer separate comparison that would miss its collisions.
    if provider.machine_arp_collision()? || provider.related_msi(UPGRADE_CODE)? {
        return Err(());
    }
    provider.replacement_object(&directory, ObjectKind::Directory)?;
    let identity = provider.replacement_object(&executable, ObjectKind::File)?;
    provider.replacement_object(&uninstaller, ObjectKind::File)?;
    let (running, running_id) = provider.running_image()?;
    // Tauri canonicalizes to an extended path on Windows; only permit the
    // exact canonical spelling of the same strictly validated native image.
    let cached = cached.to_str().ok_or(())?;
    let cached = cached.strip_prefix(r"\\?\").unwrap_or(cached);
    if running != executable || cached != executable || running_id != identity {
        return Err(());
    }
    provider.exclusive_process_scope(&executable)?;
    Ok(())
}

#[cfg(all(target_os = "windows", not(test)))]
pub(super) mod native;

/// Deliberately narrower than Win32 parsing: no UNC/device/extended paths, ADS,
/// forward slashes, dot components, trailing separators/spaces/dots or aliases.
pub(super) fn strict_local_path(path: &str) -> bool {
    let bytes = path.as_bytes();
    bytes.len() > 3
        && bytes.len() < 240
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && bytes[2] == b'\\'
        && path[3..].split('\\').all(|part| {
            !part.is_empty()
                && part != "."
                && part != ".."
                && !part.ends_with([' ', '.'])
                && {
                    let device = part.split('.').next().unwrap_or("").to_ascii_uppercase();
                    !matches!(
                        device.as_str(),
                        "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$"
                    ) && !device
                        .strip_prefix("COM")
                        .or_else(|| device.strip_prefix("LPT"))
                        .is_some_and(|suffix| {
                            matches!(
                                suffix,
                                "1" | "2"
                                    | "3"
                                    | "4"
                                    | "5"
                                    | "6"
                                    | "7"
                                    | "8"
                                    | "9"
                                    | "¹"
                                    | "²"
                                    | "³"
                            )
                        })
                }
                && !part
                    .chars()
                    .any(|c| c.is_control() || ":/\"<>|?*".contains(c))
        })
}
