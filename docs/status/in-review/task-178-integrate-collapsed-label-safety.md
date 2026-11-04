# Task 178: collapsed label canvas merge safety

Status: In review. Stacked directly on the full-ref production-guard integration [PR #491](https://github.com/lilchristxan/Cueory/pull/491), exact base head `727299408a6747ff518f802068cc150ad043e2c0`, which already includes #481's PNG attribution, validated model-source fields, offscreen label checking, failed-GLB cleanup and synthetic fixture build repair.

## Bug
`placeLabels()` calculates `room = height - 2 * margin`. When the 3D canvas is collapsed and the room is nonpositive, its rebalancing `while` loop runs even for an empty column, because `need([]) = 0`. The next statement accesses an undefined label and crashes instead of returning omitted names.

## Change
Apply the existing focused guard from [#486](https://github.com/lilchristxan/Cueory/pull/486) without rewriting the already-integrated offscreen or text-wrapping fixes. With no finite positive vertical space, return zero placed labels and each left-out ID in first-occurrence order. Import that PR's independent synthetic Vitest suite verbatim to check zero, one, negative, NaN and margin-only heights, duplicate IDs and recovery at ordinary dimensions.

## Safety and verification
Three files, one feature topic. No 3D assets, official anatomy words, clinical facts, source licenses, publication approvals, auth, workflow, dependency or deployment changes. Source/diff checked. Run exact-head Astro check/build/Vitest, focused Playwright, CodeQL and Codex before integration. This stacked integration is *not* a merge or release approval. Keep the `needs-christian` hold, source/rights checks and locked staging gate. Claude should apply this guard only **once**, whether from this PR or from standalone #486.
