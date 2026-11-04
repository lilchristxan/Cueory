# Task 178 — cache owning-GLB structure index

status: Task 178 Anatomy Lab owner-index performance: build a reverse structure-ID-to-file lookup once per immutable whole-body manifest instead of rescanning all GLB IDs for each structure row and missing-count calculation; in review.

## Problem
The per-file missing-state correction uses `Object.entries(fileIds)` and `Array.includes` for every structure. The whole-body list can include many IDs across multiple GLB files, and the missing-count calculation repeats the search for every missing ID on each React render. A new list row or layer progress state should not force that repeated indexing work.

## Narrow fix
Keep the exact existing ownership and fallback behavior. Cache the reverse file owner map in a module-scoped `WeakMap` keyed by the existing immutable `fileIds` manifest object. The first lookup builds a map from structure ID to its distinct owning URLs. All subsequent list, quiz and missing-count checks use that map. Weak keys allow discarded body-system catalogs to be collected. No new dependency, persisted data, API or network call.

## Synthetic regressions
- 250 structure IDs over 10 GLBs verify the whole-body missing-count calculation and 250 subsequent individual status lookups enumerate the original file map just once.
- A different `fileIds` object produces its own index, with correct pending-file status.
- Duplicate ID rows in an individual model file do not cause duplicate owner checks.

## Merge guidance
This optimization stacks on the exact five-file ownership-status snapshot `b4603951de1eb85d6711b62a732e48736339267d` from Anatomy Lab review #523, itself descended from #506. Integrate only after the underlying correctness work, or port the small cache hunk into whichever implementation Claude selects (#522/#525 are overlapping alternatives). Do not merge alternative structure-status/count patches twice.

No clinical facts, source names, GLB assets, model licenses, approval flags, auth, dependencies, security rules, workflows, deployment or data rights are changed. Exact-head type, build, unit tests, browser tests and Codex review are required before integration. Staging and founder source-rights approval remain mandatory. No direct main merge.
