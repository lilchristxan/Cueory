# Task 178 — deterministic held-GLB browser regression

status: Task 178 Anatomy Lab browser test: prevent a false timeout by releasing all held GLB routes only after the next body-system request is intercepted, while allowing later sibling requests through; in review.

## Problem
The system-switch browser test in `tests/e2e/anatomy-lab.spec.ts` could drain its pending route-release callbacks before the new GLB request had entered the Playwright route handler. The React loading overlay appears before or alongside the request, so an empty drain could strand a later request and produce a misleading 20-second timeout. If a system has multiple files, releasing only the callbacks already queued can also strand a late-starting sibling.

## Fix
Use a two-phase `holdRequests` flag in the existing test. Assert a request is actually pending in each phase, release its held callbacks, and allow every later request to continue while the phase is no longer held. Reset the flag before the next system selection. The existing viewer, quiz, camera and PNG assertions are unchanged.

## Scope and gates
Base: PR #503 exact head `1b6229fad9c84c09be612de7190d54408a7def21`. Exactly two files changed: this status note and the existing browser test. No production code, anatomy models, clinical facts, source names, rights, auth, dependencies, workflows, deployment or draft approvals changed.

The public GitHub connection allows reviewing and editing source, but the local runtime cannot fetch GitHub or install the project dependencies. Require exact-head CI and Playwright confirmation, Codex review and Claude integration before merge. Do not apply this test change twice from older stacked branches.
