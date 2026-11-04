# Task 178: clean mesh-ID indexing integration on the loader/export CI branch

Status: in review.

## Why

The Anatomy Lab's merged scene loader still omitted ownership for mesh nodes whose structure ID was already indexed by an earlier GLB. This misclassified later meshes as unlabeled, so tapping, hiding, highlighting and label bounds did not cover the structure consistently across files.

The first source-level fix is in #475. Another integration attempt, #478, currently includes unrelated Task 233 contrast and Task 285 ARIA-test changes in an eight-file comparison. This branch provides **only** the intended four-file mesh correction, based on #469's exact combined fixture, loader and export head `62c8f397090f0936be45476672f432784f60aab1`.

## Changes

- Preserve repeated structure names in the same mesh bucket using a renderer-independent Three.js helper.
- Recalculate bounds when new geometry arrives for a previously seen structure ID.
- Keep the #469 multi-file GLB failure cleanup and stale-export guard unchanged.
- Include four synthetic unit tests for reused structure IDs, enlarged bounds, unrelated meshes and nested-node ownership.

## Release gates

This is a clean integration candidate, not publication approval. No anatomical model bytes, structure labels, sources, licensing, clinical facts, privacy/auth, security, dependencies or deployment are changed. All eleven draft anatomy source manifests have unique structure IDs across files today, so the change protects future shared/overlapping GLB inputs.

Before integrating into #290, require exact-head Astro type checking, build, unit tests, Playwright browser checks, security scans and independent review. Keep preview and staging first, and require Christian's approval of any real anatomy content and rights before publication.
