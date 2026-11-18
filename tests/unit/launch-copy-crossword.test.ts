/** Lane 23: run after npm run build. While the crossword is closed, /play's description must not mention it. */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { crosswordOpen } from '../../src/config/site';

describe('launch copy: crossword closed', () => {
  it.skipIf(crosswordOpen)('the /play description does not mention the crossword', () => {
    const path = fileURLToPath(new URL('../../dist/play.html', import.meta.url));
    expect(existsSync(path), 'dist is missing: run npm run build before npm test').toBe(true);
    const description = /<meta name="description" content="([^"]*)"/.exec(readFileSync(path, 'utf8'))?.[1] ?? '';
    expect(description).toContain('puzzles');
    expect(description).not.toContain('crossword');
  });
});
