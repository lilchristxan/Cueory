# Task 178 — accurate per-file structure availability

status: Task 178 (#pending): distinguish a missing mesh in a completed GLB from another unrequested GLB in the same anatomy layer; source-map and synthetic unit regressions in review.

## Reproduced code-level defect
The whole-body list currently calls `structureLoadNote` with an entire layer's GLB paths. For example, if `heart.glb` has completed and contains no mesh for a listed synthetic structure, but `lungs.glb` has not loaded, that synthetic structure still appears as **not loaded yet**. The label reflects an unrelated file's status, even though the exact source-to-file ownership map is available in `system.model.fileIds`. This can also happen after one file fails permanently while another has completed.

## Focused change
- Add an optional `fileIds` map to the pure `structureLoadNote` helper. A listed structure is **not loaded yet** only while at least one GLB that actually owns that ID has not loaded.
- Return **not in this model** when all its owning GLBs have loaded and the mesh is still missing, or when the file map lists no owner.
- Preserve the older layer-wide fallback when a system does not supply a `fileIds` map.
- Pass `system.model.fileIds` from the accessible structure list, which uses the same status text in button names for screen readers.
- Cover completed owners with pending siblings, pending exact owners, shared IDs across GLBs, unmapped IDs, and the legacy fallback using synthetic IDs only.

## Isolation and release gates
Parent: PR #506 (`task-178/progressive-safe-switch-integration-chat7`), head `f0e2535b4550ec7afe5e4a1787e538a3a2eac85c`. Only `src/islands/anatomylazy.ts`, `src/islands/AnatomyLab.tsx`, `tests/unit/anatomylazy.test.ts`, and this status note change. No original names, source manifests, model assets, licensing, clinical facts, private content, deployment settings, security rules or publication statuses changed.

Source-level review complete. GitHub CI, exact-head TypeScript, build, Vitest, browser checks and independent Codex review still required before Claude integrates. Never merge straight to staging or main. Production release still needs staging and founder model/source-rights approval.
