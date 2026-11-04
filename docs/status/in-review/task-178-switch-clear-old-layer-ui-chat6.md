# Task 178 — clear stale layer UI during system switches

status: Task 178 Anatomy Lab system-switch feedback reset: immediately clear old layer progress, layer errors, model-file count, export notes and label feedback when the student selects another body system; in review.

## Problem
The current system picker synchronously invalidates the previous GLB, quiz and selection, but leaves `pending`, `layerError`, `filesLoaded`, `exporting`, `exportNote`, `labelNote` and `announce` until the later passive GLB-load effect. During that gap, the new system can show the previous system's loading message, retry control or model-file count. This is especially confusing when leaving a slow/failed whole-body layer.

## Fix
In the same system-picker event that clears the previous scene and sets `load` to loading, reset only those transient previous-system UI values. Keep preferences, layer catalog, and new-system data unchanged. The existing load effect still performs its normal cleanup. A Playwright regression holds the old whole-body vessels GLB, verifies a pending layer message, then selects another system and checks the obsolete message is gone. The test always releases its request hold.

## Scope and integration
Based on exact reviewed safe-loading parent PR #506 commit `f0e2535b4550ec7afe5e4a1787e538a3a2eac85c`. Changes only `src/islands/AnatomyLab.tsx`, the existing `tests/e2e/anatomy-lab.spec.ts`, and this status note. Distinct from PR #502's **WebGL retry** state cleanup and from PR #520's **layer control readiness**. No code for either change was copied.

All medical content, GLB assets, source names, licensing, auth, credentials, approval flags, dependencies, CI workflows and deployment settings remain unchanged. Require exact-head CI (Astro check, build, Vitest, Playwright), Codex review, locked staging QA and founder source-rights/content approval. Do not merge to main, staging, or publish draft models directly.
