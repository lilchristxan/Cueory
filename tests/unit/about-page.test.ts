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
      { level: 1, text: 'about cueory' },
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

  it('replaces all eight text placeholders with meaningful, safely qualified copy', () => {
    const paragraphs = [...markup.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)];
    expect(paragraphs).toHaveLength(8);
    for (const paragraph of paragraphs) {
      expect(paragraph[1]).not.toContain('data-placeholder');
      expect(paragraph[2]!.trim()).not.toBe('[Christian writes this]');
      expect(paragraph[2]!.trim().length).toBeGreaterThan(0);
    }

    const lessonBullets = [...markup.matchAll(/<li>\s*<p\b[^>]*>([\s\S]*?)<\/p>\s*<\/li>/g)];
    expect(lessonBullets).toHaveLength(3);
    for (const bullet of lessonBullets) expect(bullet[1]!.trim().length).toBeGreaterThan(30);
    expect(markup).toContain('Some content may not have citations or a licensed-nurse review');
    expect(markup).toContain('Launch-update emails are not open yet');
    expect(markup).toContain('Do not send anyone\'s private or patient information.');
  });

  it('uses the existing brand UI and does not index unfinished founder copy', () => {
    expect(markup).toMatch(/<Layout\b[\s\S]*?\bnoindex\b[\s\S]*?>/);
    expect(indexablePages).not.toContain('/about');
    expect(markup.match(/class="[^"]*\bveil\b/g)).toHaveLength(4);
    expect(markup).toContain('class="display');
    expect(markup).toContain('href="/#signup"');
    expect(markup).toContain('href="/support"');
    expect(markup).not.toMatch(/<script\b|<style\b|\sstyle=/i);
  });
});
