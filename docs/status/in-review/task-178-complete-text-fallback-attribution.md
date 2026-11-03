# Task 178 — complete the Anatomy Lab text-only fallback

Status: in review, stacked on Task 178 integration parser repair (#424), which is stacked on integration #414 and the lead's Anatomy Lab #290.

## Problem
If WebGL fails before the 3D viewer can open, the text-only structure catalog remains searchable, but it omits the full BodyParts3D credit, license link and model release. It also excludes the combined whole-body catalog, because that choice is constructed only when the viewer is successfully open.

## Change
- Construct the whole-body catalog after either a successful open or a failed WebGL open, while keeping the initial unopened hydration payload unchanged.
- In the text-only fallback, show the existing fixture attribution or the existing BodyParts3D copyright/license attribution and release/draft status, matching the working 3D view.
- Extend the existing simulated WebGL-failure Playwright test to verify fixture credit, combined whole-body text access, the license link and no .glb requests.

## Safety and validation
- Three changed paths only: the Anatomy Lab React UI, its existing browser spec, and this status note.
- No anatomy facts, model binaries, source names, permissions, release approvals, dependencies, hosting settings or publication gates changed.
- Source changes reviewed against the #424 head. This environment has GitHub connector access but no runnable repository checkout or Node 24 toolchain, so npm check, build, unit tests and Playwright were not run locally. Run exact-head CI and independent review before integration.
- This stacked proposal must not be merged or used to approve publication of draft models without the existing staging and Christian approval gates.
