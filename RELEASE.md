# Wallpaper Picker UI v3.6.3 — updater test candidate

> **TEST RELEASE:** Published specifically to test in-app updating. This release may be deleted soon. Back up your settings and app data before testing. Successful native upgrade, restart and data preservation have **not yet been verified**.

This is the newer candidate for the **3.6.2 → 3.6.3** manual updater trial. It uses the normal application identity, existing signing key and public HTTPS GitHub update feed—not a separate test app or local feed.

- Check once at startup without blocking Home.
- Notify when a newer version is available; displaying or dismissing a notice never downloads or installs anything.
- On eligible Windows NSIS installations, one explicit version-labelled About **Update** click authorizes signed download, verification, installation and installer restart.
- Pending work or unsaved Settings input denies installation until an explicit retry. No automatic installation or forced update.

## Visible test change

About shows the translated **“Updater test: second build”** marker beside version **3.6.3**. The marker identifies this build only; it does not claim that an update succeeded and also appears after a manual installation. It is limited to this exact test version and translated into all five supported languages. Updater behavior and safety guards are unchanged from the base.

## Test from the base, not by manually installing this candidate

The first in-app installation trial is **Windows x64, current-user NSIS, default location**. Custom locations, ambiguous/coexisting registrations and unsupported installations remain manual. **MSI, AppImage, Debian/RPM and Nix installations are not part of this in-app installation trial**; use their normal manual/package-manager update route.

1. Close the existing app and back up configuration and thumbnail/app-data folders.
2. Manually install the **3.6.2 NSIS `.exe`** asset. The earlier 3.6.1 release cannot bootstrap this updater.
3. Launch 3.6.2 with internet access. It should report 3.6.3 without automatically downloading or installing it.
4. Open About, confirm the exact candidate version and click **Update to 3.6.3** once.
5. After the installer reopens the app, verify the displayed version, the newer About-page marker and preserved settings, wallpapers and thumbnails. Report errors or failure to reopen.

These are **test instructions, not a claim that native acceptance passed**. Do not manually install the second package before testing the first package's Update button. Deleting these releases later may remove their download/update URLs; retain backup and recovery installers.
