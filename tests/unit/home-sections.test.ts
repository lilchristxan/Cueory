import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { draftsAllowed } from '../../src/islands/anatomylab';
import { draftBuildEnv } from '../../src/lessons/draftgate';
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
