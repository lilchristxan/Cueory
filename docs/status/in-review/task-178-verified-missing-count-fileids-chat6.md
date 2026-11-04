# Task 178 — verified whole-body missing count

status: Task 178 (#pending): count only structure IDs confirmed missing from their own completed model files, without counting still-downloading anatomy layers; in review.

## Defect
PR #506 publishes each successful GLB's found IDs immediately, but the visible missing-structure summary still only reads `load.result.missing` from the first initial GLB load. A structure absent from a later loaded file therefore does not contribute to the whole-body missing count. Reading each later file's `result.missing` directly is also unsafe when structures may be owned by more than one GLB.

## Fix and safety
- Add pure `knownMissingStructureIds` helper, which delegates to PR #516's exact per-file `structureLoadNote`. It counts only names absent after all GLBs owning the structure have loaded.
- The UI computes the count from the current `foundSet`, not the first load's missing array. While any layer batch is still settling, treat its files as pending so an uncommitted `found` state cannot cause a false missing count.
- Keep the original eager single-system count unchanged. Change the summary to say `loaded model files` (plural-appropriate), with a test ID for future browser QA.
- Add synthetic Vitest for pending model ownership, shared IDs, unlayered IDs, manifest omissions and the legacy fallback. No medical statements or real model data are added.

## Scope and integration
Direct base: PR #516 (`task-178/structure-file-availability-chat6`) exact head `f6d5d95073eacfaabcc8d79cac550b00db01cb0a`. Only `src/islands/anatomylazy.ts`, `src/islands/AnatomyLab.tsx`, one synthetic unit-test file, and this status note. An earlier PR #460 attempts the missing-summary fix using broad layer ownership and contains unrelated test files; this is a clean file-owner-aware alternative. **Do not apply the two implementations together.**

GitHub exact-head CI, Codex review and browser coverage are required before Claude merges. Staging first, no direct production merge, and founder model/rights/content approval remain mandatory. No source names, GLB assets, licenses, auth, dependencies, workflows, deployment rules or draft publication flags change.
