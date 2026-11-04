# Task 178 — unblock isolated Anatomy Lab CI build

status: Task 178 (#290) isolated build fixture repair: copy synthetic `tests/fixtures` into the temporary Astro build and test both missing and present fixture directories; in review.

## Verified failure
The exact head of lead Anatomy Lab PR #290 (`59355399950e2011625b7a116d56589f30d71bdb`) failed CI run 41777586647 in `tests/unit/building-notice-off.test.ts`: the isolated build cannot resolve `../../../../tests/fixtures/anatomyfixture` from `src/pages/preview/anatomy-fixture/[name].glb.ts`. The parent build works, but its separate temporary directory copies `src/` without the synthetic test fixtures imported by the preview route. GitHub reported 4,222 other passing unit tests before this one failure.

## Change
Bring the already-reviewed, narrowly scoped `copyBuildFixtures` helper and its synthetic regression test from PR #416 into a clean branch directly atop the current lead PR #290. It copies only `tests/fixtures` (if available) into the isolated temporary build. Existing comparison of generated HTML pages and building-notice checks remains intact.

## Merge and release gates
This is a direct alternative to integrating the same fixture-copy hunk through PR #416 or combined PR #469. Apply it exactly once. Two changed files: `tests/unit/building-notice-off.test.ts` plus this note. No real anatomy source/models, clinical facts, licenses, production draft gate, security, auth, dependencies, workflows, hosting or approval states changed.

GitHub exact-head CI, Codex review and final Playwright browser gate must pass before Claude integrates this into PR #290. A passing build does not authorize publishing real anatomy data. Keep the staging-first and founder source/rights approval requirements.
