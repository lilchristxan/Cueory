# Task 178 — file-owner-aware structure availability and missing totals

status: Task 178 (#pending): use exact owning GLBs for student-facing not-loaded/absent structure labels and the whole-body missing count; in review.

## Why
The Anatomy Lab source manifest already provides a `fileIds` map of structure IDs to the specific model GLBs containing them. However, the structure list labels a missing ID as `not loaded yet` whenever *any file in the same layer* is pending, even if its sole owning model file already finished. Meanwhile, the whole-body missing count only uses `load.result.missing` from the initial GLB load and misses absent IDs verified when later lazy files finish.

## Code and tests
- Allow `structureLoadNote` to take the optional exact `fileIds` map. Report `not loaded yet` only when an actual owning GLB has not completed; otherwise report `not in this model`. Keep the older layer-based fallback for data without the map.
- Pass `system.model.fileIds` from the accessible structure list.
- Add `knownMissingStructureIds` that derives the whole-body summary from the latest `foundSet` and exact file ownership, not the first batch's missing list. Mark all pending layer downloads incomplete until their React result updates settle, avoiding transient false counts.
- Keep eager single-system behavior unchanged and display the plural-correct model-files wording.
- Extend existing synthetic Vitest for exact file ownership and add a synthetic missing-count suite covering partially loaded files, shared structure IDs, unlayered IDs, unmapped IDs, and the legacy fallback.

## Safe merge path
Clean integration branch from the reviewed #506 head `f0e2535b4550ec7afe5e4a1787e538a3a2eac85c`. It deliberately combines the focused corrections previously proposed in #516 and #519 **because those PR bases moved and began showing unrelated imported tasks**. Use this clean candidate in place of both. The older #460 missing-count proposal uses broad layer mapping and is an alternative, not an additional patch.

No anatomy asset, official clinical name, medical fact, label source, license, privacy/auth, build configuration, dependency, workflow, deployment, or publication flag changes. No merge into staging/main; require exact-head CI, Codex, browser QA, locked staging, and founder model/source-rights approval before publishing.
