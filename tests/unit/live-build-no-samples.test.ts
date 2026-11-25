import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { draftBuildEnv } from '../../src/lessons/draftgate';
import { draftsAllowed } from '../../src/islands/anatomylab';

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
// Closed mode comes from the build configuration, never from the built output: the same variables the draft gate reads.
// CI, the live site and a plain `npm run build` are closed; CUEORY_ANATOMY_DRAFTS=1 (the browser-test build) opens it.
const closed = !draftsAllowed(draftBuildEnv(process.env));
const heldRoutes = ['learn/study-skills', ...['cards', 'fill-in', 'learn-mode', 'matching', 'organizer', 'print-cards', 'label-it', 'questions'].map((mode) => `learn/study-skills/${mode}`)];

it.runIf(closed)('a drafts-closed build has no placeholder lesson or card text, in text or meta tags', () => {
  const pages = builtPages(dist);
  expect(pages.length).toBeGreaterThan(0);
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    expect(html, page).not.toMatch(/Placeholder (lesson|card)/i);
    for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) expect(tag, page).not.toMatch(/\[sample|placeholder (lesson|card)|study-skills sample/i);
  }
});

it.runIf(closed)('a drafts-closed build shows a coming-soon marker, noindex and neutral meta on every held route', () => {
  for (const route of heldRoutes) {
    const html = readFileSync(join(dist, `${route}.html`), 'utf8');
    expect(html, route).toContain('data-testid="lesson-soon"');
    expect(html, route).toMatch(/<meta name="robots" content="noindex, nofollow"/);
    expect(html, route).toMatch(/<title>coming soon: [^<]*<\/title>/);
    expect(html, route).not.toMatch(/placeholder (lesson|card)|\[sample/i);
  }
});

it.runIf(closed)('a drafts-closed build keeps every held lesson route out of the sitemap', () => {
  const sitemap = readFileSync(join(dist, 'sitemap.xml'), 'utf8');
  expect(sitemap).not.toContain('/learn/study-skills');
});

// Nothing on the live build may link to, or hand a script the address of, a held lesson route.
it.runIf(closed)('a drafts-closed build has no link or data-href to any held lesson route', () => {
  const held = /(?:href|data-href|action-href|transcriptUrl)="\/learn\/study-skills(?:[/"#?])/;
  for (const page of builtPages(dist)) {
    expect(readFileSync(page, 'utf8'), page).not.toMatch(held);
  }
});

// Menu, mode previews and the library all use the same gate.
it('the mode previews and library read the same draft gate (the side bar no longer lists the sample lesson)', () => {
  for (const path of ['src/components/VialPlatter.astro', 'src/pages/learn/index.astro']) {
    expect(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'), path).toMatch(/sampleLessonShown\(\)/);
  }
});
