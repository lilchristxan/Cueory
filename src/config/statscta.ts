import { accountLaunch, accountsOpen, newsletter, signupState } from './site';

// Kept out of site.ts on purpose: site.ts is bundled into every game page's islands, and a top-level call there stays in the
// bundle even when nothing uses it (the route JavaScript budget, tests/unit/build-output.test.ts). Only the page and the hub's
// totals import this file.
/**
 * The copper bar that stands where a signed-out player's game stats would be (the game page's sidebar and the /play hub's
 * left panel). Open accounts: an account link. While accounts are closed `accountHref` is the launch-updates form, so the
 * bar uses the site's own launch wording ("join the launch list", as the promo panel does) and says why.
 */
export function accountStatsCta(open: boolean, signup: 'form' | 'landing' | 'pending' = 'form') {
  const launch = accountLaunch(open);
  if (open) return { href: launch.accountHref, label: 'create an account', note: 'to save your daily game stats' };
  // Closed, and the launch-updates box has neither Kit's form nor its landing page (ComingSoon shows only "sign ups open
  // soon."): there is nothing to complete at /#signup, so the bar is a plain message, with no link.
  if (signup === 'pending') return { href: '', label: 'sign ups open soon.', note: '' };
  return { href: launch.accountHref, label: launch.promoJoinLabel, note: 'accounts open soon' };
}

export const statsCta = accountStatsCta(accountsOpen, signupState(newsletter.formAction, newsletter.landingUrl));
