# Task 178 assist: bound on-demand anatomy downloads

status: Task 178, bounded on-demand Anatomy Lab model downloads and queued-file regression (#428), in review. No anatomy publication or merge approved.

Stacked on lead-owned `task-178/anatomy-lab` at `ad5304355678dbc7a806ff7b251f8c4c3167f9be`. Do not merge directly or publish anatomy models.

## Why

The whole-body `show all` action can issue several `ensure()` requests for different layers at once. The previous loader immediately started every distinct GLB fetch. With 11 draft model files, this can create simultaneous download and decode pressure on phones.

## Change

- `src/islands/anatomylazy.ts`: at most **two** simultaneous **on-demand** model fetches across all overlapping layer requests. Maintain unique per-file in-flight promises, cache successful files, preserve partial successes on failure, and allow retries. Retiring the loader cancels waiting work and ignores late active results.
- `tests/unit/anatomy-loader-concurrency.test.ts`: five synthetic tests for the global two-file cap, shared URLs, queued cancellation, a queued file preloaded elsewhere, partial failures, and a synchronously throwing fetcher.
- `docs/status/in-review/task-178-bound-on-demand-glb-downloads.md`: this status note.

## Boundaries

No clinical facts, anatomy names, model files, source licenses, approval status, authentication, deployment settings, workflows, or dependencies changed. The initial model load is unchanged. The cap bounds on-demand concurrency only; it does **not** lower the total triangle count or replace the phone confirmation proposal in PR #409. Coordinate with the integration changes in PR #414 before landing.

## Validation

GitHub CI on the previous head `4076cdd` passed `npm run check`, `npm run build`, and `npm test`, plus CodeQL, Semgrep, gitleaks and the Cloudflare preview. The browser job was canceled during the larger suite, so the complete workflow was not green. Codex review found no major issues. The fifth queued-preload regression was added afterward and requires fresh exact-head CI. The connected environment cannot clone the checkout to run full checks locally. Independent review remains required. Preserve Task 178's existing human approval and draft publication gates.
