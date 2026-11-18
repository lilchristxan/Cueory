# Design artwork (public/design/)

Owned by Christian, confirmed 18 Nov 2026. Pulled from his exported design page (`renderings-export.html`) and used by
the approved boards in `docs/design/renderings/`. Sizes below are the files in the repo. Builders: use these files,
declare the width and height on every `<img>` (see `tests/unit/perf-images.test.ts`), and do not recolor or retouch.

| File | Size | Pixels | Board and element | Suggested use |
| --- | --- | --- | --- | --- |
| `public/design/hero-anatomy-figure.webp` | 124,228 B | 673 x 692 | HomeV2: hero, right side (CSS `.herobg`, `background-size: auto 100%`) | Home hero background figure, lazy-loading not needed (above the fold). Quality-95 WebP of the original 725 KB PNG (mean pixel difference 1.6 of 255). |
| `public/design/pillo-blister-board.webp` | 357,332 B | 1230 x 1180 | Pillo and PilloDone: the game board | Board image under the tiles; tiles are positioned over it by percent (see the board's tile `left`/`top`). Already WebP; re-encoding made it larger or visibly worse, so it is the original. |
| `public/design/logo-pillo.webp` | 6,004 B | 550 x 258 | Pillo and PilloDone: wordmark above the board (130 px tall) | The "pillo" title image. Lossless WebP of the original PNG, keeps transparency. |
| `public/design/icon-daily-games.webp` | 9,794 B | 181 x 176 | HomeV2: Explore bar, "daily games" tile (40 px tall) | Games tile icon. Original file (already WebP). |
| `public/design/icon-building-notice.webp` | 3,160 B | 145 x 132 | HomeV2, Pillo, Sudoku, WordPath and Done boards: top "we're still building" notice (20 px tall) | Notice bar mark. Lossless WebP of the original PNG, keeps transparency. |
| `public/design/silk-background.svg` | 1,709 B | viewBox 1440 x 760 | HomeV2, Pillo, Sudoku, WordPath and Done boards: draped-silk page background (`.silk`, `background-size: 100% 100%`, several copies flipped and skewed down the page) | Background layer behind marketing pages and the game screens. Original file. |

Total: 502,227 bytes.

## Logos: use the existing brand files, no new copies

The exported header logo (`logo-cueory-full.png` in the export) is the same artwork as brand v1.0. Compared with
`public/brand/v1/logo-full-light-1440.png` on the Ivory background the two are visually identical, so nothing was added.
Builders use:

- Light: `public/brand/v1/logo-full-light-{480,960,1440}.png`
- Evening: `public/brand/v1/logo-full-dark-{480,960,1440}.png`

The Games board crops the wordmark out of a 2048 x 2048 logo sheet with CSS. Do not copy that: use the files above.

## Not included

The HomeV2 vial carousel and pedestal images and any other game-board art were not in the export. The vials already in
`public/vials/` are separate.
