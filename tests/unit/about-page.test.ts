import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { indexablePages } from '../../src/config/routes';

const source = readFileSync(new URL('../../src/pages/about.astro', import.meta.url), 'utf8');
const markup = source.slice(source.indexOf('<Layout'));

describe('about page shell', () => {
  it('keeps one h1 and the reference design sections in order', () => {
    const headings = [...markup.matchAll(/<h([12])\b[^>]*>([\s\S]*?)<\/h\1>/g)].map((match) => ({
      level: Number(match[1]),
      text: match[2]!.trim(),
    }));

    expect(headings).toEqual([
      { level: 1, text: 'we know nursing school is<br class="hidden sm:inline" /> hard.' },
      { level: 2, text: 'our mission' },
      { level: 2, text: 'how we make our lessons' },
      { level: 2, text: "what's coming" },
      { level: 2, text: 'help keep cueory free.' },
    ]);

    const sectionIds = [...markup.matchAll(/<section\b[^>]*aria-labelledby="([^"]+)"/g)].map((match) => match[1]);
    expect(sectionIds).toEqual(['mission-heading', 'lessons-heading', 'coming-heading', 'support-heading']);
    for (const id of sectionIds) {
      expect(markup).toContain(`id="${id}"`);
    }
  });

  it('keeps the founder-owned story placeholder while shipping approved About copy', () => {
    const paragraphs = [...markup.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)];
    expect(paragraphs).toHaveLength(6);
    const founderStory = paragraphs.find((paragraph) => paragraph[1]!.includes('data-placeholder="CHRISTIAN-TEXT"'));
    expect(founderStory?.[2]!.trim()).toBe("[Christian's story: why Cueory exists, in his own words.]");

    expect(markup).toContain('To make studying for nursing school simpler, and to give nursing students the materials they need to succeed and become great nurses at an affordable price.');
    expect(markup).toContain('Spot a mistake? The flag button is on every page, and we fix it.');
    expect(markup).toContain('Mental Health I and Med Math are next, then Med-Surg II.');
  });

  it('uses the existing brand UI and does not index unfinished founder copy', () => {
    expect(markup).toMatch(/<Layout\b[\s\S]*?\bnoindex\b[\s\S]*?>/);
    expect(indexablePages).not.toContain('/about');
    expect(markup.match(/class="[^"]*\bveil\b/g)).toHaveLength(4);
    expect(markup).toContain('class="display');
    expect(markup).toContain('href="/#signup"');
    expect(markup).toContain('href={site.tipPageUrl}');
    expect(markup).toContain('var(--cueory-copper-start)');
    expect(markup).toContain('var(--cueory-copper-ink)');
    expect(markup).not.toMatch(/<script\b|<style\b/i);
  });
});
