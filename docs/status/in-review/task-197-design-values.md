# Task 197: token-based design-value regression checks

Adds unit coverage that scans source components and styles outside `src/styles/tokens.css` for raw hex colors, numeric `rgb()`/`hsl()` colors, non-token font-family declarations, and raw `px`/`rem` values in class strings or CSS layout declarations.

The only explicit color allowlist is the two `theme-color` metadata values in `Layout.astro`, which are browser metadata rather than component styling. Font declarations inside `@font-face` remain allowed because they define the self-hosted font files.

Validation:

- `git diff --check` passed.
- Focused `npm test -- tests/unit/design-values.test.ts` passed: 4 tests.
- `npm run check` passed with 0 errors, 0 warnings, and 11 existing hints.
- `npm run build` passed with 31 pages built.
- `npm test` passed: 3,334 tests in 110 files.

Target: `staging`. Do not merge.
