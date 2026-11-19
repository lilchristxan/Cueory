import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { draftsAllowed } from '../../src/islands/anatomylab';
import { draftBuildEnv, heroStartHref, lessonEntryHref } from '../../src/lessons/draftgate';
import { indexablePages } from '../../src/config/routes';
import { accountLaunch, accountsOpen, newsletter, showsHeroJoin } from '../../src/config/site';

// Verify the built visitor-facing HTML after npm run build, not only Astro source text.
const built = readFileSync(new URL('../../dist/index.html', import.meta.url), 'utf8');
const main = built.match(/<main\b[^>]*>[\s\S]*?<\/main>/)?.[0];
if (!main) throw new Error('missing main landmark on the built home page');

function section(id: 'how-it-works'): string {
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

describe('home how-it-works (W01-3)', () => {
  it('has one h1, ordered h2 sections and h3 children', () => {
    const how = section('how-it-works');
    expect([...main!.matchAll(/<h1\b[^>]*>/g)]).toHaveLength(1);
    expect(main!.indexOf(how)).toBeGreaterThan(main!.indexOf('<h1'));
    expect(titles(how, 2)).toEqual(['how it works']);
    expect(titles(how, 3)).toHaveLength(3);
    expect(how.indexOf('<h3')).toBeGreaterThan(how.indexOf('<h2'));
    // The feature tiles repeated the vials and the lesson link, so they left the home page (lane 14 home polish).
    expect(main).not.toContain('id="study-features"');
    expect(main).not.toContain('made for the way you study');
  });

  it('keeps three correctly ordered, labeled list steps', () => {
    const how = section('how-it-works');
    expect(how).toContain('aria-labelledby="how-it-works-heading"');
    expect(how).toContain('id="how-it-works-heading"');
    const list = how.match(/<ol\b[^>]*>([\s\S]*?)<\/ol>/)?.[1];
    expect(list).toBeDefined();
    const steps = [...(list ?? '').matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]!);
    expect(steps).toHaveLength(3);
    expect(steps.map((step) => titles(step, 3)[0])).toEqual([
      'pick a lesson', 'study it your way', "come back to what you're still learning",
    ]);
    for (const [index, step] of steps.entries()) {
      expect(step).toContain('aria-hidden="true"');
      expect(plain(step)).toContain('0' + (index + 1));
      expect(titles(step, 3)).toHaveLength(1);
    }
  });

  it('links only to existing indexable Cueory routes', () => {
    const how = section('how-it-works');
    const fromHow = links(how);
    // The one lesson link is the sample lesson's: it only renders where the draft gate shows it (never on the live build).
    // Closed mode comes from the build configuration: the live build has no lesson link, a drafts build has the one.
    expect(fromHow).toEqual(draftsAllowed(draftBuildEnv(process.env)) ? ['/learn/study-skills'] : []);
    expect(readFileSync(new URL('../../src/components/HowItWorks.astro', import.meta.url), 'utf8')).toMatch(/sampleLessonShown\(\) && \(/);
    expect(indexablePages).not.toContain('/learn/study-skills');
    for (const href of fromHow) {
      const file = new URL('../../dist' + href + '.html', import.meta.url);
      expect(existsSync(file)).toBe(true);
    }
  });

  it('keeps style values in tokens, not inline styles or raw colors', () => {
    for (const file of ['HowItWorks.astro']) {
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
    expect(ruled![1].split(' ')).toEqual(expect.arrayContaining(['sm:border-s', 'sm:border-control', 'sm:ps-5']));
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
