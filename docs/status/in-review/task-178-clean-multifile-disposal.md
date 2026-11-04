# Task 178 — clean failed multi-file Anatomy Lab downloads

Status: in review, stacked on the lead's Anatomy Lab PR #290.

## Finding
The scene used Promise.all() for multiple GLB loads. A rejected request abandoned previously decoded groups. Models that finished after that first rejection were also left undisposed, even though they were never attached to the scene.

## Change
- Add a generic, unit-tested all-or-nothing loader that disposes successful results when any load rejects.
- Preserve the order of successful files and reject promptly without waiting for a stalled sibling request.
- Route the scene's multi-file fetch through this helper and its existing geometry/material cleanup.
- Test out-of-order success, partial failure, late success after failure, and a clean retry.

## Scope
Only src/islands/anatomylazy.ts, src/islands/anatomyscene.ts, tests/unit/anatomylazy.test.ts and this status note. No real labels, clinical facts, source approvals, model binaries, rights, dependencies, configuration or production gates modified.

## Integration
Based on #290 head `09ea433c0bbbbcf44c3cb6d448ef24218ad35f5b`. This is a clean replacement for the intended 3-file functional change in #431, whose diff currently contains many unrelated staging files. The lead should compare this focused PR before closing the broad one. Existing #416 fixes the independent isolated-build fixture failure that currently blocks #290's full CI. Run exact-head npm run verify, scans and Codex review before integration. Continue to require Christian's release/content approval. Never publish draft models.
