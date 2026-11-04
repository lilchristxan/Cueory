# Task 178: repeated-ID mesh indexing on combined CI branch

Status: In review. This focused four-file patch is based on the combined fixture/loader/export integration candidate #469 at `62c8f397090f0936be45476672f432784f60aab1`, itself stacked on lead-owned Anatomy Lab #290.

## Problem and fix

The scene registered an owner for a structure node only when its ID was absent from its existing index. When another GLB reused that ID, the new mesh was put into the unlabeled bucket and ignored the matching pick, hide, highlight and label behavior. New geometry also failed to refresh the existing label's bounding box.

Add a renderer-free Three.js indexing helper that registers each named node irrespective of whether the ID was previously known, appends each mesh to the same bucket, and identifies all touched IDs for bounds refresh. Four synthetic unit tests cover repeated IDs, updated bounds, unrelated meshes, and nested structure ownership.

This exact branch preserves #469's fixture-test repair, failed GLB resource cleanup and same-tick stale PNG cancellation. The current eleven draft model manifests have zero cross-file duplicate IDs, so this is future shared/overlapping-geometry correctness hardening, not a claim about currently published anatomy.

## Gates

Four-path diff only: this note, one helper, one existing scene, and one new test. No real anatomy, source records, model binaries, rights, approved/draft flags, authentication, dependencies, security or deployment changes. Require exact-head CI (Astro, build, Vitest, Playwright, CodeQL, security scans), independent review and staging acceptance. Claude must integrate #469 before this stacked PR, or take the equivalent isolated four-file patch #475 instead, **not both**. Draft publication remains subject to Christian's explicit rights/content approval.