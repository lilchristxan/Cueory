# Task 178 — phone confirmation before loading every anatomy layer

status: In review (stacked assist on anatomy lab PR #290). In the whole-body 3D viewer, a single tap on "show all" could start up to ten additional model downloads at once on a phone. This expands the loaded scene far beyond the 150,000-triangle per-file budget, and can make smaller devices unresponsive.

change: At a viewport narrower than 768 CSS pixels, when "show all" needs at least two new model files, require an explicit follow-up "load every layer" choice. The confirmation states the number of unique model files not yet downloaded. "keep current view" cancels without any extra requests. Keyboard focus moves to the confirmation and returns to "show all" after either choice. Desktop, fully cached views and one-file updates remain one-tap actions.

tests: Pure decision checks for phones, larger viewports, one-file cases, bad counts and shared-file deduplication. A phone browser regression checks zero extra GLB requests before confirmation, cancellation, focus handling and requests only after a deliberate second action. The browser aborts the later requests to avoid rendering every draft model in CI.

limits: This is an accidental-load safety guard, **not** an aggregate GPU triangle cap or a sequential-download implementation. The student can still deliberately load every model, which may slow a phone. Do not claim to have measured actual device frame rates. No clinical facts, GLB assets, labels, approvals, accounts, security policies, deployment settings or dependencies changed.

release: Requires latest-head CI, browser and accessibility checks, Codex/lead review, and the existing human approval before publishing any anatomy data. Coordinate with PR #391's pending visibility-intent work.
