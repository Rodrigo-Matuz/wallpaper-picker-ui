# Wallpaper Picker UI v3.6.9

## Update interface

- Keep startup update detection silent: no temporary global top bar while checking installation support or GitHub. A newer release can still show the existing Home notification.
- Separate the update/check actions from the GitHub releases link with explicit spacing and wrapping.
- Show a short preview of long release notes, with **Read more** / **Read less** controls.
- Render basic Markdown headings and bold text safely without executing raw HTML, scripts or remote images.

## Preserved behavior

- Explicit version-labelled Update consent, signed downloads, installation eligibility, pending-work reservation and unsaved Settings protection are unchanged.
- Installation/download status and reservation gating remain visible; only passive startup checks lose the global banner.
- Keep the thumbnail recovery/read permissions, consolidated Home header, four-column grid and Nix development-shell fixes from versions 3.6.5–3.6.8.
- Windows distribution remains NSIS/setup.exe only. Legacy MSI migration is manual; Linux AppImage updates are manual and Debian/RPM/Nix installations remain package-managed.

Actual installer upgrade, reopen and data-preservation acceptance remain unverified. This version is prepared locally; pushing main, checking CI, tagging and publishing the signed draft are separate user actions.
