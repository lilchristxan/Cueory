# Task 178: accurate missing-mesh summary in integrated Anatomy Lab

status: in review. Stacked directly on the current integration assist #414 at `e32701d4b00769ddf866e25b127ef96e4769935b`.

## Problem
The lazy whole-body lab currently prints the initial GLB's `missing` count, even though deeper files are still pending and a shared model file may contain a structure another file could report as missing. This can incorrectly tell nursing students that valid structures are absent.

## Fix
Calculate the count from the combined found-ID set. Only count an ID as missing after all model files eligible for its layer have loaded. Pending file IDs are not missing. Keep single-system behavior unchanged.

## Verification
- Focused unit tests cover incomplete shared-file downloads, genuine missing IDs after all relevant files arrive, and an ID found later.
- Browser assertions on the existing BodyParts3D whole-body layer tests check that no false missing alert appears at three and six loaded files.
- No model assets, source names, clinical content, answer keys, license records, approvals, auth, security settings, workflows or deployments changed.
- Requires exact-head type-check, build, unit and Playwright verification. The existing isolated-build missing-fixture failure is addressed separately by #416. The full browser CI limit is addressed separately by #331.
- This is an integration-focused replacement for #444's logic, not a request to merge the #444 branch again. Claude should choose the patch for the intended integration branch and avoid duplicate application.

Remain draft-only until independent review, staged QA, and Christian's publication approval.
