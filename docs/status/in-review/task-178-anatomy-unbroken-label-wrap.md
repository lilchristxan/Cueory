# Task 178: keep long structure names inside anatomy labels

Status: in review

Issue: `wrapText` kept an unbroken word on one line even when its measured width exceeded the allowed width. On small canvases and exported pictures, this can make a structure name extend beyond the label box or image edge.

Change: split **only** a word that does not fit by itself, preserving its source characters and order. Ordinary word wrapping and the official structure names remain unchanged. This is UI text layout only, not clinical-content editing.

Regression: add pure Vitest checks that a long word is fully preserved across lines, each rendered line is within the requested width, and `labelLines` reports a bounded label width. Existing multi-word wrapping checks remain.

Base: `task-178/anatomy-lab` at `ad5304355678dbc7a806ff7b251f8c4c3167f9be` (PR #290). Submit as a stacked assist, not directly to `main` or `staging` while the parent anatomy work is in review.

Scope: `src/islands/anatomylab.ts`, `tests/unit/anatomylab.test.ts`, and this note. No models, data, publishing status, secrets, new dependencies, or infrastructure settings.

Verification: static checks of the exact replacement anchors were completed. Full `npm run verify` and browser tests could not be run through the connected GitHub-only workspace. Require CI on this exact head and independent review before integrating, then reconcile this small patch with the combined anatomy PR #414.
