# Task 178: resolve retired Anatomy Lab model waiters

status: Task 178 on-demand loader cancellation: retiring a system now resolves active, shared and queued layer waiters immediately, even if an active GLB request never settles. Synthetic unit tests cover pending requests, overlapping shared URLs, late success and late failure. In review.

## Problem
The two-request `createOnDemandLoader` queue resolves queued work on `retire()` but did not resolve promises for already started fetches. A stalled `.glb` request could keep an obsolete `ensure()` layer batch pending indefinitely after switching body systems. `inFlight.clear()` only forgets the URL; it does not settle the Promise that its caller awaits.

## Fix
Keep a cancellation resolver for every outstanding URL, including active fetches. On retirement, resolve them all with `null`, clear the queue and do not publish late successes or failures. Underlying requests still run until their network promise settles, but their layer callers no longer wait. The existing two-download limit, URL deduplication, active success callbacks, retry behavior and system retirement guards remain unchanged. Remove the resolver when a URL completes or fails.

## Scope and merge instructions
Three files: `src/islands/anatomylazy.ts`, `tests/unit/anatomy-loader-concurrency.test.ts`, and this status note. Stacked on progressive loader #496 at `8efdf816866e69bc2b47690c2db9175a541e3ace`. This affects only cancellation/cleanup of obsolete anatomy model requests, not source/clinical content, GLB assets, licensing, publication flags, auth, dependencies, security headers, workflows or hosting.

Claude: port this narrow helper/test addition into #414 only after reconciling the #496 progressive-result callback and #500 synchronous system switch. Do not overwrite either implementation. Exact-head type-check/build/Vitest/Playwright and independent review are required, plus locked staging and founder rights/content approval. No merge or draft publication is authorized.
