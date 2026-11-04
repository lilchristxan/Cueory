# Task 178: audit padded JavaScript Unicode escapes

status: Task 178 production anatomy audit: reject synthetic FIX and draft FMA identifiers hidden by valid padded Unicode code-point escapes such as \u{0046}, with synthetic JavaScript and negative-boundary tests; in review.

## Problem
The production artifact audit in #524 decodes `\\u0046`, `\\x46` and short `\\u{46}` escape forms. JavaScript also accepts padded braced code points such as `\\u{0046}` and `\\u{000046}`. These previously passed through unchanged and could evade the literal FIX/FMA scanner when a bundler emitted them into JS or a compatible JSON/string artifact.

## Fix
Decode braced code-point escapes containing 1 to 16 hex digits only when their numeric value is ASCII. Preserve non-ASCII and invalid code points unchanged. The original short and simple Unicode/hex escapes continue to work. Focused synthetic tests check four-, six-, eight-digit padded forms in generated JavaScript, real draft FMA IDs, and unrelated prefix/non-ASCII strings.

## Scope and release gates
Three files, stacked directly on #524 at `56f0d30f3b9fa961995b2194ddaf4f35e8eaa62d`: `scripts/anatomy-production-audit.mjs`, `tests/unit/anatomy-production-audit.test.ts`, and this lowercase status note. This is a read-only audit refinement. No anatomy labels, model binaries, clinical facts, source-rights records, publication states, auth, dependencies, workflows or hosting configuration changed.

Claude: port this small decoder/test hunk once into the final production audit after #509/#524. Run exact-head Astro check, build, Vitest, security, Codex review and locked staging/production-style artifact audit. The existing no-draft-publication and founder rights/content approval gates remain in force.
