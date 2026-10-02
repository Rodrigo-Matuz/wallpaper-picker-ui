# Release notes — Wallpaper Picker UI v3.6.0 (draft)

For the next release. Version numbers and the published v3.5.0 release remain unchanged until v3.6.0 is prepared and tagged.

## Changes

- Show **Wallpaper Picker UI** as the window title and application name in desktop and installer metadata. The executable remains `wallpaper-picker-ui`.
- Keep the existing application identifier and Windows MSI upgrade code so the display-name change does not create a separate MSI installation.

### UI overhaul

- Rework Settings into an elegant, grouped layout for Wallpaper, Preferences, and Maintenance instead of a stack of cards. Setting titles and descriptions stay visible, with expandable details for additional guidance.
- Edit the wallpaper command inline with an explicit Save action. Other settings retain their immediate-change behavior, and the language selector shows the currently selected language.
- Give Settings controls accessible labels and descriptions, and use the accent color for maintenance actions, including Clear and Delete.
- Refine shared switches with rounded tracks, circular thumbs, correct on/off positioning, and restrained transitions that respect reduced-motion preferences.
- Unify navbar action buttons with borderless, transparent styling and green hover feedback while retaining correctly sized, nonshrinking icons.
- Show the home-page thank-you footer only when no wallpapers are displayed, including when a search has no matches; keep it out of the way when the grid is populated.
- Redesign About with serif headings, restrained dividers, a project introduction and version display, and a responsive contributor roster. Every contributor in the configuration is displayed rather than only the original maintainer.
- Keep the project website and source repository separate from contributors' personal websites and contact links. Matuz's personal website is `https://matuz.dev`; the project website is `https://matuz.dev/projects/wallpaper-picker`.
- Keep contributor identities and labelled links available while GitHub profile details load or are unavailable. Handle failed or malformed responses gracefully and cancel pending profile requests when leaving the page.
- Translate the new Settings and About text into all five supported languages: English, Brazilian Portuguese, French, German, and Spanish.
- Adapt Settings and About layouts to narrow windows without horizontal scrolling.

## For developers

- Added tests for frontend functions, Svelte components, scripts, and Rust backend modules. Each test lives alongside its implementation in a per-module directory.
- CI now runs Bun unit tests and Vitest component tests on Linux and Windows, alongside the existing Rust checks and tests.
- Expand component-test discovery to include routes, with regression coverage for settings controls, navbar and switch styling, filtered-grid footer visibility, multiple contributors, separate project/profile links, and GitHub profile failures.
