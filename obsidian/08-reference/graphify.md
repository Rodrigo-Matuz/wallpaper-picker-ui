---
title: Graphify reference
updated: 2026-10-22
---

# Graphify reference

Graphify is a deterministic/code-oriented repository map used as a navigation aid. It is not a substitute for reading source or running tests.

## Baseline artifact

The refreshed ignored `graphify-out/graph.json` was generated after the thumbnail-map migration fix with the supported code-only pipeline (`extract --code-only --max-workers 1 --no-cluster`, followed by `cluster-only --no-label --no-viz`). Extraction reported 2,240 nodes and 3,970 edges; clustering reported 2,240 nodes, 3,858 graph edges, and 99 communities. The graph is a navigation aid, not proof of runtime behavior.

## Safe workflow

From the repository root, use the installed CLI and explicit project/output paths. For a current code-only refresh, use the supported extraction/update flow with one worker, then rerun clustering/report generation only if required. Keep `graphify-out/` ignored and do not treat its generated files as product source.

When a graph query is used, verify important nodes and relationships against current source. Graph edges can be inferred or stale after source edits; a query is an index, not proof.

## Current query evidence

A thumbnail/capability query located the relevant frontend map/clear/handle modules, the Tauri capability, Rust command modules, and application-work tests. The graph pointed to the right subsystem but used baseline line locations, so the current files remain authoritative.
