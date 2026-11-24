/** Lane 23: run after npm run build. Public pages must not promise accounts while accounts are closed. */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { accountsOpen } from '../../src/config/site';

const PAGES = ['index', 'play', 'breaks', 'courses', 'coming-soon', 'support', 'message', 'play/pillo', 'play/sudoku', 'play/word-path'];
const PROMISES = ['create your free account', 'a free account is needed', 'coming with free accounts'];

function visibleText(file: string): string {
  const root = fileURLToPath(new URL('../../dist/', import.meta.url));
  const path = root + file + '.html';
  expect(existsSync(path), `${path} is missing: run npm run build before npm test`).toBe(true);
  return readFileSync(path, 'utf8')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

describe('launch copy: accounts closed', () => {
  it.skipIf(accountsOpen).each(PAGES)('%s does not promise accounts', (page) => {
    const text = visibleText(page);
    for (const phrase of PROMISES) expect(text, `${page} says "${phrase}"`).not.toContain(phrase);
  });
});
