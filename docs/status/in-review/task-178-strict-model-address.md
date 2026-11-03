# Task 178: validate Anatomy Lab model paths against source system keys

Status: in review

## Why
The `parseAnatomyFile` reader accepted any same-origin `.glb` path, although the draft-model cleanup runs under `public/models/anatomy`. A malformed draft manifest could point outside that directory, or a record for one system could point to another system's GLB. The model release checks and publication gate must not rely on such a mismatch being caught later.

## Change
- Every real `anatomy-<key>.json` must reference the one expected model `/models/anatomy/<key>.glb`, matching `scripts/build-anatomy.mjs` and the current source files.
- The test fixture, and only a record parsed with `{ fixture: true }`, must reference `/preview/anatomy-fixture/fixture.glb`.
- Existing source names, layers, geometry, draft status and credit rules are unchanged.

## Tests
New negative cases cover a GLB outside the anatomy directory, a GLB in a different public folder, a neighboring system's GLB, a nested unexpected folder, a non-GLB URL, a fixture pointing to a real model, and a real manifest pointing to the fixture.

## Safety and integration
Base: lead-owned Task 178 PR #290 at `09ea433c0bbbbcf44c3cb6d448ef24218ad35f5b`. Only `src/islands/anatomylab.ts`, `tests/unit/anatomylab.test.ts`, and this note changed. No actual model assets, medical facts, license/source records, production approval flags, deployment or dependencies changed.

Exact textual replacement and GitHub diff verified. Full `npm run verify` cannot run in this GitHub-only workspace. The shared isolated-build test currently fails importing the synthetic anatomy fixture, and PR #416 already addresses that harness problem. CI must rerun after that prerequisite, then complete Codex review and staging/human publication gates. Do not merge to `main` or release draft models.
