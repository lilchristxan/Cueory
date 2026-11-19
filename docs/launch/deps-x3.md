# Dependency licences (task x3)

Checked 2026-11-19 from `package.json` and `package-lock.json` on `staging` (97bbb1a6). No install was run. Licence
strings are the lockfile's `license` field, so a licence that field does not state would be marked **unknown**; none
were. "Last published" is the registry's `time.modified` for the package, read 2026-11-19.

## Result

- Nothing GPL or AGPL anywhere in the lockfile, runtime or dev.
- Copyleft is limited to build and test tooling, none of it shipped to visitors:
  - LGPL-3.0-or-later: `@img/sharp-libvips-*`, `@img/sharp-win32-*`, `@img/sharp-wasm32` (dev, optional, pulled in by the wrangler toolchain).
  - MPL-2.0: `lightningcss` and its platform binaries (build-time CSS tool used by Tailwind, never in the browser bundle); `axe-core` (dev, accessibility tests only).
- Every direct runtime dependency is MIT or OFL-1.1. None is marked deprecated in the lockfile. Every one was published within about 5 months (most within the last week).

## Runtime (`dependencies`)

| Package | Locked | Licence | Last published | Notes |
|---|---|---|---|---|
| @astrojs/react | 7.1.2 | MIT | 2026-11-13 | |
| @fontsource-variable/inter | 5.3.0 | OFL-1.1 | 2026-07-19 | Appears unused: nothing imports it, the CSS uses Lato, and `tests/unit/typography.test.ts` asserts it is not imported. Candidate to remove. |
| @supabase/supabase-js | 2.118.0 | MIT | 2026-11-19 | |
| @tailwindcss/vite | 4.3.3 | MIT | 2026-11-18 | Brings in `lightningcss` (MPL-2.0, build time only). |
| @types/react | 19.3.0 | MIT | not checked | Types only, no runtime code. |
| @types/react-dom | 19.3.0 | MIT | not checked | Types only, no runtime code. |
| astro | 7.4.12 | MIT | 2026-11-18 | |
| react | 19.3.1 | MIT | 2026-11-18 | |
| react-dom | 19.3.1 | MIT | not checked | |
| tailwindcss | 4.3.3 | MIT | 2026-11-18 | |
| three | 0.187.0 | MIT | 2026-10-30 | |

## Dev (`devDependencies`)

| Package | Locked | Licence |
|---|---|---|
| @astrojs/check | 0.9.12 | MIT |
| @axe-core/playwright | 4.14.0 | MPL-2.0 (via axe-core, tests only) |
| @playwright/test | 1.64.1 | Apache-2.0 |
| @types/node | 24.19.2 | MIT |
| @types/three | 0.187.0 | MIT |
| gltfpack | 1.3.0 | MIT |
| pagefind | 1.5.2 | MIT |
| simple-icons | 16.36.0 | CC0-1.0 |
| typescript | 6.0.3 | Apache-2.0 |
| vitest | 5.0.5 | MIT |
| wrangler | 4.156.0 | MIT OR Apache-2.0 |

## Follow-ups (not done in this docs-only change)

1. **Remove `@fontsource-variable/inter`** from `dependencies` if confirmed unused (a code change).
2. **Move `simple-icons` to `dependencies`.** It is CC0, but `src/components/SocialLinks.astro` imports it and the icon paths ship in the page, so it is not dev-only in practice. (Its glyphs are trademarks of their owners; CC0 covers the files only.)
3. **BodyParts3D credit: already shown in the anatomy lab, so check it rather than add one.** `src/islands/AnatomyLab.tsx` renders a credit line (`BODYPARTS3D_CREDIT_LEAD`: "3D model: Cueory, adapted from BodyParts3D, © The Database Center for Life Science licensed under") followed by a licence link (`BODYPARTS3D_LICENSE_NAME`, "CC Attribution 4.0 International", to `BODYPARTS3D_LICENSE_URL`, https://creativecommons.org/licenses/by/4.0/, marked `rel="license"`). It does this in two places (around lines 1021 and 1388) for every body system that is not a fixture, and the first also has a "source details" link (`BODYPARTS3D_REFERENCE_URL`). The wording and links are defined in `src/islands/anatomylab.ts`. Under `src/pages`, `src/components` and `src/layouts`, the only file that mounts this island is `src/pages/preview/anatomy-lab.astro`. An earlier version of this note said no visitor-facing credit existed; that was wrong. Not checked: how the credit looks in a browser, whether that page is part of the live build, whether the wording and placement satisfy the licence's attribution terms, and the licence text of the dataset itself (this note only reports what the project's code says).
4. Not checked: licences of fonts, images and content files in `public/`, and transitive dependencies beyond the non-permissive scan above.
