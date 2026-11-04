# Task 178 — recognize canonical glTF node names when extras differ

status: Task 178 Anatomy Lab mesh indexing: accept a valid structure ID from a glTF node when its extras name is present but does not match the reviewed catalog, while preserving the existing precedence for valid extras IDs; in review.

## Problem
The mesh indexer currently chooses `object.userData.name` whenever that metadata value is a string. A glTF file may use extras `name` for a descriptive label and `Object3D.name` for its canonical structure ID. Even if the node's name is in the reviewed source inventory, a nonmatching extras string causes the entire mesh to be treated as unlabeled. That prevents the structure from being found, selected, hidden, highlighted or included in the quiz.

## Fix
Prefer `userData.name` when it matches a reviewed ID in the supplied `ids` set. Otherwise, test the glTF node's own `name` against the same allowlist. This does not accept arbitrary labels as anatomy IDs. The existing nearest-named-ancestor mapping, shared IDs across GLBs, material cleanup and triangle count are unchanged.

## Regression tests
Two synthetic Three.js cases exercise (1) an unrelated extras label over a canonical node ID and (2) two recognized names, confirming the existing extras-ID precedence remains intact. No real anatomy names or clinical facts are inserted.

## Scope and release gates
Based on the exact #543 mesh conversion head `4cbc564003a6313e98483133d6eb188b2c682ede`. Three intended changed files: `src/islands/anatomymeshindex.ts`, `tests/unit/anatomymeshindex.test.ts` and this status note. No GLB assets, source manifests, clinical facts, model licenses, publication statuses, auth, dependencies, workflows, deployment or secrets changed.

Use a pinned review base and head if other agents update branch refs. Require exact-head TypeScript, build, unit and Playwright CI, independent Codex review, locked staging validation, and founder anatomy rights/content approval. Claude should port the narrow change after selecting the combined mesh-index integration, not merge the snapshot directly into staging or main.
