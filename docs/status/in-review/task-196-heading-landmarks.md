# W30 — Task 196

Scope recorded before publication: tests/e2e/a11y-sweep.spec.ts and this status note only. Base reconstructed staging 65a05c3.

Adds a separate per-route heading and landmark sweep using the existing built-route enumeration. Checks exactly one h1 and main, no skipped heading levels, and keyboard activation of the first skip link moving focus to main.

Validation: check passed (367 files, zero errors and warnings), build passed, 3297 unit tests passed. Phone browser execution blocked before tests run because Chromium headless shell 1248 is absent. No browser pass or page defect is claimed. CI browser execution required. No source-page changes, pushes or merges.

Status: local implementation ready for coordinator publication after fresh board and branch ownership reconciliation.
