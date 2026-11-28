/**
 * /register-sw.js loads on every page, so it is minified at build time (lane 9, /play JS). Run `npm run build` first.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { minifySync } from 'vite';
import { describe, expect, it } from 'vitest';
import { buildPlainScript } from '../../src/scripts/swbuild';

const src = (name: string) => readFileSync(new URL(`../../src/scripts/${name}`, import.meta.url), 'utf8');
const built = fileURLToPath(new URL('../../dist/register-sw.js', import.meta.url));

describe('register-sw.js minification', () => {
  const plain = buildPlainScript([src('offlineplan.ts'), src('swlogic.ts'), src('offline.ts')]);
  const minified = minifySync('register-sw.js', plain);

  it('minifies without errors and keeps the parts the page side needs', () => {
    expect(minified.errors).toEqual([]);
    // The switch the layout sets, the worker it registers, and the strict-mode wrapper.
    expect(minified.code).toContain('serviceWorker');
    expect(minified.code).toContain('/sw.js');
    expect(minified.code).toMatch(/^["']use strict["'];/);
  });

  it('is well under half the gzip size of the plain script', () => {
    expect(gzipSync(minified.code).length).toBeLessThan(gzipSync(plain).length / 2);
  });

  it.skipIf(!existsSync(built))('the built file is the minified script', () => {
    expect(readFileSync(built, 'utf8')).toBe(minified.code);
  });
});
