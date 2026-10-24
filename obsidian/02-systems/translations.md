---
title: Translations
updated: 2026-10-22
---

# Translations

Five translation files are checked for parity and currently contain 145 keys each. The default language code is `eng`; translation keys use dot notation.

`bun run check:translations` is the authoritative parity command. `bun run check` also type-checks the SvelteKit application.

When changing user-visible behavior, update every locale and keep tests/documentation honest about fallback behavior. No translation changes were required by the thumbnail/security batch.