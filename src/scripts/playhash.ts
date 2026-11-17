/**
 * Each daily game moved from a section of /play to its own page (2026-11-17). Old links and bookmarks such as
 * /play#pulse-heading or /play#sudoku-heading land on the hub; this sends them on to the game's page. Pure lookup in
 * `gamePageForHash`, so it can be unit tested; loaded by src/pages/play.astro as a bundled module (no inline script).
 */
const HASH_PAGES: Readonly<Record<string, string>> = Object.freeze({
  'pulse-heading': '/play/pillo',
  pillo: '/play/pillo',
  pulse: '/play/pillo',
  'triage-heading': '/play/sudoku',
  'sudoku-heading': '/play/sudoku',
  sudoku: '/play/sudoku',
  triage: '/play/sudoku',
  'crossword-heading': '/play/crossword',
  crossword: '/play/crossword',
  cueword: '/play/crossword',
  'word-path-heading': '/play/word-path',
  'word-path': '/play/word-path',
  suture: '/play/word-path',
});

/** The game page an old /play hash pointed at, or undefined to stay on the hub. */
export function gamePageForHash(hash: string): string | undefined {
  const key = hash.replace(/^#/, '').toLowerCase();
  return Object.prototype.hasOwnProperty.call(HASH_PAGES, key) ? HASH_PAGES[key] : undefined;
}

export function followOldGameHash(location: Pick<Location, 'hash' | 'replace'>): void {
  const page = gamePageForHash(location.hash);
  // replace, not assign: the old /play#… address should not stay in the back history.
  if (page) location.replace(page);
}
