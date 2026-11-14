status: Task 178 #662 / #692 production anatomy safety. Founder approval is now required for any edit to src/components/AnatomyPublicText.astro, the approved-only no-JavaScript anatomy structure list and BodyParts3D source/credit renderer. Regression tests cover both prelaunch and launched auto-merge decisions and rename-away paths. This complements #692; no models, source statuses, site routes, hosting settings or live content have changed.

blocked: This is a stacked patch against founder-held PR #692, not a production release or publication approval. The GitHub-only environment cannot run pinned Node 24 npm run verify or browser screenshots locally. Exact-head CI and independent review must pass before integrating into #692 and then into staging.

needs Christian: explicitly approve this policy change as part of #692 after reviewing all checks. Do not merge, deploy, publish model data, or alter hosted databases on the strength of this patch.
