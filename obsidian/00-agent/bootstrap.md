---
title: Session bootstrap
updated: 2026-10-22
---

# Bootstrap

Use progressive disclosure rather than loading the entire vault.

```text
git status --short --branch
git rev-parse HEAD
read AGENTS.md
read obsidian/HOME.md
read obsidian/00-agent/current-state.md
read obsidian/00-agent/handoff.md
graphify --version
```

For a subsystem task, load its architecture/system note, inspect the current callers and implementation, then run a targeted test before editing. If Graphify is available, use a narrow query or `affected` traversal first; treat graph output as navigation evidence, not a substitute for source inspection.

At the end, review the diff, run the relevant gates, update the current-state and handoff notes, and record unverified platform-specific behavior explicitly.
