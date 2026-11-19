status: in review: perf-fonts runs without service workers, so the offline first-visit save can no longer add a random Lato entry (local Chromium flake, about 1 run in 4).

- Cause: once the worker takes control, src/scripts/offline.ts asks again for every file the page loaded (initiator "fetch", answered from cache). When that lands before the spec reads Resource Timing, a Lato file shows two entries and the spec fails, in any engine.
- Change: `test.use({ serviceWorkers: 'block' })` in tests/e2e/perf-fonts.spec.ts, with a comment. The font assertions are unchanged. The offline save keeps its own tests.
- Split out of #922 (still held for Christian), which is about WebKit's memory-cache entry.
