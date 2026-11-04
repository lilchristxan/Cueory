# Task 178: dispose orphaned decoded GLBs after a failed initial load

Status: in review. Clean replacement for PR #431 (whose GitHub comparison includes 59 unrelated paths).

## Issue

The initial multi-file 3D loader used Promise.all directly. When one GLB failed, previously decoded sibling models were not installed in the visible scene and their geometry and materials were not disposed. Sibling requests that completed after the error could also leave decoded models in memory.

## Changes

- Introduce a pure loadModelsOrDispose helper that preserves successful file ordering.
- Release all completed decoded objects on failure and release any late successful objects.
- Use the helper in the existing scene loader with the existing disposeGroup cleanup.
- Add three unit regressions for out-of-order success, partial failure, and late cleanup with a fresh retry.

This is a loader cleanup only. The on-demand partial-success loader is intentionally unchanged, because it keeps successfully installed layers available to the student. No 3D model binaries, anatomy labels, license records, publication state, clinical facts, authentication, dependencies or deployment configuration are touched.

## Review and merge gates

- Branch is based on the lead-owned Anatomy Lab PR #290 at commit `09ea433c0bbbbcf44c3cb6d448ef24218ad35f5b`, with the PR targeting `task-178/anatomy-lab`. This branch must not be merged directly to `main`.
- The four-file GitHub comparison and source anchors have been inspected. Local full `npm run verify` and browser tests cannot run in this GitHub connector workspace. Same-head CI and independent code review are required.
- Draft models remain unpublished until their separate model/source/rights checks, staging review and Christian's approval are complete.
