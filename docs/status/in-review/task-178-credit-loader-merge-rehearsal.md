# Task 178: Combined credit, source validation, GLB cleanup and PNG-race merge rehearsal

status: In review; no merge or draft publication approved.
base: Task 178 Anatomy Lab PR #290 at current head 09ea433c0bbbbcf44c3cb6d448ef24218ad35f5b, with prior integration #458 and #468 preserved through this branch's parent cdab35b5d9e91630cbfa70e1e5a116775e590370.

purpose: Give Claude a single end-to-end CI candidate combining already-reviewed *independent* Anatomy Lab changes. This commit adds the six intentional files from the clean PR #469 (62c8f397090f0936be45476672f432784f60aab1) to the clean PR #468 head, plus this status note. The duplicate isolated fixture-build repair in tests/unit/building-notice-off.test.ts is already identical on the base and is deliberately NOT changed again.

from #458 + #468: official BodyParts3D CC BY 4.0 URI on exported PNGs, unchanged fixture attribution, measured credit wrapping and on-canvas export regression, required anatomy model source id/type/model path, offscreen/invalid label bounds, and isolated test fixture copies.
from #469: dispose completed/late decoded GLB groups after a failed batch, guard synchronous parser errors and retries, synchronously invalidate a pending PNG export when switching systems, and add synthetic/brower regressions.

scope: No anatomy model binaries, official structure names, clinical facts, source citations, release approval flags, dependencies, account/auth logic, workflow or deployment changes. Features are in 3D interaction and tests only. Keep protected main and locked staging gates.

verification: Exact GitHub source blob SHAs inspected. The six imported files are byte-identical to clean PR #469. Full type/build/Vitest/Playwright must be run on this new exact head; no browser pass is claimed in advance. Only Claude should reconcile this rehearsal with its preferred #414 integration branch. Do not independently apply #416, #435, #447, #454, or #461 a second time if adopting this tree. Retain needs-christian and human clinical/rights approval.
