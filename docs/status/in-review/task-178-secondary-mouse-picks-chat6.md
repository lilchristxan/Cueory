# Task 178 — ignore secondary-button canvas picks

status: Task 178 Anatomy Lab pointer input: prevent right and middle mouse release events from clearing a selected structure or submitting an unintended Find It answer; in review.

## Confirmed source-level defect
The 3D canvas `onPointerUp` classifies any stationary pointer release as a tap. A right click (button 2), middle click (button 1), or pen auxiliary-button release therefore executes `scene.pick` followed by `pickStructure` even though no primary selection was requested. If a student previously chose a structure through the keyboard-accessible list, a secondary click on empty canvas changes selection to null and removes the name card. The same path could unintentionally score a quiz when clicking a mesh.

## Focused fix
Require `e.button === 0` at the final tap classification gate, after existing active-pointer cleanup. Leave genuine primary mouse, touch, pen-tip, drag and pinch handling unchanged. OrbitControls can still process non-primary interactions without triggering structure selection.

## Regression coverage
A synthetic-fixture Playwright test selects fixture cube A from the structure list and then right- and middle-clicks the canvas, verifying that its selected button and name card remain visible. The existing separate primary-tap raycasting test remains unchanged, so mouse primary selection is still covered.

## Scope and merge gates
Review base is immutable #506 integration commit `f0e2535b4550ec7afe5e4a1787e538a3a2eac85c`. Only `src/islands/AnatomyLab.tsx`, the existing `tests/e2e/anatomy-lab.spec.ts`, and this status note change. No 3D source assets, clinical facts, anatomy names, licenses, approved/draft publication rules, privacy, auth, dependencies, CI workflows, infrastructure or brand tokens change.

Codex independent review, exact-head type/build/unit/Playwright checks and locked staging input QA are required before Claude ports the tiny change into the selected combined Anatomy Lab branch. Human model/source-rights and founder release approvals remain mandatory. Do not merge directly to staging or main.
