# Task 178: clean collapsed Anatomy Lab label-layout guard

Status: in review.

## Problem

When the canvas height is zero, negative or smaller than its two edge margins, placeLabels calculates nonpositive available height. The balancing loop can run with empty label columns, select an undefined label and crash instead of reporting unavailable label space.

## Scope

- Return an empty layout and de-duplicated left-out IDs when available height is nonpositive or not finite.
- Preserve existing label placement when the canvas is large enough.
- Add three synthetic Vitest regressions for collapsed sizes, repeated IDs, and normal recovery.

This is the clean three-file version of the Task 178 correction in PR #476. That PR currently includes unrelated Task 233 contrast and Task 285 ARIA reference files. This branch is based directly on the current Task 178 reconciliation head `5085cce47985d6ecacb94ab5408a78bac5604efa`. It changes no clinical facts, anatomical labels, models, licenses, authentication, dependencies, security settings, workflows or deployment.

## Approval

Requires exact-head type check, build, unit tests, browser checks and independent review on the integrated branch. No draft anatomy model may be published without its rights/source review, locked staging validation and Christian's approval.
