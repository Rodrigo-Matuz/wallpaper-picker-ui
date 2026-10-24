---
title: Updates and releases
updated: 2026-10-22
---

# Updates and releases

The updater configuration requires signed versions, disallows downgrades, and points at the public `latest.json` feed. The frontend/native policy distinguishes read-only support detection from consent, download, signature verification, installation, and restart.

The release workflow is tag-triggered, creates a draft release, builds Linux packages and Windows NSIS in a matrix, includes updater metadata through the current `tauri-apps/tauri-action@v1` contract (`uploadUpdaterJson` and `updaterJsonPreferNsis`), and has a final draft-manifest verification job. It also contains a Linux-only flake update/commit step.

No release tag, push, installer execution, signing-key operation, hosted CI run, or updater installation was performed for this working tree. Treat the existing updater documentation's historical version/commit claims as historical until revalidated against current source and release metadata.