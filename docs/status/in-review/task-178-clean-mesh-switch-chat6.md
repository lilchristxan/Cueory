# Task 178 — clean mesh + system-switch integration candidate

Status: in review. This is a fresh six-file branch from the current PR #469 integration head `2ad3c46bfd78e31e1be6324a0e797acc13a2210d`, not a rebased or force-updated version of another worker's PR.

## Contents

1. Integrates the code and four synthetic tests from the previously Codex-reviewed mesh-index correction in PR #482, commit `bce05ad4ae52ce82db9472081f48cdfaea77c99c`. When separate GLBs contain meshes for the same structure ID, they share that structure's pick, hide and highlight state, with refreshed bounds.
2. Adds a synchronous loading-state and old quiz/selection reset on body-system change (the focused fix in PR #493), before the next React effect clears and reloads the scene.
3. Extends the held-GLB Playwright system-switch check to ensure quiz and PNG export actions stay disabled throughout model loading.

This branch preserves the current PR #469 fixture-copy build repair, safe failed-model disposal, and early PNG export-generation invalidation.

## Conflict avoidance and gates

PR #482 was reported dirty against its moving base after additional unrelated commits. This clean alternative copies only the reviewed helper and tests and applies their small scene integration against current PR #469. Do not merge both mesh implementations or the original switch guard twice. PR #493 remains an isolated alternative if Claude prefers separate review.

No anatomy model bytes, source labels, clinical content, licenses, publish flags, auth, security workflows, dependencies or deployment settings changed. The code was reviewed by source comparison, but npm and Playwright were unavailable locally in the GitHub-only workspace. Require exact-head CI, Codex code/security review, browser regression, staging preview and founder model/source-rights approval before any release.
