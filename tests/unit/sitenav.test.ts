import { describe, expect, it } from 'vitest';
import { aboutLinks, navLinks, visibleAboutLinks } from '../../src/config/sitenav';
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

  it('points games at the hub, which still gates the closed games', () => {
    expect(navLinks.find((link) => link.label === 'games')?.href).toBe('/play');
    expect(dailyGames.length).toBeGreaterThan(0);
    expect(Object.values(gamePages).every((page) => page.startsWith('/play/'))).toBe(true);
  });
});
