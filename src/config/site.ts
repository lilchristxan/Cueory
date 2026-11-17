/**
 * Site-wide settings Christian can change without touching components.
 */
export const site = {
  name: 'Cueory',
  /**
   * The name as the wordmark writes it. Lowercase-styled UI (page titles, buttons, menus) uses this; prose keeps
   * "Cueory" (D-47, all-lowercase brand voice).
   */
  wordmarkName: 'cueory',
  /** Exact motto: always lowercase, with the comma and final period (brand spec section 2). */
  tagline: 'by nursing students, for nursing students.',
  /** Product description (brand spec section 2). */
  description: 'Nursing school is hard enough. Cueory makes studying simpler.',

  /** The live address. */
  url: 'https://cueory.app',

  /** Shows "we're still building. more coming soon." on every page. Set to false to remove it. */
  showBuildingNotice: true,

  /** The supporting-our-mission page (Ko-fi; D-94). Leave empty to hide the button on /support. */
  tipPageUrl: 'https://ko-fi.com/cueory',

  /** Shown in the footer and on the privacy page. */
  contactEmail: 'hello@cueory.app',

  /** Student-facing status of nursing-content review (Task 520). */
  contentNotice: 'some lessons are samples or placeholders. content may not have citations or licensed-nurse review',
} as const;

/**
 * Launch-updates signup (Kit). The form posts straight to Kit; no Kit script
 * runs on our pages. Until the Kit form exists (formAction empty), the signup
 * box links out to Kit's landing page (landingUrl); with neither, it says
 * "sign ups open soon." instead.
 */
export const newsletter = {
  provider: 'Kit',
  /** The form's "action" address from Kit's HTML embed code. Public, not a secret. */
  formAction: '',
  /** The email field's "name" from Kit's HTML embed code. */
  emailFieldName: 'email_address',
  /** Christian's Kit landing page (a plain link out, no Kit script). Must be https on a kit.com host. */
  landingUrl: 'https://cueory.kit.com/bfd9609b46',
} as const;

/**
 * A Kit address, normalised by the URL parser (so the host is lowercase and an international name is punycode), if it
 * is https on kit.com or one of its subdomains, on the default port, with no sign-in details; otherwise ''. A host with
 * a trailing dot ("cueory.kit.com.") doesn't count. Used for both the landing page and the form address, so a mistaken
 * host can never become a link or widen the CSP's form-action (astro.config.mjs).
 */
export function kitUrl(value: string): string {
  try {
    const url = new URL(value);
    const kitHost = url.hostname === 'kit.com' || url.hostname.endsWith('.kit.com');
    const plain = !url.username && !url.password && url.port === '';
    return url.protocol === 'https:' && kitHost && plain ? url.href : '';
  } catch {
    return '';
  }
}

/** The landing page address if it is a valid Kit address (kitUrl), otherwise ''. */
export function kitLandingUrl(value: string): string {
  return kitUrl(value);
}

/** The form's address if it is a valid Kit address (kitUrl; Kit's form posts go to app.kit.com), otherwise ''. */
export function kitFormAction(value: string): string {
  return kitUrl(value);
}

/**
 * What the launch-updates box shows: Kit's form, a link to Kit's landing page, or "sign ups open soon.". An address
 * that isn't a valid Kit address is ignored, so the box falls back to the next state.
 */
export function signupState(formAction: string, landingUrl: string): 'form' | 'landing' | 'pending' {
  if (kitFormAction(formAction)) return 'form';
  return kitLandingUrl(landingUrl) ? 'landing' : 'pending';
}

/**
 * Cueory's social profiles (D-54; addresses confirmed by Christian on 1 Nov 2026, D-65). Each shows as its platform's
 * one-color mark, linking to the profile in a new tab, in the footer, the ☰ panel and the promo panel. Only profiles
 * with an address show. Leave an address empty to hide that platform.
 */
export const socials = [
  { id: 'instagram', name: 'Instagram', href: 'https://www.instagram.com/cueory.app/' },
  { id: 'tiktok', name: 'TikTok', href: 'https://www.tiktok.com/@cueory' },
  { id: 'youtube', name: 'YouTube', href: 'https://www.youtube.com/@cueory' },
  { id: 'x', name: 'X', href: 'https://x.com/cueory' },
  { id: 'facebook', name: 'Facebook', href: 'https://www.facebook.com/people/Cueory/61596065312423/' },
  { id: 'pinterest', name: 'Pinterest', href: 'https://www.pinterest.com/cueoryapp/' },
] as const;

export const footerLinks = [
  { href: '/courses', label: 'courses' },
  { href: '/coming-soon', label: 'coming soon' },
  { href: '/privacy', label: 'privacy' },
  { href: '/terms', label: 'terms' },
  { href: '/disclaimer', label: 'disclaimer' },
  { href: '/support', label: 'support cueory' },
] as const;

/** Public launch wording only. This never enables authentication or changes access control. */
export const accountsOpen: boolean = false;

/** Keep the account links and the already-planned promo label together for either launch state. */
export function accountLaunch(open: boolean) {
  return {
    accountHref: open ? '/signup' : '/#signup',
    signInHref: open ? '/signin' : '/#signup',
    promoJoinLabel: open ? 'create your free account' : 'join the launch list',
  };
}

export const accountHref = accountLaunch(accountsOpen).accountHref;

/**
 * Whether the home hero shows its quiet join link. It leads to a real next step only once accounts are open or the
 * launch-updates box has Kit's form or its landing-page link; with neither, the box only says "sign ups open soon.",
 * so the link would be a dead end.
 */
export function showsHeroJoin(open: boolean, formAction: string, landingUrl: string): boolean {
  return open || signupState(formAction, landingUrl) !== 'pending';
}

/**
 * The ☰ side panel (D-46). Lowercase on purpose (D-47). A link with a note shows it beside the label, for things
 * that aren't open yet. Search joins the top of the panel in its own pull request.
 */
export const menuLinks = [
  { href: '/', label: 'home' },
  { href: '/courses', label: 'courses' },
  { href: '/#ways-to-study', label: 'ways to study' },
  { href: '/learn/study-skills', label: 'lessons' },
  { href: '/play', label: 'daily games' },
  { href: '/progress', label: 'my progress', note: 'saved on this device' },
  { href: '/support', label: 'support cueory' },
] as const;

/** Small links at the bottom of the side panel. */
export const menuSmallLinks = [
  { href: '/privacy', label: 'privacy' },
  { href: '/terms', label: 'terms' },
] as const;

/**
 * The once-only promo panel (D-59), on marketing pages only, never on study screens. It slides down from the top after
 * `delaySeconds`, or as soon as the visitor has scrolled halfway down the page, whichever comes first. Once it has
 * been shown it stays away for `rememberDays`, whether the visitor closed it, clicked it or ignored it. Lowercase brand
 * voice (D-47). When accounts exist (ROADMAP Task 2), the button becomes "create your free account" and goes to
 * sign-up; until then it goes to the launch-updates signup (`accountHref`).
 */
export const promo = {
  /** Set to false to turn the panel off on every page. */
  show: true,
  delaySeconds: 5,
  rememberDays: 30,
  heading: 'welcome to cueory.',
  text: "we're still building. get a few emails about new lessons and the launch.",
  joinLabel: accountLaunch(accountsOpen).promoJoinLabel,
  /** Goes to the supporting-our-mission page (`site.tipPageUrl`, Ko-fi); hidden when that is empty (D-94). */
  supportLabel: 'supporting our mission',
} as const;

/**
 * Offline copies of pages (ROADMAP Task 5, docs/OFFLINE.md). Set `enabled` to false and deploy to switch it off for
 * everyone: pages stop registering the service worker, and /sw.js becomes a worker that deletes the saved copies and
 * removes itself the next time a visitor's browser checks for an update.
 */
export const offline = {
  enabled: true,
};
