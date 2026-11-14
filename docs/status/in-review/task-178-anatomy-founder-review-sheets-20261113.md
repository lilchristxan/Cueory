status: in review

# Task 178 — founder Anatomy Lab review sheets (issue #662, package 4)

The existing `scripts/anatomy-review-report.mjs` can now write one Markdown sheet per body system with `--out-dir`. Source names, the recorded BodyParts3D source lines and links, layers, groups, status, model size and structure counts are copied, not invented.

The locked preview gains `/preview/anatomy-review` with a separate page per system. Every sheet includes a screenshot-friendly checklist, source/licence disclosure and front and side pictures generated on demand with the current Anatomy Lab renderer and its existing credited picture export. No 3D or GLB is requested before the reviewer taps to make the pictures. Checkboxes are not stored and cannot approve a model.

The same `labDataForBuild` gate used for the existing Anatomy Lab page controls this list and its static routes. An unknown or production build excludes draft review URLs and the corresponding names. All eleven manifests remain `draft`.

## Evidence and open gates

- New tests: `tests/e2e/anatomy-review-sheets.spec.ts` and extended `tests/unit/anatomy-review-report.test.ts`.
- No new dependencies, external scripts, database schema, analytics, or production settings.
- A local full `npm run verify` has **not** run in this execution environment: GitHub cloning and npm dependencies are inaccessible here. Do not treat this PR as verified until exact-head CI and independent review complete.
- Pending: screenshots of the real front and side pictures on a phone and desktop, browser export behavior, and the founder's visual/content/source-rights review.
- The official individual parts-list source URLs are being corrected separately in PR #625. This PR displays the source URLs currently recorded, and does not assert independent source accuracy.

decision: Keep the sheets and all model statuses founder-held. Do not merge, deploy, apply database migrations, or publish any model until Christian has explicitly approved the review and exact-head checks are green.
