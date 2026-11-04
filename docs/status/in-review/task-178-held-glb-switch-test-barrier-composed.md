# Task 178: held-GLB browser test request barrier

status: Task 178 integrated Anatomy Lab browser verification: release the held replacement GLB only after its request is intercepted, allow later sibling requests through, and always release pending callbacks after assertion failures; in review.

The system-switch test in #506 previously drained GLB route release callbacks after React displayed the loading overlay. The overlay can render before the replacement network request is intercepted. If the callback list was empty, that request could remain held and the browser test would time out without identifying an application defect.

This patch ports the focused request-barrier correction from #505 to #506's newer composition, preserving its camera, quiz, PNG, loading and structure assertions. A phase flag holds only requests under examination. Each phase waits for a real intercepted URL before release, and a finally block clears held callbacks on failure.

Exactly the existing tests/e2e/anatomy-lab.spec.ts and this status note change, stacked on #506 at f0e2535b4550ec7afe5e4a1787e538a3a2eac85c. No application code, model files, clinical/source names, rights, publication approvals, auth, dependencies, hosting or workflow changes. Run exact-head type/build/unit/Playwright CI and independent review. Claude should integrate this test hunk once instead of merging the broadened #505 branch. No draft publication authorized.
