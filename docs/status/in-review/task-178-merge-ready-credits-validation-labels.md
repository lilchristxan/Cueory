# Task 178: combined validation, labels, and PNG-credit integration check

status: Task 178 merge candidate: integrate source id/kind/GLB address validation and offscreen labels atop PNG-credit and isolated-build fixture repair, with synthetic regressions; in review.

## Why this branch exists
The lead's Anatomy Lab parent #290 has parallel changes to `src/islands/anatomylab.ts` and `tests/unit/anatomylab.test.ts`. Claude should not have to resolve three competing full-file merges before seeing CI results.

## Source provenance
Based **directly** on #458 head `fe3f4f92bd30e5b2fa1134bc8521bf9475de1b05`, which already includes #416's isolated-build fixture copy, long-word wrapping and CC BY URI on real exported pictures, with dedicated browser and unit coverage.

This branch adds only the exact relevant hunks from:
- #447 head `3a95148330afe7922b4fdd62296cbcc1baa0b8c7`: require source id = anatomy filename, kind=model, exact model URL (or explicit synthetic fixture URL) and corrected synthetic test records
- #435 head `942e4357c3f8ede416b311d0eb33769b61d586e4`: exclude offscreen/invalid projected label anchors and report omitted names, with a synthetic regression

No separate GLB files, source labels, medical facts, source licenses, approved/draft statuses, authentication, payments, dependencies, workflows or hosting settings changed.

## How Claude can use it
This is a stacked **CI/merge rehearsal**, not release approval. Verify this exact head with TypeScript, build, Vitest, focused Playwright, security scans and Codex review. Integrate the source/test changes **once** after #458, not again from #435 and #447. If #416 is integrated separately, avoid repeating its fixture-copy test hunk. Keep the existing staging and Christian model/publication review requirements.

## Verification
Source/test anchors were matched and the final unified code inspected. Full local `npm run verify` is unavailable from this GitHub-connected workspace. Exact-head GitHub CI is the validation source, and browser tests may exceed the existing time limit. No success is claimed before checks complete.

## Exact-head comparison
This stacked PR is #468. GitHub verified that its comparison against #458 contains exactly three files: the source helper, its unit tests and this note. The unrelated automatic staging merge was discarded without changing the intended source or test bytes. Full exact-head validation remains required.
