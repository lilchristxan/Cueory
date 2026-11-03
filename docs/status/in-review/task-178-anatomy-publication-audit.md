# Task 178 — audit every shipped 3D asset

status: Task 178, anatomy production audit (#433): reject unapproved public GLB, glTF, OBJ and STL files at any URL; added regression tests.

## Problem
The production artifact audit previously inspected only `dist/models/anatomy/**/*.glb`. A draft GLB copied to another public directory or an unapproved raw `.gltf`, `.obj` or `.stl` could be downloaded from the production site without being flagged.

## Change
- Scan the **entire** built output for `.glb`, `.gltf`, `.obj` and `.stl` files.
- Compare each published URL to the approved model URLs declared by anatomy source records.
- Keep the approved-model-missing check and the fixture and draft-ID publication checks.
- Add regressions for misplaced GLB files, raw geometry and an approved model copied to the wrong URL.

## Validation
- New and existing tests: `tests/unit/anatomy-production-audit.test.ts`.
- Full local `npm run verify` unavailable in the chat environment: repository cannot be cloned because outbound GitHub DNS is blocked. GitHub CI must run after the PR opens.
- No model bytes, source labels, clinical facts, app UI, dependencies or deployment configuration were changed.

## Merge
PR targets `staging` and must pass CI and required review. No direct `main` change.
