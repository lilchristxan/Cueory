# Task 178: accurate whole-body missing-structure summary on integration branch

status: in review. Stacked on the lead's shared anatomy integration PR #414 at `e32701d4b00769ddf866e25b127ef96e4769935b`. This port of the focused fix in #444 avoids requiring Claude to manually resolve concurrent edits to AnatomyLab.tsx and the on-demand loader.

## Correctness
A per-GLB missing-ID list is not a reliable whole-body summary. Some structures are absent from the first loaded GLB but present in another file assigned to their layer. A not-yet-downloaded layer must be marked pending rather than missing. This patch derives the number only from the combined found-ID set once every eligible file has loaded, while keeping unchanged behavior for a single system.

## Scope and tests
Four existing anatomy interface/loader/unit/browser files plus this status note. Unit tests prove pending, absent and later-found IDs; the existing real-model lazy-loading browser test checks that no misleading missing-count notice appears during shared-file downloads.

## Integration gates
No model data, anatomical labels, medical facts, approval flags, licenses, packages, security configuration, workflows or deployments changed. This is an assist patch for #414, not authorization to publish. Require exact-head CI, browser checks, independent review, the separate #416 isolated-fixture harness repair, and Christian's staging/content approval before any release. Apply this integration patch **instead of** the same changes from parent-scoped PR #444, not both.
