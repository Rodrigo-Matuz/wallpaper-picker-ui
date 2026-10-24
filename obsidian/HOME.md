---
title: Wallpaper Picker UI AI workspace
type: index
updated: 2026-10-22
---

# Wallpaper Picker UI

This is the repository's lightweight, Obsidian-compatible knowledge base for coding agents. It records verified architecture, security boundaries, test commands, decisions, and handoffs without copying source files.

## Bootstrap for a new session

1. Read root `AGENTS.md`.
2. Inspect the Git branch, revision, and working tree.
3. Read [[00-agent/current-state]] and [[00-agent/handoff]].
4. Read only the notes relevant to the requested subsystem.
5. Check Graphify availability and freshness using [[08-reference/graphify]].
6. Inspect current source before trusting an older note.

## Navigation

- Agent operations: [[00-agent/bootstrap]], [[00-agent/working-rules]], [[00-agent/current-state]], [[00-agent/handoff]]
- Architecture: [[01-architecture/overview]], [[01-architecture/frontend]], [[01-architecture/rust-backend]], [[01-architecture/ipc-boundaries]], [[01-architecture/decisions]]
- Systems: [[02-systems/wallpaper-playback]], [[02-systems/windows-backend]], [[02-systems/thumbnail-pipeline]], [[02-systems/thumbnail-cache]], [[02-systems/configuration]], [[02-systems/application-lifecycle]], [[02-systems/theme-system]], [[02-systems/translations]]
- Security: [[03-security/threat-model]], [[03-security/ipc-permissions]], [[03-security/command-execution]], [[03-security/audit]]
- Quality and performance: [[04-performance/baselines]], [[04-performance/thumbnail-benchmarks]], [[04-performance/investigations]], [[05-quality/testing]], [[05-quality/known-issues]], [[05-quality/regression-matrix]]
- Platforms and delivery: [[06-platforms/linux]], [[06-platforms/windows]], [[06-platforms/nixos]], [[06-platforms/updates-and-releases]]
- Plans: [[07-plans/overhaul]], [[07-plans/backlog]], [[07-plans/future-wallpaper-engine-integration]]
- Code intelligence: [[08-reference/graphify]]

## Working conventions

Source code is authoritative. Notes distinguish verified facts from hypotheses and plans. Update the relevant note after a meaningful change and keep [[00-agent/handoff]] concise. Do not store credentials, signing keys, tokens, or private user data here.
