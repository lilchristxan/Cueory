# Task 178: detect synthetic anatomy fixture IDs in production text

Status: in review. This three-file audit hardening is stacked on the reviewed release-audit PR #501 at 26f734dd3843d511bfaedda715ba87bd7a76f5bb.

## Finding
The built-site audit already rejects leaked draft GLB files, generated fixture endpoints, and real draft FMA identifiers inside public text. The code-made test fixture uses a separate reserved ID family (FIX001–FIX005). If its labels are inadvertently serialized into production HTML, JavaScript or search JSON, the existing FMA-only audit would not flag them.

## Fix and regression coverage
Scan the generated text asset set once and reject reserved FIX identifiers followed by at least three digits, using token boundaries. The check runs even with zero draft-FMA source identifiers. Retain the original FMA leak detection. Three synthetic unit regressions cover HTML/JS/search outputs, a build without draft FMA labels, and longer unrelated tokens that must not be flagged.

No application behavior, 3D binary, official label, nursing fact, source approval or license field, authentication, dependency, CI workflow or hosting setting is changed. The FIX identifier convention is sourced from tests/fixtures/anatomy-fixture.json, not clinical content.

## Integration
Require exact-head GitHub check/build/Vitest/Playwright, CodeQL, Semgrep and Codex review. Reconcile this extra fixture-ID scan with PR #442's separate encoded-draft-ID scan without overwriting either. Keep needs-christian, locked staging and founder model/rights approval. This is a preventive audit check, not proof of a production leak.
