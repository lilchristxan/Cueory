# Task 178 assist: bound on-demand anatomy downloads

Status: **in review**. Stacked on lead-owned `task-178/anatomy-lab` at `ad5304355678dbc7a806ff7b251f8c4c3167f9be`. Do not merge directly or publish anatomy models.

## Why

The whole-body `show all` action can issue several `ensure()` requests for different layers at once. The previous loader immediately started every distinct GLB fetch. With 11 draft model files, this can create simultaneous download and decode pressure on phones.

## Change

- `src/islands/anatomylazy.ts`: at most **two** simultaneous **on-demand** model fetches across all overlapping layer requests. Maintain unique per-file in-flight promises, cache successful files, preserve partial successes on failure, and allow retries. Retiring the loader cancels waiting work and ignores late active results.
- `tests/unit/anatomy-loader-concurrency.test.ts`: synthetic tests for the global two-file cap, shared URLs, queued cancellation, partial failures, and a synchronously throwing fetcher.
- `docs/status/in-review/task-178-bound-on-demand-glb-downloads.md`: this status note.

## Boundaries

No clinical facts, anatomy names, model files, source licenses, approval status, authentication, deployment settings, workflows, or dependencies changed. The initial model load is unchanged. The cap bounds on-demand concurrency only; it does **not** lower the total triangle count or replace the phone confirmation proposal in PR #409. Coordinate with the integration changes in PR #414 before landing.

## Validation

An isolated Node `--test` behavioral smoke test of the queue logic passed three cases (concurrency, retiring, and partial retry). Full project TypeScript, Vitest, Astro build, Playwright and CI have **not** been run locally because this environment cannot clone the GitHub checkout. Exact-head CI and independent review are required. Preserve Task 178's existing human approval and draft publication gates.
