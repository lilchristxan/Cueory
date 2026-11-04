# Task 178: combined Anatomy Lab CI candidate

Status: in review. Stacked only on the lead-owned Anatomy Lab PR #290, based on commit `09ea433c0bbbbcf44c3cb6d448ef24218ad35f5b`.

## Why combine these patches

Three independent focused assists are blocked from end-to-end CI by the same isolated test fixture import. This branch puts the existing fixture-copy test repair and two separate viewer fixes on one clean testing head, so Claude can review one exact tree and run the browser tests.

## Contents

- #416 test-harness repair: copy synthetic `tests/fixtures` into the temporary Astro build made by `building-notice-off.test.ts`, including a regression for missing and present fixture directories.
- #454 GPU resource cleanup: when an initial multi-file GLB batch fails, dispose already decoded and late-arriving models without blocking prompt rejection; four regressions cover order, partial failure, late completion and synchronous decoder errors.
- #461 PNG export cancellation: invalidate the old picture generation synchronously when a different body system is selected, and test the same-tick canvas-toBlob race with the synthetic fixture.

## Files and release gates

Exactly six code/test files plus this one status note. No clinical names, models, sources, licenses, status approvals, auth, workflows, CSP, dependencies or deployment settings changed. Do not independently merge #452, #431 or duplicate #462 on top of this combined candidate.

Run same-head `npm run verify`, security scans, browser/preview checks and independent code review. This integration is **not** approval to publish draft models. Christian's rights and content review and the staging-first release rules still apply.
