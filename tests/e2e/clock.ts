import type { Page } from '@playwright/test';

/**
 * Marks the once-only promo panel (cueory-promo-seen, 30 days) and the launch-updates pop-up
 * (cueory-signup-popup-seen, 3 hours) as just shown, by the PAGE's clock.
 *
 * Call it AFTER the clock is set (page.clock.setFixedTime / install). Init scripts run in the order they were added,
 * and the clock installs its own, so a seed added before it runs with the real clock. The panels compare the saved
 * time with the page's fixed date: with the real date on 5 December and a page fixed in November, the promo's 30 days
 * and the pop-up's 3 hours count as over, and the panels open part-way through a test. A script added after the clock
 * sees the fixed date, so the mark is always "now" for the page, on every load.
 */
export async function markPanelsSeen(page: Page, options: { rules?: boolean } = {}) {
  if (options.rules !== false) await markGameRulesSeen(page);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
      localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
    } catch {
      // Storage is blocked: the panels never show then anyway.
    }
  });
}

/** Fixes the page's clock at `date`, then marks both panels seen by that clock. */
export async function fixClock(page: Page, date: Date) {
  await page.clock.setFixedTime(date);
  await markPanelsSeen(page);
}

/**
 * Marks every game's first-visit rules as seen (cueory-game-help-seen), so the "?" dialog does not open over a game
 * page at the start of a test. Done per test with an init script, never with a config-level storageState: Firefox cannot
 * apply a storageState origin to a context that has JavaScript turned off. markPanelsSeen calls it; a spec that checks
 * the first visit passes `{ rules: false }`.
 */
export async function markGameRulesSeen(page: Page) {
  await page.addInitScript(() => {
    try {
      if (localStorage.getItem('cueory-game-help-seen') === null) {
        localStorage.setItem('cueory-game-help-seen', JSON.stringify(['vialo', 'pulse', 'triage', 'cueword', 'suture']));
      }
    } catch {
      // Storage is blocked: the dialog stays closed then anyway.
    }
  });
}
