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

/** The longest the redirect waits for the page's islands, so a slow or failed island can never trap a visitor here. */
export const SETTLE_LIMIT_MS = 2500;

/**
 * Go on only once the page has finished loading and its islands have hydrated. Leaving at once cancelled the scripts the
 * page was still fetching (Firefox reports these as NS_BINDING_ABORTED), which wasted the visitor's data and failed the
 * console sweep. astro:hydrate does not bubble, so it is heard in the capture phase.
 */
export function followOldVialoAddressWhenSettled(win: Pick<Window, 'addEventListener' | 'setTimeout' | 'location'>,
  doc: Pick<Document, 'readyState' | 'querySelector' | 'addEventListener'>): void {
  let gone = false;
  const go = () => {
    if (gone) return;
    gone = true;
    followOldVialoAddress(win.location);
  };
  const check = () => { if (doc.querySelector('astro-island[ssr]') === null) go(); };
  const start = () => {
    doc.addEventListener('astro:hydrate', check, true);
    win.setTimeout(go, SETTLE_LIMIT_MS);
    check();
  };
  if (doc.readyState === 'complete') start();
  else win.addEventListener('load', start, { once: true });
}
