# Task 178: apply visible-pixel threshold consistently (clean integration)

status: in review. Three-file source/test/status correction on Task 178 integration PR #414 head `5085cce47985d6ecacb94ab5408a78bac5604efa`. The code and synthetic tests are exactly the focused anatomy content in #465, without its accidental Task 233/285 files.

## Problem and fix

The existing `findVisibleAnchors()` returns a “visible” label as soon as the projected center matches one ID pixel, bypassing the stated `minPixels=3` threshold. A center hit now requires the same pixel-count minimum as any other label. Off-center visible shapes search only their occupied bounds, rather than rescanning the entire ID image separately per label. Preserve exact center coordinates when sufficiently visible and deterministic nearest-pixel ties.

## Coverage and integration

Five synthetic Vitest cases cover one/two/three-pixel thresholds, centered and off-center shapes, empty structures, and a bound on pixel reads. Existing phone Playwright test `tests/e2e/anatomy-lab.spec.ts:263` was seen failing on #485's older base when it expected an occluded test cube to say “(behind)”. This threshold defect could explain that failure; **the test must be rerun on this patch before claiming it is resolved**.

No clinical content, model files, label text, source/license metadata, approval status, auth, dependencies, workflow or deployment settings changed. Require exact-head CI and browser coverage, independent review, locked staging QA, rights/source review and Christian's explicit anatomy publication approval. Do not merge directly into main.
