# Task 178: recover Anatomy Lab from late WebGL context loss

status: in review. Clean, three-file replacement for the Anatomy Lab portion of #477. Based directly on the combined Task 178 integration branch #414 at e32701d4b00769ddf866e25b127ef96e4769935b.

A phone may lose its WebGL context after the 3D view has already opened. The lab now listens for that event, synchronously retires outstanding layer requests, invalidates pending PNG exports and pointer state, safely disposes the unusable scene, and switches to the existing searchable text catalog. Students can retry the 3D view without reloading the page.

The independent synthetic-fixture browser suite covers original-name search, visible source attribution, 3D retry, and a delayed PNG callback that completes in the same browser task as context loss.

Merge only the focused source/test/status changes, not #477's unrelated Task 233 contrast sweep or Task 285 ARIA checks. This is not a release or clinical/content approval. Require exact-head CI, type checks, security scans, browser coverage, staging preview, reviewed licensing and Christian's publication approval. No model assets, real anatomy names, source data, license records, approved/draft flags, auth, dependencies, deployment or workflow settings changed.
