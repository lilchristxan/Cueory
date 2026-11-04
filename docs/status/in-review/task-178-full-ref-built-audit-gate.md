# Task 178: keep the real production artifact audit active for full Git refs

Status: in review. This two-file patch is stacked on #495 at `9d388c7f2f8f4f474c814fb228b83f072206b3cd` (which itself follows #491 and the clean combined Anatomy Lab #481).

Issue: The post-build `tests/unit/anatomy-production-audit.test.ts` used an independent preview condition that treated `WORKERS_CI_BRANCH=refs/heads/main` as a preview. It could skip examination of the actual built `dist/` even though both page-data filtering and the GLB pruner were correctly treating that same ref as production. A local `CUEORY_ANATOMY_DRAFTS=1` value also overrode the audit despite Workers production variables.

Change: Reuse `keepsDrafts(env)`, the same pure predicate used by the Astro build-output pruner, to decide whether CI needs to audit the real built artifact. No application behavior or content changes.

Regression: Nine branch/environment cases distinguish short/full production refs, unknown/empty refs, explicit local previews and non-CI runs. A synthetic leaked draft GLB proves a full-ref main build must execute the real artifact validator and report unapproved binaries. No clinical facts or model assets are added to the public product.

Validation: Exact-head GitHub CI, unit tests and Codex review are required. Keep `needs-christian`, the locked staging gate and human content/rights review. This closes an audit blind spot, not an observed production leak. Claude should apply this diff only after the #495 / #491 effective changes, or port it to the final combined branch without duplicating them.
