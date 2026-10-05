use super::*;

fn installed_context() -> InstallationContext {
    InstallationContext {
        development: false,
        platform: "windows",
        architecture: "x86_64",
        bundle: None,
        executable: Some("C:/Apps/wallpaper-picker-ui.exe".into()),
        appimage: None,
        appdir: None,
    }
}

#[test]
fn unidentified_or_unsupported_installations_fail_closed() {
    let cases = [
        (installed_context(), SupportReason::InstallerUnidentified),
        (
            InstallationContext {
                platform: "macos",
                ..installed_context()
            },
            SupportReason::UnsupportedPlatform,
        ),
        (
            InstallationContext {
                architecture: "aarch64",
                ..installed_context()
            },
            SupportReason::UnsupportedArchitecture,
        ),
        (
            InstallationContext {
                executable: None,
                ..installed_context()
            },
            SupportReason::ExecutableUnavailable,
        ),
    ];
    for (context, reason) in cases {
        let support = classify(&context);
        assert_eq!(support.mode, SupportMode::Unknown);
        assert_eq!(support.reason, reason);
        assert_eq!(support.installer, None);
        assert_eq!(support.target, None);
    }
}

#[test]
fn linux_package_managed_installations_never_expose_a_target() {
    let cases = [
        (
            Some(BundleType::Deb),
            "/usr/bin/wallpaper-picker-ui",
            InstallerKind::Deb,
            SupportReason::PackageManaged,
        ),
        (
            Some(BundleType::Rpm),
            "/usr/bin/wallpaper-picker-ui",
            InstallerKind::Rpm,
            SupportReason::PackageManaged,
        ),
        (
            Some(BundleType::Deb),
            "/nix/store/hash-wallpaper-picker-ui/bin/wallpaper-picker-ui",
            InstallerKind::Nix,
            SupportReason::NixManaged,
        ),
    ];
    for (bundle, executable, installer, reason) in cases {
        let support = classify(&InstallationContext {
            platform: "linux",
            bundle,
            executable: Some(executable.into()),
            ..installed_context()
        });
        assert_eq!(support.mode, SupportMode::PackageManaged);
        assert_eq!(support.installer, Some(installer));
        assert_eq!(support.reason, reason);
        assert_eq!(support.target, None);
    }
}

#[test]
fn windows_bundle_metadata_preserves_installer_kind_but_waits_for_native_validation() {
    for (bundle, installer) in [
        (BundleType::Nsis, InstallerKind::Nsis),
        (BundleType::Msi, InstallerKind::Msi),
    ] {
        let support = classify(&InstallationContext {
            bundle: Some(bundle),
            ..installed_context()
        });
        assert_eq!(support.mode, SupportMode::ManualOnly);
        assert_eq!(support.installer, Some(installer));
        assert_eq!(support.reason, SupportReason::NativeValidationPending);
        assert_eq!(support.target, None);
    }
}

#[test]
fn contradictory_bundle_metadata_does_not_select_an_installer() {
    for (platform, bundle) in [
        ("windows", BundleType::AppImage),
        ("windows", BundleType::Deb),
        ("linux", BundleType::Nsis),
        ("linux", BundleType::Msi),
    ] {
        let support = classify(&InstallationContext {
            platform,
            bundle: Some(bundle),
            ..installed_context()
        });
        assert_eq!(support.mode, SupportMode::Unknown);
        assert_eq!(support.reason, SupportReason::ConflictingMetadata);
        assert_eq!(support.installer, None);
        assert_eq!(support.target, None);
    }
}

fn appimage_context() -> (crate::test_support::TempDir, InstallationContext) {
    let dir = crate::test_support::TempDir::new();
    let appdir = dir.path().join(".mount_wallpaper");
    let executable = appdir.join("usr/bin/wallpaper-picker-ui");
    std::fs::create_dir_all(executable.parent().unwrap()).unwrap();
    std::fs::write(&executable, b"fixture executable").unwrap();
    let appimage = dir.path().join("Wallpaper.AppImage");
    std::fs::write(&appimage, b"\x7fELF\x02\x01\x01\0AI\x02\0\0\0\0\0").unwrap();
    let context = InstallationContext {
        platform: "linux",
        bundle: Some(BundleType::AppImage),
        executable: Some(std::fs::canonicalize(executable).unwrap()),
        appimage: Some(appimage),
        appdir: Some(appdir),
        ..installed_context()
    };
    (dir, context)
}

#[test]
fn appimage_identity_requires_correlated_native_bundle_and_launch_metadata() {
    let (_dir, context) = appimage_context();
    let support = classify(&context);
    assert_eq!(support.mode, SupportMode::ManualOnly);
    assert_eq!(support.installer, Some(InstallerKind::AppImage));
    assert_eq!(support.reason, SupportReason::NativeValidationPending);
    assert_eq!(support.target, None);
}

#[test]
fn read_only_appimage_has_actionable_manual_guidance() {
    let (_dir, context) = appimage_context();
    let path = context.appimage.as_ref().unwrap();
    let original = std::fs::metadata(path).unwrap().permissions();
    let mut readonly = original.clone();
    readonly.set_readonly(true);
    std::fs::set_permissions(path, readonly).unwrap();
    let support = classify(&context);
    std::fs::set_permissions(path, original).unwrap();
    assert_eq!(support.mode, SupportMode::ManualOnly);
    assert_eq!(support.reason, SupportReason::AppImageReadOnly);
    assert_eq!(support.target, None);
}

#[test]
fn native_adapter_reports_current_development_environment_without_a_target() {
    let context = collect_native_context(&tauri::utils::Env::default());
    let support = classify(&context);
    assert_eq!(support.platform, std::env::consts::OS);
    assert_eq!(support.architecture, std::env::consts::ARCH);
    assert_eq!(support.mode, SupportMode::Development);
    assert_eq!(support.target, None);
}

fn stale_nix_appimage_context(bundle: Option<BundleType>) -> InstallationContext {
    InstallationContext {
        platform: "linux",
        bundle,
        executable: Some("/usr/bin/wallpaper-picker-ui".into()),
        appimage: Some("/nix/store/nonexistent.AppImage".into()),
        appdir: None,
        ..installed_context()
    }
}

#[test]
fn stale_nix_appimage_does_not_override_deb_provenance() {
    let support = classify(&stale_nix_appimage_context(Some(BundleType::Deb)));
    assert_eq!(support.installer, Some(InstallerKind::Deb));
    assert_eq!(support.mode, SupportMode::PackageManaged);
    assert_eq!(support.reason, SupportReason::PackageManaged);
    assert_eq!(support.target, None);
}

#[test]
fn stale_nix_appimage_does_not_override_rpm_provenance() {
    let support = classify(&stale_nix_appimage_context(Some(BundleType::Rpm)));
    assert_eq!(support.installer, Some(InstallerKind::Rpm));
    assert_eq!(support.mode, SupportMode::PackageManaged);
    assert_eq!(support.reason, SupportReason::PackageManaged);
    assert_eq!(support.target, None);
}

#[test]
fn stale_nix_appimage_does_not_identify_an_unknown_bundle() {
    let support = classify(&stale_nix_appimage_context(None));
    assert_eq!(support.mode, SupportMode::Unknown);
    assert_eq!(support.installer, None);
    assert_eq!(support.reason, SupportReason::InstallerUnidentified);
    assert_eq!(support.target, None);
}

#[test]
fn marked_appimage_with_nonexistent_nix_origin_is_unknown() {
    let (_dir, mut context) = appimage_context();
    context.appimage = Some("/nix/store/nonexistent.AppImage".into());
    assert!(std::fs::symlink_metadata(context.appimage.as_ref().unwrap()).is_err());
    let support = classify(&context);
    assert_eq!(support.mode, SupportMode::Unknown);
    assert_eq!(support.installer, None);
    assert_eq!(support.reason, SupportReason::AppImageMetadataInvalid);
    assert_eq!(support.target, None);
}

#[test]
fn validated_nix_appimage_origin_is_package_managed_even_when_executable_is_mounted_elsewhere() {
    let (_dir, context) = appimage_context();
    // Exercise only the policy for already validated canonical evidence; portable
    // tests do not create or modify a real /nix/store installation.
    for read_only in [false, true] {
        let support = validated_appimage_policy(
            &context,
            std::path::Path::new("/nix/store/hash-wallpaper-picker-ui/Wallpaper.AppImage"),
            read_only,
        );
        assert_eq!(support.mode, SupportMode::PackageManaged);
        assert_eq!(support.installer, Some(InstallerKind::Nix));
        assert_eq!(support.reason, SupportReason::NixManaged);
        assert_eq!(support.target, None);
    }
}

#[test]
fn incomplete_or_inconsistent_appimage_metadata_is_unknown() {
    for case in 0..9 {
        let (dir, mut context) = appimage_context();
        match case {
            0 => context.appdir = None,
            1 => context.appimage = None,
            2 => context.appimage = Some("Wallpaper.AppImage".into()),
            3 => context.appdir = Some(".mount_wallpaper".into()),
            4 => context.executable = Some(dir.path().join("another-executable")),
            5 => context.appimage = Some(dir.path().join("missing.AppImage")),
            6 => context.appimage = Some(dir.path().to_owned()),
            7 => std::fs::write(
                context.appimage.as_ref().unwrap(),
                b"not an AppImage at all",
            )
            .unwrap(),
            _ => std::fs::write(context.appimage.as_ref().unwrap(), b"\x7fELF").unwrap(),
        }
        let support = classify(&context);
        assert_eq!(support.mode, SupportMode::Unknown, "case {case}");
        assert_eq!(
            support.reason,
            SupportReason::AppImageMetadataInvalid,
            "case {case}"
        );
        assert_eq!(support.installer, None);
        assert_eq!(support.target, None);
    }
}

#[test]
fn appimage_environment_without_bundle_marker_is_not_identity() {
    let (_dir, mut context) = appimage_context();
    context.bundle = None;
    let support = classify(&context);
    assert_eq!(support.mode, SupportMode::Unknown);
    assert_eq!(support.reason, SupportReason::InstallerUnidentified);
    assert_eq!(support.target, None);
}

#[test]
fn system_directory_and_nix_lookalike_do_not_infer_a_package() {
    for path in [
        "/usr/bin/wallpaper-picker-ui",
        "/nix/store-backup/wallpaper-picker-ui",
    ] {
        let support = classify(&InstallationContext {
            platform: "linux",
            executable: Some(path.into()),
            ..installed_context()
        });
        assert_eq!(support.mode, SupportMode::Unknown);
        assert_eq!(support.reason, SupportReason::InstallerUnidentified);
        assert_eq!(support.target, None);
    }
}

#[test]
fn serialized_policy_has_reason_codes_but_no_filesystem_paths() {
    let value = serde_json::to_value(classify(&InstallationContext {
        bundle: Some(BundleType::Nsis),
        ..installed_context()
    }))
    .unwrap();
    assert_eq!(
        value,
        serde_json::json!({
            "mode": "manual-only", "platform": "windows", "architecture": "x86_64",
            "installer": "nsis", "target": null, "reason": "native-validation-pending"
        })
    );
}

#[cfg(unix)]
#[test]
fn symlinked_appimage_is_not_treated_as_a_replaceable_installation() {
    let (dir, mut context) = appimage_context();
    let alias = dir.path().join("alias.AppImage");
    std::os::unix::fs::symlink(context.appimage.as_ref().unwrap(), &alias).unwrap();
    context.appimage = Some(alias);
    let support = classify(&context);
    assert_eq!(support.reason, SupportReason::AppImageMetadataInvalid);
    assert_eq!(support.target, None);
}

#[test]
fn locked_plugin_selects_exact_static_feed_targets_without_generic_fallback() {
    // Target resolution is the locked plugin's implementation, not a new adapter.
    let release: tauri_plugin_updater::RemoteRelease = serde_json::from_value(serde_json::json!({
        "version": "3.5.0",
        "platforms": {
            "windows-x86_64": { "url": "https://example.com/generic.msi", "signature": "generic" },
            "windows-x86_64-nsis": { "url": "https://example.com/setup.exe", "signature": "nsis" },
            "windows-x86_64-msi": { "url": "https://example.com/update.msi", "signature": "msi" },
            "linux-x86_64-appimage": { "url": "https://example.com/update.AppImage", "signature": "appimage" }
        }
    })).unwrap();
    for (target, path, signature) in [
        ("windows-x86_64-nsis", "/setup.exe", "nsis"),
        ("windows-x86_64-msi", "/update.msi", "msi"),
        ("linux-x86_64-appimage", "/update.AppImage", "appimage"),
    ] {
        assert_eq!(release.download_url(target).unwrap().path(), path);
        assert_eq!(release.signature(target).unwrap(), signature);
    }
    assert!(release.download_url("windows-aarch64-nsis").is_err());
    assert!(release.signature("windows-aarch64-nsis").is_err());
}

#[test]
fn development_build_never_exposes_an_updater_target() {
    let support = classify(&InstallationContext {
        development: true,
        platform: "windows",
        architecture: "x86_64",
        bundle: Some(tauri::utils::config::BundleType::Nsis),
        executable: Some("C:/Apps/wallpaper-picker-ui.exe".into()),
        appimage: None,
        appdir: None,
    });

    assert_eq!(support.mode, SupportMode::Development);
    assert_eq!(support.reason, SupportReason::DevelopmentBuild);
    assert_eq!(support.target, None);
}
