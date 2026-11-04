# Task 178: accurate whole-body missing-structure summary after progressive GLB loads

status: Task 178 progressive Anatomy Lab: count genuinely missing structures against the combined loaded scene after eligible GLB files finish and no layer batch is still integrating, with shared-file, pending, absent, and overlapping-load regression tests; in review.

## Problem
On combined integration #506, the whole-body missing-structure notice still uses `load.result.missing.length` from the initial model. Subsequent layer GLBs may contain a requested ID missing from another GLB, or a structure may not yet be downloaded. This can show false counts or omit genuine missing structures. The structure catalog separately checks which files are loaded, so the warning and list can disagree.

## Change
- Port the pure `knownMissingStructureIds()` helper from reviewed #460, using the existing `structureLoadNote()` rules to check the combined found-ID set and wait until all files eligible to contain a missing structure are loaded.
- Gate status on `pending.size === 0`. Although #506 now publishes individual GLB results progressively, a file cache entry can still precede a React render, and overlapping batches should not cause false missing warnings.
- Keep the prior single-system missing count unchanged.
- Reuse the gated status in each unrepresented structure's catalog note, and provide a stable test ID for the summary.
- Include all five synthetic unit tests from #460 for pending models, shared-GLB false positives, truly absent IDs, later-found IDs and unlayered structures.

## Scope and integration
Exactly four files: `src/islands/anatomylazy.ts`, `src/islands/AnatomyLab.tsx`, `tests/unit/anatomy-missing-count.test.ts`, and this in-review status note. Stacked directly on #506 head `f0e2535b4550ec7afe5e4a1787e538a3a2eac85c`, preserving its progressive per-file callbacks, active/queued cancellation, system switching, model counts, camera guards and existing tests. No actual models, clinical facts, official names, source-rights data, publication flags, dependencies, authentication, workflows or hosting changed.

Claude: this is a focused adaptation of the corrected missing-summary logic from #460; do not apply #460 again if integrating this patch. Require exact-head Astro check/build/Vitest/Playwright and independent review. Preserve locked staging, source/rights review, and founder approval before any draft publication.
