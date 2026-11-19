import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
  /favicon.ico (SEO lane): built by scripts/build-brand-v1.mjs from the approved 32px icon. It is an ICO file holding
  public/brand/v1/icon-32.png byte for byte, so the logo is never redrawn, resized or recolored (D-55).
*/
const root = new URL('../../', import.meta.url);
const file = (path: string) => readFileSync(new URL(path, root));
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

interface BrandManifest {
  icons: Record<string, { sha256: string }>;
  favicon?: { file: string; from: string; width: number; height: number; sha256: string };
}

describe('/favicon.ico', () => {
  const ico = file('public/favicon.ico');
  const brand = JSON.parse(file('brand-source/v1.0/manifest.json').toString()) as BrandManifest;

  it('is recorded in the brand manifest with its checksum', () => {
    expect(brand.favicon).toEqual({
      file: 'public/favicon.ico',
      from: 'icon-32.png (unchanged PNG inside an ICO file)',
      width: 32,
      height: 32,
      sha256: sha(ico),
    });
  });

  it('is one 32 × 32 icon whose image is the approved icon-32.png, unchanged', () => {
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(1);
    expect([ico.readUInt8(6), ico.readUInt8(7)]).toEqual([32, 32]);
    expect(ico.readUInt16LE(10)).toBe(1);
    expect(ico.readUInt16LE(12)).toBe(32);
    const size = ico.readUInt32LE(14);
    const offset = ico.readUInt32LE(18);
    expect(offset).toBe(22);
    expect(offset + size).toBe(ico.length);
    const png = ico.subarray(offset, offset + size);
    const icon = file('public/brand/v1/icon-32.png');
    expect(png.equals(icon)).toBe(true);
    expect(sha(icon)).toBe(brand.icons['icon-32.png']?.sha256);
  });

  it('is written by the brand script, never by hand', () => {
    const script = file('scripts/build-brand-v1.mjs').toString();
    expect(script).toContain("const FAVICON = 'public/favicon.ico';");
    expect(script).toMatch(/icoFromPng\(readFileSync\(`\$\{OUT_DIR\}\/icon-32\.png`\), 32\)/);
  });
});
