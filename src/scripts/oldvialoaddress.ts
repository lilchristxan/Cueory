/**
 * wordpill's old address. The game was called vialo until 26 Nov 2026 and lived at /play/vialo; that address still
 * works. src/pages/play/vialo.astro loads this as a bundled module (no inline script, so the CSP is untouched) and it
 * sends the visitor to /play/wordpill, keeping a #hash such as #print. replace, not assign, so the old address does not
 * stay in the back history.
 */
export const WORDPILL_PATH = '/play/wordpill';

export function wordpillAddress(hash: string): string {
  return /^#[\w-]*$/.test(hash) ? WORDPILL_PATH + hash : WORDPILL_PATH;
}

export function followOldVialoAddress(location: Pick<Location, 'hash' | 'replace'>): void {
  location.replace(wordpillAddress(location.hash));
}
