# Task 178: keep both anatomy publication gates aligned on full Git refs

status: Task 178 (#487 follow-up): normalize refs/heads/main in the production model-pruning gate so unapproved GLB assets cannot remain in a full-ref production build. Added synthetic asset-pruning and cross-gate regression tests. In review.

## Problem
Parent PR #487 normalizes Git branch refs for `draftsAllowed()`, the build-time HTML/structure gate. An independent function, `keepsDrafts()`, still treats `refs/heads/main` as a preview and does not delete draft GLBs from `dist/models/anatomy`. This is a defense-in-depth issue for a Workers Build using a fully qualified ref, not a claim that Cloudflare currently supplies it.

## Change
- `keepsDrafts` now normalizes the `refs/heads/` prefix, matching `draftsAllowed`.
- Tests build synthetic draft and approved model files, then verify `refs/heads/main` removes all draft and stray GLBs while keeping only the approved model, even if local draft opt-in is set.
- Tests compare both independent publication gates across short names, full refs, empty refs and local draft overrides.
- Explicit `refs/heads/staging` remains a valid preview and keeps the synthetic draft assets.

## Scope and gates
Stacked directly on #487 head `3881fe3d9cec4aee164c086cd91ee6e7cc10a031`. Only `src/visuals/prunedrafts.ts`, `tests/unit/prunedrafts.test.ts` and this status note are changed. No source names, clinical facts, model binaries, content approvals, dependencies, deployment settings, production branches, auth or secrets are changed.

Merge both #487 and this follow-up **together**, not #487 alone. Require exact-head type-check, build, unit/Playwright CI, security scans, Codex review, and existing staging/source-rights/founder approvals. No release or merge to main is authorized.
