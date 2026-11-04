# Task 178: Anatomy Lab PNG-credit integration validation

Status: in review — CI integration candidate only. Base: task-178/anatomy-lab at 09ea433c0bbbbcf44c3cb6d448ef24218ad35f5b (PR #290).

This branch combines three already-isolated and reviewed Task 178 assistance patches onto the lead's **current** Anatomy Lab parent, instead of merging staging into old stacked branches:

- #427: preserve original structure/credit characters when wrapping long unbroken words; no label source changes
- #449: print the CC BY 4.0 URI on real Anatomy Lab PNGs and test footer bounds and fixture-only attribution
- #416: copy synthetic test fixtures into the temporary isolated full-site build, retaining all original test assertions

All feature source and test files are copied unchanged from their exact source commits. The browser test from #449 includes the explicit wait for the real kidneys GLB and measures actual PNG canvas text width. No GLB assets, medical facts, approved statuses, licensing rules, dependencies, authentication, workflows or deployment settings change.

Verification: the original #427, #449, and #416 head/source diffs and this combined branch's diff were reviewed through GitHub. This consolidation requires **exact-head** Astro checks, production build, Vitest and Playwright checks; it must not be described as fully passed before CI reports. No clinical or rights sign-off is inferred.

Safety: this is a proposal for Claude to reconcile with #290, not permission for automated merge or production release. Preserve the existing needs-christian approval gate and staging-first preview review. Reconcile #416 into staging independently as appropriate rather than blindly duplicating its commit.
