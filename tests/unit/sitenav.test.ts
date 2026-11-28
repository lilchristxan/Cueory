import { describe, expect, it } from 'vitest';
import { aboutLinks, aboutPageLinks, drawerPrimaryLinks, navLinks, visibleAboutLinks } from '../../src/config/sitenav';
import { legalFooterRoutes } from '../../src/config/legalfooter';
import { dailyGames } from '../../src/config/games';
import { gamePages } from '../../src/config/game-pages';

describe('top bar links (redesign P2)', () => {
  it('lists study, games and support, in the renderings order, all lowercase', () => {
    expect(navLinks.map((link) => link.label)).toEqual(['study', 'games', 'support']);
    for (const link of [...navLinks, ...aboutLinks]) expect(link.label).toBe(link.label.toLowerCase());
  });

  it('only links to pages that are ready: no about, contact or anatomy lab until they are written', () => {
    const hrefs = [...navLinks, ...aboutLinks].map((link) => link.href);
    for (const held of ['/about', '/message', '/anatomy', '/preview', '/signin', '/start']) {
      expect(hrefs.some((href) => href.startsWith(held)), held).toBe(false);
    }
  });

  it('the about dropdown holds the legal pages and only approved ones (same rule as the footer)', () => {
    expect(aboutLinks.map((link) => link.href)).toEqual(['/privacy', '/terms', '/disclaimer']);
    const shown = visibleAboutLinks().map((link) => link.href);
    expect(shown).toContain('/privacy');
    for (const href of shown) expect(['/privacy', ...Object.keys(legalFooterRoutes)]).toContain(href);
  });

  it('keeps the drafts-only pages out of the live side bar (resources, anatomy lab)', () => {
    for (const href of ['/resources', '/preview/anatomy-lab']) {
      const row = [...drawerPrimaryLinks, ...aboutPageLinks].find((link) => link.href === href);
      expect(row?.draft, href).toBe(true);
    }
    for (const link of navLinks) expect(link.href).not.toBe('/resources');
  });

  it('the side bar holds exactly study, anatomy lab, games, support and about, and the about page holds the rest', () => {
    expect(drawerPrimaryLinks.map((link) => link.label)).toEqual(['study', 'anatomy lab', 'games', 'support', 'about']);
    expect(aboutPageLinks.map((link) => link.href)).toEqual(['/resources', '/coming-soon', '/message', '/progress', '/privacy', '/terms', '/disclaimer']);
  });

  it('points games at the hub, which still gates the closed games', () => {
    expect(navLinks.find((link) => link.label === 'games')?.href).toBe('/play');
    expect(dailyGames.length).toBeGreaterThan(0);
    expect(Object.values(gamePages).every((page) => page.startsWith('/play/'))).toBe(true);
  });
});
