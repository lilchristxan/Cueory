# Task 178: require source-file identity and type

status: Task 178 (#447): unified anatomy manifest validation, id, kind and exact model path with synthetic-fixture exception; regression tests added; in review.

## Finding
The Anatomy Lab parser checked a source record's title, publication status, model URL and labels but never checked its Visual `id` or `kind`. This could let a mismatched `anatomy-*.json` record or a diagram/overlay be treated as a 3D anatomy system. The source files and generated model naming contract already expect `id: anatomy-<system>` and `kind: model`.

## Change
- Require a source file's `id` to equal `anatomy-<system>`, where `<system>` is parsed from its filename.
- Require `kind` to be `model`.
- Apply the same checks to the synthetic fixture, which is explicitly parsed using its fixture flag.
- Tests cover missing and mismatched IDs, unrelated visual kinds, and fixture rejection. Existing correctly formed source records remain unchanged.

## Scope and verification
Stacked on lead-owned Anatomy Lab PR #290 at `09ea433c0bbbbcf44c3cb6d448ef24218ad35f5b`. Only `src/islands/anatomylab.ts`, `tests/unit/anatomylab.test.ts` and this note change. No model binaries, real names, clinical facts, licenses, status flags, new dependencies, auth or deployment settings are modified.

Source anchors and diff reviewed. Complete local `npm run verify` was not available in the GitHub-connected environment. CI on this exact head and independent review are required before integration. The separate shared test-harness blocker is being handled in PR #416. Keep draft publication restricted and do not merge into `main`.

## Consolidation for Claude
The exact-model-path guard and negative tests from sibling PR #441 are now integrated into this branch. PR #447 covers both identity/type and model-address validation, so do not independently apply #441 afterward. In the combined `sampleSystem` test helper, the source ID and model URL both match each synthetic system filename. Full end-to-end CI still requires the separate isolated-fixture copy repair #416.
