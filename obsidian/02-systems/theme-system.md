---
title: Theme system
updated: 2026-10-23
---

# Theme system

Theme family, light/dark mode, and visual appearance are separate validated preferences. A theme family owns semantic colors only. Global appearance settings control roundness, shadow strength, and spacing, so users can combine one theme's colors with another visual style without changing the color family.

The default configuration uses the DeepOcean family in dark mode with sharp corners, subtle shadows, and comfortable spacing. Older configurations without the new appearance fields receive a compatibility fallback based on their previous theme geometry; changing the theme family persists those resolved appearance values so later theme changes do not alter the user's chosen shape, shadows, or spacing.

The frontend publishes colors and appearance as separate CSS-variable groups. Keep appearance changes independent from thumbnail, playback, and updater boundaries. Component tests run in the Vitest/jsdom suite; the jsdom setup supplies the localStorage methods used by mode-watcher.