# Task 178: combined encoded-ID audit safeguards

status: Task 178 production artifact audit: recognize semicolonless HTML numeric references alongside padded JavaScript Unicode escapes and test reserved FIX and draft FMA identifiers; in review.

The production audit in #524 decodes numeric HTML entities only when terminated by a semicolon. HTML parsers also accept them without a semicolon. In a separate, reviewed follow-up #529 the JavaScript decoding branch was strengthened to recognize padded braced Unicode sequences. These source changes address distinct browser encodings but touch the same audit script and regression suite.

This proposal is stacked directly on #529 clean commit 03126c72ee13244196436f88bc4ca7a694d55156. It adds #530's semicolonless markup decoder and three synthetic unit tests while preserving #529's padded Unicode checks and #524's existing literal and decoded FIX/FMA scan. Integrate this combined branch once rather than also merging #530 and #442 as whole files.

Exactly three files change: scripts/anatomy-production-audit.mjs, tests/unit/anatomy-production-audit.test.ts, and this lowercase status note. No real anatomy model, clinical source, license record, approval status, dependency, auth, workflow or deployment change.

Require exact-head Astro check, build, Vitest, CodeQL/Semgrep/secrets, production-artifact audit, independent review and staging/source-rights/founder approval. Do not publish drafts or merge to production on this evidence alone.

Additional regression: the JavaScript decoder now observes backslash parity. A literal escaped backslash (two source slashes) is not converted into an FMA/FIX ID, while a final active escape in an odd-length backslash run is decoded. Synthetic tests cover even and odd runs with ordinary, padded-braced and hexadecimal escapes. No runtime/model files are modified.

status: Existing PR #534 follow-up (4 November 2026): the encoded draft-ID gate now accepts and scans the canonical BodyParts3D `BP24` and lowercase-suffixed `FMA7198nsn` formats, matching `src/content.config.ts`. Two synthetic regression tests reject encoded draft leaks while avoiding false positives for longer, distinct IDs. This is an in-place correction to the existing PR, not a new PR. Full exact-head CI, security checks, and independent review remain required before Claude integrates the narrow audit hunks with #568, #433, and #437.
