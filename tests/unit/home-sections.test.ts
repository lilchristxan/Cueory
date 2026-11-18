import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { accountLaunch, accountsOpen, newsletter, showsHeroJoin } from '../../src/config/site';

// Verify the built visitor-facing HTML after npm run build, not only Astro source text.
const built = readFileSync(new URL('../../dist/index.html', import.meta.url), 'utf8');
const main = built.match(/<main\b[^>]*>[\s\S]*?<\/main>/)?.[0];
if (!main) throw new Error('missing main landmark on the built home page');

function section(id: 'ways-to-study' | 'daily-games' | 'signup'): string {
  const expression = new RegExp('<section\\b(?=[^>]*\\bid="' + id + '")[^>]*>[\\s\\S]*?<\\/section>');
  const found = main!.match(expression)?.[0];
  if (!found) throw new Error('missing home section: ' + id);
  return found;
}
function plain(markup: string): string {
  return markup.replace(/<[^>]*>/g, ' ').replace(/&#(?:39|x27);|&apos;/gi, "'").replace(/\s+/g, ' ').trim();
}
function titles(markup: string, level: 2 | 3): string[] {
  const expression = new RegExp('<h' + level + '\\b[^>]*>([\\s\\S]*?)<\\/h' + level + '>', 'g');
  return [...markup.matchAll(expression)].map((match) => plain(match[1]!));
}
function links(markup: string): string[] {
  return [...markup.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>/g)].map((match) => match[1]!);
}

describe('home lower sections', () => {
  it('has one h1 and only the approved lower-section order', () => {
    expect([...main!.matchAll(/<h1\b[^>]*>/g)]).toHaveLength(1);
    const ids = [...main!.matchAll(/<section\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toEqual(['ways-to-study', 'daily-games', 'signup']);
    expect(titles(section('ways-to-study'), 2).filter(Boolean)).toEqual(['ways to study']);
    expect(titles(section('daily-games'), 2)).toEqual(['a few minutes, every day.']);
    expect(titles(section('signup'), 2)).toEqual(['coming soon']);
    expect(main).not.toContain('how-it-works');
  });

  it('keeps the games action, closed-game gates and Kit signup contract', () => {
    const games = section('daily-games');
    const signup = section('signup');
    expect(links(games)).toEqual(['/play']);
    expect(plain(games)).toContain('crossword coming soon');
    expect(plain(games)).toMatch(/hello cards flip a card, start a conversation\. coming soon/);
    expect(plain(games)).toContain('sudoku fill every row, column and box with the numbers one through nine.');
    expect(signup).toContain('id="signup"');
    expect(plain(signup)).toContain('Mental Health I and Med Math are next. Get one email when they open.');
  });

  it('keeps surviving lower-section style values in tokens, not inline styles or raw colors', () => {
    for (const file of ['DailyGamesSection.astro', 'SignupForm.astro']) {
      const source = readFileSync(new URL('../../src/components/' + file, import.meta.url), 'utf8');
      expect(source).not.toMatch(/\bstyle\s*=/i);
      expect(source).not.toMatch(/#[\da-f]{3,8}\b/i);
    }
  });
  it("ties the hero's quiet link to the account launch switch (create your free account -> /signup once open)", () => {
    // The e2e specs run against one build, so the accounts-open state is checked here without changing site config.
    const source = readFileSync(new URL('../../src/pages/index.astro', import.meta.url), 'utf8');
    expect(source).toContain('accountLaunch(accountsOpen).promoJoinLabel');
    expect(source).toMatch(/href=\{accountHref\}[\s\S]*?data-testid="hero-join"/);
    expect(source).toContain('showsHeroJoin(accountsOpen, newsletter.formAction, newsletter.landingUrl)');
    expect(accountLaunch(true)).toMatchObject({ accountHref: '/signup', promoJoinLabel: 'create your free account' });
    const join = built.match(/<a\b(?=[^>]*data-testid="hero-join")[^>]*>([\s\S]*?)<\/a>/);
    if (showsHeroJoin(accountsOpen, newsletter.formAction, newsletter.landingUrl)) {
      expect(join?.[0]).toContain('href="' + accountLaunch(accountsOpen).accountHref + '"');
      expect(plain(join?.[1] ?? '')).toBe(accountLaunch(accountsOpen).promoJoinLabel);
    } else {
      // Accounts closed, no Kit form and no landing page: the box below has no button, so the hero shows no link to it.
      expect(join).toBeNull();
    }
  });

  it('shows the hero join link only when it leads to a real next step', () => {
    // Made-up sample addresses.
    const form = 'https://app.kit.com/forms/0000000/subscriptions';
    const landing = 'https://sample.kit.com/0000000000';
    // Accounts closed, no form and no landing page: the box only says "sign ups open soon.", so no link.
    expect(showsHeroJoin(false, '', '')).toBe(false);
    expect(showsHeroJoin(false, 'http://example.com/form', '')).toBe(false);
    expect(showsHeroJoin(false, '', 'https://example.com/not-kit')).toBe(false);
    // Accounts closed, Kit form or landing page set: the link joins the launch list.
    expect(showsHeroJoin(false, form, '')).toBe(true);
    expect(showsHeroJoin(false, '', landing)).toBe(true);
    expect(showsHeroJoin(false, form, landing)).toBe(true);
    // Accounts open: the link creates the free account either way.
    expect(showsHeroJoin(true, '', '')).toBe(true);
    expect(showsHeroJoin(true, form, landing)).toBe(true);
  });
});
