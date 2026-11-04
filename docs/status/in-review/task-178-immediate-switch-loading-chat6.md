# Task 178 — synchronous Anatomy Lab system-switch guard

Status: in review. This patch is stacked on PR #482 at commit `cc5d58fd9b322a8c1d4cca8000480e07133c6e52`. It does not target production.

## Bug
Choosing a new body system changes the title before React's passive model-load effect resets the previous `ready` state. During that short transition, quiz and PNG export controls may still operate against the old model while showing the new system's name.

## Fix
In the body-system button handler, set load to `loading` and clear the old selection and quiz *before* setting the new system key. This is one batched user interaction. The existing model-load effect remains responsible for clearing the scene, retiring loaders and fetching the new system. The existing immediate PNG generation invalidation is preserved.

## Regression and review
The existing held-GLB system-switch browser test now asserts that export and quiz controls are disabled while the next model request is pending, in addition to the existing structure-list check. No anatomical facts, source names, model files, licenses, permissions, build configuration, dependencies, security settings or approval gates changed.

No local npm/Playwright tests were run from the connected GitHub-only environment. Require exact-head CI, the browser suite and independent code review before Claude integrates this into the lead branch. Model/rights review and staging gates remain required before publication.
