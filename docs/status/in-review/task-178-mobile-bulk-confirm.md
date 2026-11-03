# Task 178 — confirm large whole-body downloads on phones

status: In review, stacked on anatomy lab PR #290.

problem: After only the initial skin file is loaded, tapping "show all" in the whole-body view can start requests for all 10 remaining GLB files at once. The current draft totals more than 1.3 million triangles across 11 files. This can overburden a phone despite each separate GLB meeting the individual file budget.

change: On viewports below 768 CSS pixels wide, if "show all" would fetch two or more **distinct, not-yet-loaded** GLB files, ask for one explicit confirmation. Show the number of files, describe the possible slowdown, and allow "keep current view" without starting requests. Return keyboard focus to "show all" after either action. Normal layer buttons, peeling, cached files, desktop and tablet behavior stay unchanged.

tests: A pure helper covers phone/desktop counts, invalid numbers and shared-file URL deduplication. A phone browser regression confirms no additional GLB requests on the first tap or on cancel, then confirms the second action starts requests. The browser test aborts remaining GLB downloads to avoid rendering the entire body during CI.

limitations: This is a user-confirmation guard, not an aggregate graphics-performance budget, quality tier, concurrency limiter, or proof of adequate phone performance. Further measurement and mobile optimization may be necessary.

safety: No anatomy facts, model binaries, licensing, approval flags, payments, accounts, security headers, deployment settings or workflows were changed. Keep draft publication gates and human approval in place. Require exact-head CI, independent review, and integration reconciliation before merging.
