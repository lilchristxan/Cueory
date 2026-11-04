# Task 178: combined encoded-ID audit safeguards

status: Task 178 production artifact audit: recognize semicolonless HTML numeric references alongside padded JavaScript Unicode escapes and test reserved FIX and draft FMA identifiers; in review.

The production audit in #524 decodes numeric HTML entities only when terminated by a semicolon. HTML parsers also accept them without a semicolon. In a separate, reviewed follow-up #529 the JavaScript decoding branch was strengthened to recognize padded braced Unicode sequences. These source changes address distinct browser encodings but touch the same audit script and regression suite.

This proposal is stacked directly on #529 clean commit 03126c72ee13244196436f88bc4ca7a694d55156. It adds #530's semicolonless markup decoder and three synthetic unit tests while preserving #529's padded Unicode checks and #524's existing literal and decoded FIX/FMA scan. Integrate this combined branch once rather than also merging #530 and #442 as whole files.

Exactly three files change: scripts/anatomy-production-audit.mjs, tests/unit/anatomy-production-audit.test.ts, and this lowercase status note. No real anatomy model, clinical source, license record, approval status, dependency, auth, workflow or deployment change.

Require exact-head Astro check, build, Vitest, CodeQL/Semgrep/secrets, production-artifact audit, independent review and staging/source-rights/founder approval. Do not publish drafts or merge to production on this evidence alone.
