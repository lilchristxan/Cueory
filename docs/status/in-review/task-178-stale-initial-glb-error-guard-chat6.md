# Task 178 — guard stale initial GLB failures across system switches

status: Task 178 Anatomy Lab race prevention: reject obsolete initial-model success/error callbacks immediately after choosing a different body system; in review.

## Problem
The body-system click already calls `generation.bump()` and `scene.clear()` synchronously, but the preceding system's initial `scene.load(...).then(...).catch(...)` only checks `current`, which is set false by a later React passive-effect cleanup. If the old GLB promise rejects between the click and cleanup, the old error can overwrite the replacement body's loading state. A late success has the same hazard for its associated UI state, even though the scene's internal `loadId` prevents old geometry from becoming visible.

## Focused fix
Capture the current generation token immediately after the new initial-load effect bumps it. Require that token to remain current in the successful result handler, the on-demand `scene.add` continuation, and the error handler. The existing picker invalidation and `current` unmount guard both remain in place. No extra state, request, dependency or model logic is introduced.

## Regression
A synthetic Playwright case intercepts the fixture's initial `fetch()`, holds it while opening the lab, selects another body system, and rejects the fixture promise in the same browser task as the click. A network-route hold keeps the replacement GLB loading while assertions verify that the old failure never appears in an alert and the new system remains selected. A `finally` always releases replacement downloads. Test runs only on the desktop project of each browser engine.

## Scope and release
Based on immutable reviewed Anatomy Lab integration #506 ancestor `f0e2535b4550ec7afe5e4a1787e538a3a2eac85c`. Exactly three files: `src/islands/AnatomyLab.tsx`, `tests/e2e/anatomy-stale-initial-error.spec.ts`, and this note. Distinct from #532's reset of old layer feedback after a click and #502's WebGL retry cleanup, and independent of PNG export races #536/#474. No real GLBs, anatomy content, source/rights attribution, privacy/auth, dependencies, workflows, deployment or publication flags changed.

Exact-head TypeScript, build, Vitest, Playwright, CodeQL and independent Codex review must complete before Claude integrates the narrow patch. Final staging GPU/browser QA, founder anatomy model/source-rights approval and explicit release approval remain required. Do not merge directly into staging or main.
