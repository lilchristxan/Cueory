# Task 178: cancel stale Anatomy Lab picture exports on system selection

Status: in review. Directly stacked on the current reconciliation branch #414, commit `e32701d4b00769ddf866e25b127ef96e4769935b`.

## Fix

- Invalidate an in-progress PNG export synchronously when the student selects a different body system. The existing React effect cancels exports later, but a delayed canvas callback can complete before it runs.
- Preserve the reconciliation branch's search reset, list navigation and other view behavior.
- Add a synthetic Playwright regression that pauses the PNG canvas callback and releases it in the same browser task as the system-picker click. A stale PNG must neither download nor be announced as saved.

## Scope and verification

Two code/test files and this status note only. The existing reconciliation base already includes the concurrency scheduler, syntax corrections, GLB disposal, fixture copying and other integration tests. This focused patch deliberately does **not** replace those files.

An earlier head of this PR mistakenly copied older versions of the loader and browser tests and failed CI. That head is superseded. Verify the replacement's exact 3-file diff and rerun exact-head CI, browser tests, security scans and independent review before integration.

No anatomical data, model assets, clinical names, source rights, publication states, dependencies, auth, hosting or workflow settings change. Draft content remains gated until staging and Christian's approval.
