/**
 * Builds the small WebP previews the share sheet shows (lane 9, images). The share sheet draws each card at most
 * 280 CSS px wide (--container-share-card), so downloading the full 1200×630 PNG just to show it is wasteful. These
 * previews are the same pictures scaled down evenly (both sides, so nothing is stretched), with nothing added,
 * cropped or recolored. The file that is actually shared stays the full PNG from scripts/build-share-cards.mjs.
 *
 * Run from the repository root after scripts/build-share-cards.mjs:
 *
 *   node scripts/build-share-previews.mjs
 */
import { mkdirSync, readdirSync } from 'node:fs';
import sharp from 'sharp';

const SOURCE = 'public/share';
const OUT_DIR = 'public/share/previews';
/** 2× and 3× of the 280 px card. */
export const PREVIEW_WIDTHS = [560, 840];

mkdirSync(OUT_DIR, { recursive: true });
for (const name of readdirSync(SOURCE).filter((file) => file.endsWith('.png')).sort()) {
  for (const width of PREVIEW_WIDTHS) {
    const out = `${OUT_DIR}/${name.replace(/\.png$/, '')}-${width}.webp`;
    await sharp(`${SOURCE}/${name}`).resize({ width }).webp({ quality: 82, effort: 6 }).toFile(out);
    console.log(out);
  }
}
