# Task 178 — stop obsolete picture work before allocating GPU resources

status: Task 178 Anatomy Lab PNG export: skip rendering a stale picture when the selected body system changes during asynchronous font preparation; in review.

## Confirmed source-level issue
`scene.exportPicture()` awaits `document.fonts.load()` twice before it allocates a 1080px canvas and an additional WebGL renderer. The system picker already bumps the caller's export-generation guard, preventing a stale download after `toBlob()` finishes. However, the existing exporter still performs the expensive rendering work after fonts resolve, even when `scene.clear()` replaced its 3D model while those fonts were pending.

## Focused correction
Capture the scene's existing `loadId` before the first font await, then compare it after both font promises settle and before allocating the picture canvas. Both `scene.clear()` and `scene.dispose()` advance `loadId` synchronously. A stale export rejects early, and the parent UI's existing generation guard suppresses an obsolete error message. The existing late-toBlob protection remains untouched.

## Synthetic browser regression
The new Playwright test opens the fixture lab, holds its two PNG font requests, switches to another system, and releases the font promises. It intercepts 1080x1080 canvas `getContext('2d')` to assert the old export did not begin rendering. It also verifies no stale download or 'saved' message. A `finally` block always releases pending font requests.

## Scope and verification
Base is the immutable reviewed #506 ancestor `f0e2535b4550ec7afe5e4a1787e538a3a2eac85c`. Exactly three files: `src/islands/anatomyscene.ts`, `tests/e2e/anatomy-export-switch.spec.ts`, and this status note. This change does not duplicate PR #474's or #500's late-export download invalidation. No actual anatomy meshes, official names, clinical content, licenses, privacy, auth, dependencies, security, workflows, deployment or publication flags change.

Exact-head GitHub Astro check, build, Vitest, Playwright and independent Codex review are required. The local runtime cannot fetch/install the repository or run its Node 24 toolchain, so no local test pass is claimed. Claude should port this small hunk into its selected combined Anatomy Lab branch only after CI, then repeat staging GPU/PNG QA. Founder source/rights and release approval still apply. No direct staging/main merge.
