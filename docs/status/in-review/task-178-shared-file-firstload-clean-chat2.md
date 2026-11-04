# Task 178: clean first-load shared-file ID registration

status: in review. Clean six-code-file replacement for the relevant changes in PR #392, based directly on the current anatomy parent #290 at `09ea433c0bbbbcf44c3cb6d448ef24218ad35f5b`.

## Problem
Some anatomy GLBs hold structures assigned to multiple layers. The first lazy whole-body load previously registered only IDs belonging to the outermost visible layer and then cached those files. Deeper IDs in the same GLB could remain unavailable forever, because the file would not load again.

## Change
- Track exact model-file to structure-ID associations from each constituent body system in `wholeBody`.
- Load the outermost layer's files but register all IDs those files actually contain, including IDs for deeper hidden layers.
- Apply the initial hidden state immediately so registered deeper-layer meshes are not shown early.
- Use the same file-ID mapping for later lazy downloads.
- Add synthetic unit regressions for shared-file registration, hidden initial structures and avoiding repeated downloads.

## Reviewable scope
Six anatomy code/test files and this new status note only. The older #392 comparison currently contains 56 files after a staging-history merge. This replacement excludes those unrelated changes. The original #392 should not be directly integrated in addition to this patch.

This is a draft-only feature correction. It changes no real anatomical labels, BodyParts3D GLB files, content approval states, licenses, auth, secrets, deployment settings or workflows. Run exact-head CI, verify browser behavior, and complete independent review before integrating into #290. The separate test-harness prerequisite #416 must first be handled. Do not merge to main or publish unapproved models.
