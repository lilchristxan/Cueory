import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

/**
 * Pages that carry labeled "[sample ...]" or "[... pending]" text must only build where drafts may show (staging,
 * previews, local and test builds). The live build (Workers Build of main) gets a plain coming-soon page instead.
 */
const pages = ['src/pages/resources.astro', 'src/pages/preview/concept-map.astro'];

for (const path of pages) {
  it(`${path} gates its placeholder text on draftsAllowed`, () => {
    const source = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
    expect(source).toMatch(/import \{ draftsAllowed \} from '[./]+\/islands\/anatomylab'/);
    expect(source).toMatch(/const shown = draftsAllowed\(\{[^}]*WORKERS_CI_BRANCH: process\.env\.WORKERS_CI_BRANCH/s);
    expect(source).toMatch(/shown \?|!shown \?/);
  });
}

// Every page that renders the study-skills sample lesson, cards or questions goes through the same gate (lessonIsHeldBack).
const lessonPages = [
  ...['index', 'cards', 'fill-in', 'learn-mode', 'matching', 'organizer', 'print-cards'].map((name) => `src/pages/learn/[lesson]/${name}.astro`),
  'src/pages/learn/study-skills/label-it.astro',
  'src/pages/learn/study-skills/questions.astro',
];

for (const path of lessonPages) {
  it(`${path} shows a coming-soon page when the lesson is held back`, () => {
    const source = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
    expect(source).toContain("import { lessonIsHeldBack } from '../../../lessons/holdback'");
    expect(source).toMatch(/const hold = await lessonIsHeldBack\(/);
    expect(source).toMatch(/\{hold \? <LessonComingSoon \/> : \(/);
  });
}

function builtPages(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    return entry.isDirectory() ? builtPages(path) : entry.name.endsWith('.html') ? [path] : [];
  });
}

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
const heldBack = (() => {
  try {
    return readFileSync(join(dist, 'learn/study-skills.html'), 'utf8').includes('data-testid="lesson-soon"');
  } catch {
    return false;
  }
})();

// A drafts-closed build (what CI and the live site build) must carry no sample text anywhere, in markup or meta tags.
it.runIf(heldBack)('a drafts-closed build has no placeholder lesson or card text, in text or meta tags', () => {
  const pages = builtPages(dist);
  expect(pages.length).toBeGreaterThan(0);
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    expect(html, page).not.toMatch(/Placeholder (lesson|card)/i);
    for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) expect(tag, page).not.toMatch(/\[sample|placeholder (lesson|card)/i);
  }
});

it.runIf(heldBack)('a drafts-closed build keeps the held-back lessons out of the sitemap and out of search', () => {
  const sitemap = readFileSync(join(dist, 'sitemap.xml'), 'utf8');
  expect(sitemap).not.toContain('/learn/study-skills');
  for (const route of ['learn/study-skills', 'learn/study-skills/cards', 'learn/study-skills/questions', 'learn/study-skills/label-it']) {
    const html = readFileSync(join(dist, `${route}.html`), 'utf8');
    expect(html, route).toMatch(/<meta name="robots" content="noindex, nofollow"/);
    expect(html, route).toContain('data-testid="lesson-soon"');
  }
});
