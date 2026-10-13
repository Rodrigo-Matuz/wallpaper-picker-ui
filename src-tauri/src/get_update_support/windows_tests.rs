use super::*;
use std::collections::BTreeMap;
use windows::{
    EvidenceProvider, EvidenceResult, FileId, ObjectKind, Scope, Values, ARP_KEY, PRODUCT_KEY,
};

#[derive(Clone)]
struct Fixture {
    local: EvidenceResult<String>,
    keys: BTreeMap<(Scope, String), EvidenceResult<Option<Values>>>,
    objects: BTreeMap<String, EvidenceResult<FileId>>,
    running: EvidenceResult<(String, FileId)>,
    processes: EvidenceResult<()>,
    arp: EvidenceResult<Vec<(String, String)>>,
    msi: EvidenceResult<bool>,
    calls: Vec<String>,
}
const DIR: &str = r"C:\Users\Fixture\AppData\Local\Wallpaper Picker UI";
const EXE: &str = r"C:\Users\Fixture\AppData\Local\Wallpaper Picker UI\wallpaper-picker-ui.exe";
const UNINSTALL: &str = r"C:\Users\Fixture\AppData\Local\Wallpaper Picker UI\uninstall.exe";
impl Fixture {
    fn approved() -> Self {
        let values = |pairs: &[(&str, &str)]| {
            pairs
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect()
        };
        let mut keys = BTreeMap::new();
        keys.insert(
            (Scope::User64, PRODUCT_KEY.into()),
            Ok(Some(values(&[("", DIR)]))),
        );
        keys.insert(
            (Scope::User64, ARP_KEY.into()),
            Ok(Some(values(&[
                ("DisplayName", "Wallpaper Picker UI"),
                ("Publisher", "matuz"),
                ("DisplayVersion", "3.6.1"),
                ("MainBinaryName", "wallpaper-picker-ui.exe"),
                ("InstallLocation", &format!("\"{DIR}\"")),
                ("UninstallString", &format!("\"{UNINSTALL}\"")),
            ]))),
        );
        Self {
            local: Ok(r"C:\Users\Fixture\AppData\Local".into()),
            keys,
            objects: [
                (DIR.into(), Ok(FileId(1, 1))),
                (EXE.into(), Ok(FileId(1, 2))),
                (UNINSTALL.into(), Ok(FileId(1, 3))),
            ]
            .into(),
            running: Ok((EXE.into(), FileId(1, 2))),
            processes: Ok(()),
            arp: Ok(vec![]),
            msi: Ok(false),
            calls: vec![],
        }
    }
    fn support(&mut self) -> UpdateSupport {
        windows::classify_with_provider(
            &InstallationContext {
                development: false,
                platform: "windows",
                architecture: "x86_64",
                bundle: Some(BundleType::Nsis),
                executable: Some(EXE.into()),
                appimage: None,
                appdir: None,
            },
            self,
            "3.6.1",
        )
    }
}
impl EvidenceProvider for Fixture {
    fn local_app_data(&mut self) -> EvidenceResult<String> {
        self.calls.push("local".into());
        self.local.clone()
    }
    fn registration(&mut self, scope: Scope, key: &str) -> EvidenceResult<Option<Values>> {
        self.calls.push(format!("{scope:?}:{key}"));
        self.keys
            .get(&(scope, key.into()))
            .cloned()
            .unwrap_or(Ok(None))
    }
    fn machine_arp_collision(&mut self) -> EvidenceResult<bool> {
        assert_eq!(
            windows::ARP_ROOT,
            r"Software\Microsoft\Windows\CurrentVersion\Uninstall"
        );
        self.calls.push("arp64".into());
        self.arp.clone().map(|entries| {
            entries.iter().any(|(name, publisher)| {
                format!("{name}{publisher}").eq_ignore_ascii_case("Wallpaper Picker UImatuz")
            })
        })
    }
    fn related_msi(&mut self, code: &str) -> EvidenceResult<bool> {
        assert_eq!(code, "{83118BD9-967B-5A1F-94BE-E18868474288}");
        self.calls.push("msi".into());
        self.msi
    }
    fn replacement_object(&mut self, path: &str, kind: ObjectKind) -> EvidenceResult<FileId> {
        assert_eq!(
            kind,
            if path == DIR {
                ObjectKind::Directory
            } else {
                ObjectKind::File
            }
        );
        self.calls.push(path.into());
        self.objects.get(path).cloned().unwrap_or(Err(()))
    }
    fn running_image(&mut self) -> EvidenceResult<(String, FileId)> {
        self.running.clone()
    }
    fn exclusive_process_scope(&mut self, executable: &str) -> EvidenceResult<()> {
        assert_eq!(executable, EXE);
        self.processes
    }
}

#[test]
fn coexisting_or_unreadable_registration_denies_installation() {
    let mut cases = vec![];
    for scope in [Scope::Machine64, Scope::Machine32, Scope::User32] {
        for key in [PRODUCT_KEY, ARP_KEY] {
            let mut f = Fixture::approved();
            f.keys.insert(
                (scope, key.into()),
                Ok(Some([("InstallLocation".into(), "other".into())].into())),
            );
            cases.push(f);
            let mut f = Fixture::approved();
            f.keys.insert((scope, key.into()), Err(()));
            cases.push(f);
        }
    }
    for key in [PRODUCT_KEY, ARP_KEY] {
        let mut f = Fixture::approved();
        f.keys
            .get_mut(&(Scope::User64, key.into()))
            .unwrap()
            .as_mut()
            .unwrap()
            .as_mut()
            .unwrap()
            .insert("InstallDir".into(), DIR.into());
        cases.push(f);
    }
    for arp in [
        Ok(vec![("Wallpaper Picker UI".into(), "matuz".into())]),
        Ok(vec![("Wallpaper Picker UIm".into(), "atuz".into())]),
        Err(()),
    ] {
        let mut f = Fixture::approved();
        f.arp = arp;
        cases.push(f);
    }
    for msi in [Ok(true), Err(())] {
        let mut f = Fixture::approved();
        f.msi = msi;
        cases.push(f);
    }
    for (i, mut f) in cases.into_iter().enumerate() {
        let support = f.support();
        assert_eq!(support.target, None, "case {i}");
        assert_eq!(support.check_target, Some("windows-x86_64-nsis"));
    }
}

#[test]
fn cached_executable_must_match_raw_native_image() {
    let mut f = Fixture::approved();
    let support = windows::classify_with_provider(
        &InstallationContext {
            development: false,
            platform: "windows",
            architecture: "x86_64",
            bundle: Some(BundleType::Nsis),
            executable: Some(r"C:\Copied\wallpaper-picker-ui.exe".into()),
            appimage: None,
            appdir: None,
        },
        &mut f,
        "3.6.1",
    );
    assert_eq!(support.target, None);
}

#[test]
fn reserved_device_components_are_not_absolute_local_install_paths() {
    for path in [
        r"C:\Users\CON\Local",
        r"C:\Users\con.txt\Local",
        r"C:\Users\LPT1\Local",
        r"C:\Users\COM9.txt\Local",
        r"C:\Users\NUL\Local",
        r"C:\Users\AUX\Local",
    ] {
        assert!(!windows::strict_local_path(path), "{path}");
    }
}

#[test]
fn incomplete_identity_access_or_process_evidence_never_authorizes_install() {
    let mut cases = vec![];
    for key in [PRODUCT_KEY, ARP_KEY] {
        for missing in [true, false] {
            let mut f = Fixture::approved();
            f.keys.insert(
                (Scope::User64, key.into()),
                if missing { Ok(None) } else { Err(()) },
            );
            cases.push(f);
        }
    }
    for field in [
        "DisplayName",
        "Publisher",
        "DisplayVersion",
        "MainBinaryName",
        "InstallLocation",
        "UninstallString",
    ] {
        for missing in [true, false] {
            let mut f = Fixture::approved();
            let values = f
                .keys
                .get_mut(&(Scope::User64, ARP_KEY.into()))
                .unwrap()
                .as_mut()
                .unwrap()
                .as_mut()
                .unwrap();
            if missing {
                values.remove(field);
            } else {
                values.insert(field.into(), "incorrect".into());
            }
            cases.push(f);
        }
    }
    for (key, field, bad) in [
        (PRODUCT_KEY, "", format!("\"{DIR}\"")),
        (PRODUCT_KEY, "", r"C:\Custom\Wallpaper Picker UI".into()),
        (ARP_KEY, "InstallLocation", DIR.into()),
        (ARP_KEY, "UninstallString", format!("\"{UNINSTALL}\" /S")),
        (ARP_KEY, "DisplayVersion", "3.6.0".into()),
    ] {
        let mut f = Fixture::approved();
        f.keys
            .get_mut(&(Scope::User64, key.into()))
            .unwrap()
            .as_mut()
            .unwrap()
            .as_mut()
            .unwrap()
            .insert(field.into(), bad);
        cases.push(f);
    }
    for path in [DIR, EXE, UNINSTALL] {
        let mut f = Fixture::approved();
        f.objects.insert(path.into(), Err(()));
        cases.push(f);
    }
    for running in [
        Err(()),
        Ok((EXE.into(), FileId(2, 2))),
        Ok((EXE.into(), FileId(1, 7))),
        Ok((r"C:\Copied\wallpaper-picker-ui.exe".into(), FileId(1, 2))),
    ] {
        let mut f = Fixture::approved();
        f.running = running;
        cases.push(f);
    }
    let mut f = Fixture::approved();
    f.processes = Err(());
    cases.push(f);
    let mut f = Fixture::approved();
    f.local = Err(());
    cases.push(f);
    for (case, mut f) in cases.into_iter().enumerate() {
        let support = f.support();
        assert_eq!(support.target, None, "case {case}");
        assert_eq!(support.mode, SupportMode::ManualOnly, "case {case}");
        assert_eq!(
            support.reason,
            SupportReason::NativeValidationPending,
            "case {case}"
        );
        assert_eq!(
            support.check_target,
            Some("windows-x86_64-nsis"),
            "case {case}"
        );
    }
}

#[test]
fn installation_ineligible_context_never_reads_windows_evidence() {
    for (platform, architecture, development, bundle, executable) in [
        (
            "windows",
            "x86_64",
            true,
            Some(BundleType::Nsis),
            Some(EXE.into()),
        ),
        (
            "windows",
            "aarch64",
            false,
            Some(BundleType::Nsis),
            Some(EXE.into()),
        ),
        (
            "windows",
            "x86",
            false,
            Some(BundleType::Nsis),
            Some(EXE.into()),
        ),
        (
            "windows",
            "x86_64",
            false,
            Some(BundleType::Msi),
            Some(EXE.into()),
        ),
        ("windows", "x86_64", false, None, Some(EXE.into())),
        ("windows", "x86_64", false, Some(BundleType::Nsis), None),
        (
            "linux",
            "x86_64",
            false,
            Some(BundleType::Deb),
            Some("/usr/bin/wallpaper-picker-ui".into()),
        ),
        (
            "linux",
            "x86_64",
            false,
            Some(BundleType::Rpm),
            Some("/usr/bin/wallpaper-picker-ui".into()),
        ),
        (
            "linux",
            "x86_64",
            false,
            Some(BundleType::AppImage),
            Some("/nix/store/hash/bin/wallpaper-picker-ui".into()),
        ),
        (
            "linux",
            "x86_64",
            false,
            Some(BundleType::AppImage),
            Some("/usr/bin/wallpaper-picker-ui".into()),
        ),
        (
            "macos",
            "x86_64",
            false,
            Some(BundleType::Nsis),
            Some(EXE.into()),
        ),
    ] {
        let mut f = Fixture::approved();
        let support = windows::classify_with_provider(
            &InstallationContext {
                platform,
                architecture,
                development,
                bundle,
                executable,
                appimage: None,
                appdir: None,
            },
            &mut f,
            "3.6.1",
        );
        assert_eq!(support.target, None);
        assert!(f.calls.is_empty(), "{platform}/{architecture}");
    }
}

#[test]
fn shared_hkcu_views_with_identical_data_do_not_invent_a_second_installation() {
    let mut f = Fixture::approved();
    for key in [PRODUCT_KEY, ARP_KEY] {
        let same = f.keys[&(Scope::User64, key.into())].clone();
        f.keys.insert((Scope::User32, key.into()), same);
    }
    assert_eq!(f.support().target, Some("windows-x86_64-nsis"));
    for query in ["local", "arp64", "msi", DIR, EXE, UNINSTALL] {
        assert!(f.calls.iter().any(|c| c == query), "{query}");
    }
    for scope in [
        Scope::User64,
        Scope::User32,
        Scope::Machine64,
        Scope::Machine32,
    ] {
        for key in [PRODUCT_KEY, ARP_KEY] {
            assert!(f.calls.contains(&format!("{scope:?}:{key}")));
        }
    }
}

#[test]
fn path_grammar_rejects_win32_aliases_without_filesystem_access() {
    for path in [
        r"\\server\share\Local",
        r"\\?\C:\Users\Fixture\Local",
        r"\\.\C:\Users\Local",
        r"C:relative",
        r"\Users\Fixture",
        "C:/Users/Fixture/Local",
        r"C:\Users\..\Local",
        r"C:\Users\.\Local",
        "C:\\Users\\Fixture\\Local\\",
        r"C:\Users\\Local",
        r"C:\Users\Local:stream",
        r"C:\Users\Local.",
        r"C:\Users\Local ",
        "C:\\Users\\bad\u{0}\\Local",
        r"C:\Users\COM¹\Local",
    ] {
        assert!(!windows::strict_local_path(path), "{path}");
    }
    assert!(windows::strict_local_path(
        r"C:\Users\Fixture\AppData\Local"
    ));
    assert!(windows::strict_local_path(
        r"D:\Users\Fixture\AppData\Local"
    ));
}

#[test]
fn released_versions_require_matching_registration_without_native_calls() {
    for version in ["3.6.2", "3.6.3", "3.6.4"] {
        let mut fixture = Fixture::approved();
        fixture
            .keys
            .get_mut(&(Scope::User64, ARP_KEY.into()))
            .unwrap()
            .as_mut()
            .unwrap()
            .as_mut()
            .unwrap()
            .insert("DisplayVersion".into(), version.into());
        let context = InstallationContext {
            development: false,
            platform: "windows",
            architecture: "x86_64",
            bundle: Some(BundleType::Nsis),
            executable: Some(EXE.into()),
            appimage: None,
            appdir: None,
        };
        let support = windows::classify_with_provider(&context, &mut fixture, version);
        assert_eq!(support.mode, SupportMode::SelfManaged);
        assert_eq!(support.reason, SupportReason::Supported);
        assert_eq!(support.target, Some("windows-x86_64-nsis"));
        let mismatch = windows::classify_with_provider(&context, &mut fixture, "3.6.1");
        assert_eq!(mismatch.target, None);
    }
}

#[test]
fn approved_current_user_nsis_exposes_only_exact_install_target() {
    let context = InstallationContext {
        development: false,
        platform: "windows",
        architecture: "x86_64",
        bundle: Some(BundleType::Nsis),
        executable: Some(
            "C:\\Users\\Fixture\\AppData\\Local\\Wallpaper Picker UI\\wallpaper-picker-ui.exe"
                .into(),
        ),
        appimage: None,
        appdir: None,
    };
    // A pure provider will supply the approved evidence in GREEN. No native
    // collector, registry, process inventory or personal filesystem is invoked.
    let support = windows::classify_with_provider(&context, &mut Fixture::approved(), "3.6.1");
    assert_eq!(
        serde_json::to_value(support).unwrap(),
        serde_json::json!({
            "mode": "self-managed", "platform": "windows", "architecture": "x86_64",
            "installer": "nsis", "checkTarget": "windows-x86_64-nsis",
            "target": "windows-x86_64-nsis", "reason": "supported"
        })
    );
}
