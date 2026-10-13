# Wallpaper Picker UI v3.6.4

## In-app updates

- Check for a newer release once at startup without blocking Home.
- Notify without automatically downloading or installing anything.
- On eligible Windows NSIS installations, About offers **Update to {version}**. The explicit click authorizes the signed download, verification and installer handoff.
- Pending app work or unsaved Settings changes block installation until you finish them and retry. Nothing is saved or discarded automatically.

## Windows installer: NSIS/setup.exe only

The Windows download is **`Wallpaper.Picker.UI_3.6.4_x64-setup.exe`**. This is the NSIS installer; there is no separate NSIS package and no MSI installer in this release.

In-app installation eligibility is limited to **Windows x64, current-user NSIS, default location**. Custom locations, conflicting registrations and installations that cannot be safely identified remain manual.

**Existing MSI users:** back up your settings and app data and migrate manually to the NSIS installer. The updater does not silently convert MSI installations to NSIS. Earlier releases without the enabled updater also need a manual installation first.

## Notification fixes

- Opaque notification background using the app's design tokens.
- Dismiss X inside the notification, with space for wrapping text and translated actions.

## Other installations and verification

Linux AppImage updates remain manual; Debian/RPM and Nix installations remain package-managed. Their normal download/package routes are unchanged.

Back up configuration and thumbnail/app-data folders before updating. Source tests, package builds and signature checks do not establish a completed native upgrade: actual installer restart and data-preservation acceptance remain unverified. This release retains the existing application identity, signing key and public HTTPS update feed.
