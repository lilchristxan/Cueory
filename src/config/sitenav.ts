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
