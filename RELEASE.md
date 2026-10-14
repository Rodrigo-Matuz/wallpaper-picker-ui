# Update interface

- Keep startup update detection silent: no temporary global top bar while checking installation support or GitHub. A newer release can still show the existing Home notification.
- Separate the update/check actions from the GitHub releases link with explicit spacing and wrapping.
- Show a short preview of long release notes, with **Read more** / **Read less** controls.
- Render basic Markdown headings and bold text safely without executing raw HTML, scripts or remote images.

## Linux release notifications

- Notify Debian, RPM, Nix/Home Manager and AppImage users when a newer stable upstream release is available:
  > Wallpaper Picker UI {version} is available. Update through your usual installation method.
- Check silently at startup, with a dismissible notification, release details and manual **Check again** in About.
- Notifications read release metadata only: no automatic download, installation, package-manager execution or restart. AppImage in-app installation remains disabled.
- A newer upstream release does not mean it is already available in your distribution's repository or pinned Nix flake.
