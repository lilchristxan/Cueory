# Design artwork (public/design/)

Owned by Christian, confirmed 18 Nov 2026. Pulled from his exported design page (`renderings-export.html`) and used by
the approved boards in `docs/design/renderings/`. Sizes below are the files in the repo. Builders: use these files,
declare the width and height on every `<img>` (see `tests/unit/perf-images.test.ts`), and do not recolor or retouch.

| File | Size | Pixels | Board and element | Suggested use |
| --- | --- | --- | --- | --- |
| `public/design/hero-anatomy-figure.webp` | 124,228 B | 673 x 692 | HomeV2: hero, right side (CSS `.herobg`, `background-size: auto 100%`) | Home hero background figure, lazy-loading not needed (above the fold). Quality-95 WebP of the original 725 KB PNG (mean pixel difference 1.6 of 255). |
| `public/design/pillo-blister-board.webp` | 357,332 B | 1230 x 1180 | Pillo and PilloDone: the game board | Board image under the tiles; tiles are positioned over it by percent (see the board's tile `left`/`top`). Already WebP; re-encoding made it larger or visibly worse, so it is the original. |
| `public/design/logo-pillo.webp` | 4,306 B | 550 x 208 | Pillo and PilloDone: wordmark above the board | The "pillo" title image (wordmark and TM only). Lossless WebP, keeps transparency. The original export also had a subtitle line under the wordmark that named a competitor game; it sat in its own band (rows 222 to 242, clear of the wordmark's rows 0 to 207) and was cropped off. Wordmark pixels are unchanged (checked pixel for pixel). Do not add a subtitle under it. |
| `public/design/icon-building-notice.webp` | 3,160 B | 145 x 132 | HomeV2, Pillo, Sudoku, WordPath and Done boards: top "we're still building" notice (20 px tall) | Notice bar mark. Lossless WebP of the original PNG, keeps transparency. |

Total: 489,026 bytes.

## Logos: use the existing brand files, no new copies

The exported header logo (`logo-cueory-full.png` in the export) is the same artwork as brand v1.0. Compared with
`public/brand/v1/logo-full-light-1440.png` on the Ivory background the two are visually identical, so nothing was added.
Builders use:

- Light: `public/brand/v1/logo-full-light-{480,960,1440}.png`
- Evening: `public/brand/v1/logo-full-dark-{480,960,1440}.png`

The Games board crops the wordmark out of a 2048 x 2048 logo sheet with CSS. Do not copy that: use the files above.

## Checked for lettering and result tiles (18 Nov 2026)

- Hero figure: no lettering.
- Silk SVG: removed from this PR (see Not included).
- Pillo blister board: empty wells, no lettering, no colored tiles. The colored tiles in the boards are drawn by the page code.
- Notice icon: no lettering.
- Daily-games icon: removed from this PR. Its green and yellow capsules read as a result grid, which the no-lookalike rule forbids.

## Not included

The draped-silk background SVG from the boards: it hard-coded colours outside the approved palettes, and staging already has a brand-compliant silk (D-41, D-53) built from tokens (`--color-silk-base`, `--color-silk-sheen`, `--color-silk-shade`, `--color-silk-tint` in `src/styles/tokens.css`, scenes in `src/styles/global.css`). Builders use the existing silk tokens and match them against the renderings; no SVG is added.

The HomeV2 "daily games" tile icon: the tile uses an existing brand icon (or a line icon in brand tokens, like the other tiles) until Christian supplies a version in brand colours.



The HomeV2 vial carousel and pedestal images and any other game-board art were not in the export. The vials already in
`public/vials/` are separate.
