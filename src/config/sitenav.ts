/**
 * The persistent top bar (redesign P2, docs/design/redesign-plan.md C1): a pill of links on wide screens, with an
 * "about" dropdown. Phones and tablets keep the ☰ side panel (SiteMenu.astro), which also holds the site search.
 *
 * Only pages that are ready at launch are listed. The renderings also show "about us", "how to use cueory" and
 * "contact us"; those pages are still being written (P7, P13), so they join `aboutLinks` when they land, and the
 * "about" dropdown shows only links that exist.
 */
import { visibleFooterLinks } from './legalfooter';

export interface NavLink {
  href: string;
  label: string;
}

/** The main pill, in the order the renderings show: study, games, support. */
export const navLinks: readonly NavLink[] = [
  { href: '/courses', label: 'study' },
  { href: '/play', label: 'games' },
  { href: '/support', label: 'support' },
];

/** The "about" dropdown. Legal pages appear only once approved (same rule as the footer, #747). */
export const aboutLinks: readonly NavLink[] = [
  { href: '/privacy', label: 'privacy' },
  { href: '/terms', label: 'terms' },
  { href: '/disclaimer', label: 'disclaimer' },
];

export function visibleAboutLinks(): NavLink[] {
  return visibleFooterLinks(aboutLinks);
}

export interface DrawerLink {
  href: string;
  label: string;
  /** Shown only where this build may show drafts (staging, previews, local), never on the live site. */
  draft?: boolean;
}

/**
 * The rows of the side bar, as on Christian's boards (2026-11-24, revised the same day): study, anatomy lab, games,
 * support and about. The anatomy lab shows only in builds that may show drafts; it links to its preview page there.
 * Every other page the bar used to list sits on the about page instead (`aboutPageLinks`).
 */
export const drawerPrimaryLinks: readonly DrawerLink[] = [
  { href: '/courses', label: 'study' },
  { href: '/preview/anatomy-lab', label: 'anatomy lab', draft: true },
  { href: '/play', label: 'games' },
  { href: '/support', label: 'support' },
  { href: '/about', label: 'about' },
];

/**
 * The links section of the about page. "how to use cueory" is a draft page, so it is linked only in builds that may show
 * drafts (never on the live site); the legal pages follow the footer's approval rule (#747, via `visibleFooterLinks`).
 * "my progress" is here because the side bar no longer lists it and nothing else on the site links to it plainly.
 */
export const aboutPageLinks: readonly DrawerLink[] = [
  { href: '/resources', label: 'how to use cueory', draft: true },
  { href: '/coming-soon', label: 'coming soon + mailing list' },
  { href: '/message', label: 'contact us' },
  { href: '/progress', label: 'my progress' },
  { href: '/privacy', label: 'privacy' },
  { href: '/terms', label: 'terms' },
  { href: '/disclaimer', label: 'disclaimer' },
];
