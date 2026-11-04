# Task 178: complete progressive anatomy loading and retirement together

status: Task 178 integration: publish each completed GLB before slower sibling files finish, and settle all active or queued layer waiters immediately on system switch while preserving the two-request concurrency limit. Synthetic unit and browser regressions added. In review.

## Goal
The reconciled Anatomy Lab has immediate system-switch invalidation in #500, while #496 separately publishes completed GLB results and #504 separately resolves retired request waiters. This branch validates the **combined runtime behavior** on one testable tree, without overwriting the newer viewer/mesh-index logic.

## Provenance and scope
Base: #500 exact head `fe23e2d15a368ff4f4c6eabdccc099ca09421a0f`.
The helper `createOnDemandLoader`, progressive UI observer, and synthetic regressions were adapted from #496 and its stacked #504 head `5aac0f6de5cd7354fa60815b9f5f6d94de538cc9`. This branch preserves #500's synchronous `generation.bump()`, `visibilityIntent.bump()`, `loader.retire()`, `scene.clear()`, and model/loading/selection/quiz resets.

Only these files changed: `src/islands/anatomylazy.ts`, `src/islands/AnatomyLab.tsx`, `tests/unit/anatomylazy.test.ts`, `tests/unit/anatomy-loader-concurrency.test.ts`, `tests/e2e/anatomy-lab.spec.ts`, and this in-review note. No actual model files, anatomical facts, label texts, license status, permissions, dependencies, workflows, security settings or deploy configuration changed.

## Claude integration and release safety
Reconcile this focused source/test patch into #414 only once. Do not also reapply the equivalent full-file changes from #496 and #504. Require exact-head TypeScript/build/Vitest, focused and full Playwright, CodeQL/security scans and independent review. Preserve staging preview, approved source/rights QA, and founder publication permission. Draft anatomy must remain unpublished.
