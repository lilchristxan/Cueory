# Task 178: do not display labels for offscreen structure anchors

status: Task 178 (#435): prevent offscreen anatomy labels and wrap oversized unbroken names within view/export bounds; synthetic unit regressions added; in review.

## Problem
The 3D projection helper may return an anchor outside the current viewport when the student zooms or turns a structure out of the view. The label-placement helper used to accept any finite coordinates, clamp the text box to the screen edge and draw a leader line towards a structure the student could not actually see. This also affects exports cropped around a selected model. Invalid measured box dimensions could propagate NaN coordinates.

## Change
Only place labels whose projected anchors lie inside the active view and whose measured box sizes are finite and positive. Keep ordinary visible anchors and their text unchanged. Out-of-view/invalid anchors join the existing `leftOut` list so the student sees the existing "no room to label" note instead of a misleading line.

## Regression
The Vitest case exercises all four screen edges, invalid sizes and one valid visible anchor. The existing overlap, seven-label wide-picture and normal placement tests remain.

## Scope and verification
Base: lead-owned PR #290 (`ad5304355678dbc7a806ff7b251f8c4c3167f9be`). Exactly one pure helper, one unit-test file and this status note. No anatomical models, names, licenses, clinical facts, publication flags, security settings, dependencies or private content were changed.

Source replacement was checked against the exact parent content. Full `npm run verify` and Playwright were not run locally from this GitHub-only workspace. Require exact-head CI, Codex review, and integration after the ongoing reconciliation PR #414. This is **not** release approval.

## Combined label wrapping fix (from former PR #427)
The same helper now wraps a word that is wider than its label column, preserving all source characters. This prevents oversized official names from extending outside label boxes and exported images. Synthetic tests check per-line measured widths and label width. PR #435 supersedes PR #427, which should not be applied separately.
