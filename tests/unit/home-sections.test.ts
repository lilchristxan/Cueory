import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { draftsAllowed } from '../../src/islands/anatomylab';
import { draftBuildEnv, heroStartHref, lessonEntryHref } from '../../src/lessons/draftgate';
import { accountLaunch, accountsOpen, showsHeroJoin } from '../../src/config/site';

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
  it('has one h1 and the approved lower-section order', () => {
    expect([...main!.matchAll(/<h1\b[^>]*>/g)]).toHaveLength(1);
    const ids = [...main!.matchAll(/<section\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1]);
    expect(ids.filter((id) => ['ways-to-study', 'daily-games', 'signup'].includes(id))).toEqual(['ways-to-study', 'daily-games', 'signup']);
    expect(titles(section('ways-to-study'), 2).filter(Boolean)).toEqual(['one lesson, multiple ways to study']);
    expect(titles(section('daily-games'), 2)).toEqual(["nurse's station games"]);
    expect(titles(section('signup'), 2)).toEqual(['coming soon']);
    expect(main).not.toContain('id="how-it-works"');
  });

  it('keeps the games cards and Kit signup contract', () => {
    const games = section('daily-games');
    const signup = section('signup');
    expect(links(games)).toEqual([
      '/play/vialo',
      '/play/tachyyy',
      '/play/piccline',
      '/play/crossword',
      '/play/sudoku',
      '/play/hello-cards',
      '/play',
    ]);
    expect(plain(games)).toContain("crossword a mini crossword from this week's lessons.");
    expect(plain(games)).toMatch(/hello cards flip a card,\s*start a conversation\./);
    expect(plain(games)).toContain('sudoku a calm numbers break.');
    expect(signup).toContain('id="signup"');
    // The signup landmark is named by its "launch updates" eyebrow and its heading together.
    expect(signup).toMatch(/<section\b[^>]*\baria-labelledby="signup-eyebrow signup-heading"/);
    expect(plain(signup.match(/<p\b[^>]*\bid="signup-eyebrow"[^>]*>[\s\S]*?<\/p>/)?.[0] ?? '')).toBe('launch updates');
    expect(plain(signup)).toContain('Mental Health I and Med Math are next. Get one email when they open.');
  });

  it('keeps surviving lower-section style values in tokens, not inline styles or raw colors', () => {
    for (const file of ['DailyGamesSection.astro', 'SignupForm.astro']) {
      const source = readFileSync(new URL('../../src/components/' + file, import.meta.url), 'utf8');
      expect(source).not.toMatch(/\bstyle\s*=/i);
      expect(source).not.toMatch(/#[\da-f]{3,8}\b/i);
    }
  });
  it('builds the redesigned hero: a closed call to action, no quiet join link, and true explore links (P5)', () => {
    const hero = built.match(/<section\b[^>]*\bscene-hero\b[^>]*>[\s\S]*?<\/section>/)?.[0];
    if (!hero) throw new Error('missing home hero');
    const heading = hero.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '';
    expect(plain(heading)).toBe('nursing school made simpler.');
    expect(plain(hero)).toContain('by nursing students, for nursing students');
    // The "start studying" call to action follows the draft gate (heroStartHref): a copper link to the open lesson where
    // drafts may show, and in the live build a disabled button tagged "coming soon", never a link that leads nowhere.
    const open = draftsAllowed(draftBuildEnv(process.env));
    const startTag = hero.match(/<(a|button)\b(?=[^>]*data-testid="hero-start")[^>]*>([\s\S]*?)<\/\1>/);
    expect(plain(startTag?.[2] ?? '')).toBe('start studying for free →');
    if (open) {
      expect(startTag?.[1]).toBe('a');
      expect(startTag?.[0]).toContain('href="' + lessonEntryHref(process.env) + '"');
      expect(startTag?.[0]).toContain('copper-button');
      expect(startTag?.[0]).not.toContain('aria-disabled');
    } else {
      expect(startTag?.[1]).toBe('button');
      expect(startTag?.[0]).toContain('aria-disabled="true"');
      expect(startTag?.[0]).not.toContain('href=');
      expect(hero).toContain('coming soon');
    }
    // The old quiet launch-list link went away with the old hero (copy deck, "hero quiet link"); the form is lower down.
    expect(hero).not.toContain('data-testid="hero-join"');
    expect(accountLaunch(true)).toMatchObject({ accountHref: '/signup', promoJoinLabel: 'create your free account' });
    // The third value point stays held: there is no support for "adhd friendly" yet.
    expect(plain(hero)).not.toMatch(/adhd/i);
    expect(plain(hero)).toContain('structured learning');
    expect(plain(hero)).toContain('multiple ways to study');
    // Explore tiles: only places that exist today; "resources" waits until that page is live.
    const explore = hero.match(/<nav\b[^>]*aria-labelledby="explore-heading"[\s\S]*?<\/nav>/)?.[0] ?? '';
    expect(links(explore)).toEqual(['/learn', '#ways-to-study', '/play', '/message']);
    expect(plain(explore)).not.toMatch(/resources/i);
    for (const href of ['/learn', '/play', '/message']) expect(existsSync(new URL('../../dist' + href + '.html', import.meta.url)) || existsSync(new URL('../../dist' + href + '/index.html', import.meta.url))).toBe(true);
    // Ko-fi card: the supporting-our-mission page, opened in a new tab and said so to screen readers.
    const support = hero.match(/<a\b(?=[^>]*data-testid="hero-support")[^>]*>[\s\S]*?<\/a>/)?.[0] ?? '';
    expect(support).toContain('target="_blank"');
    expect(support).toContain('rel="noopener noreferrer"');
    expect(support).toContain('opens in a new tab');
    // The figure loads at once and is decorative.
    expect(hero).toMatch(/<img\b(?=[^>]*hero-anatomy-figure\.webp)(?=[^>]*loading="eager")(?=[^>]*alt="")[^>]*>/);
  });

  it('draws the hairline rule between the hero value points from the tablet width up, as in HomeV2-1', () => {
    const source = readFileSync(new URL('../../src/components/HomeHero.astro', import.meta.url), 'utf8');
    const ruled = source.match(/<li class="([^"]*)" data-hero-point-rule>/);
    expect(ruled, 'second value point carries the rule').not.toBeNull();
    expect(ruled![1].split(' ')).toEqual(expect.arrayContaining(['sm:border-s', 'sm:border-line', 'sm:ps-5']));
  });

  it('the hero start button follows the draft gate: closed live, a link to the open lesson elsewhere', () => {
    // The live build (a Workers Build of main) holds the sample lesson back, so there is no link to show.
    expect(heroStartHref({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' })).toBeNull();
    expect(heroStartHref({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'refs/heads/main' })).toBeNull();
    expect(heroStartHref({ WORKERS_CI: '1' })).toBeNull();
    expect(heroStartHref({})).toBeNull();
    // Staging, previews and the browser-test build show the sample lesson, and the button links to it.
    expect(heroStartHref({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'staging' })).toBe('/learn/study-skills');
    expect(heroStartHref({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'task-p5/home-hero' })).toBe('/learn/study-skills');
    expect(heroStartHref({ CUEORY_ANATOMY_DRAFTS: '1' })).toBe('/learn/study-skills');
    // The hero asks the guard; it never decides on its own.
    const source = readFileSync(new URL('../../src/components/HomeHero.astro', import.meta.url), 'utf8');
    expect(source).toContain('heroStartHref()');
    expect(source).toMatch(/startHref \? \(/);
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
