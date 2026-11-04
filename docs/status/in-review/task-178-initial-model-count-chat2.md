# Task 178: accurate initial anatomy file count

status: in review; focused anatomy UI/fixture regression stacked on lead-owned #290 at commit 09ea433c0bbbbcf44c3cb6d448ef24218ad35f5b.

## Finding
The whole-body view initialized its “model files loaded” counter to the number of first-layer files *before* any GLB request finished. A rejected skin.glb request left the counter saying “1 of 11” even though no model was loaded and the view displayed a loading error.

## Fix
- Start the file counter at zero when a system is selected.
- Increase it only after `scene.load` succeeds, using the first-layer loader's loaded-file count.
- For the non-lazy full-file path, count all model files only after the full load succeeds.
- Leave normal successful lazy peeling and on-demand counters unchanged.

## Regression
A Playwright test opens the real draft whole-body preview in a build that includes the models, aborts the initial skin GLB request, waits for the load error, and checks that the view reports zero of eleven files loaded. Existing whole-body browser tests require “1 of 11” after a successful initial load.

## Integration
Three files: `src/islands/AnatomyLab.tsx`, `tests/e2e/anatomy-lab.spec.ts`, and this status note. No GLB assets, anatomical names, clinical facts, licensing or source records, approval flags, security settings, workflows or dependencies changed.

Require exact-head check/build, unit tests, Playwright, security scanning and independent review. The isolated-site test-harness failure in sibling anatomy CI is addressed by prerequisite #416; do not call this PR green until it is rerun after the prerequisite. Preserve the lead's staging-first and founder human anatomy-publication approvals. Do not merge directly to main.
