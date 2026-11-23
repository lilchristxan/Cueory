import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Advisor finding (#903, lane 4): the /start coming-soon page's two standalone links are 44 px tap targets. That branch
// only renders when onboarding is closed (the live build), so the browser tests cannot reach it; check the source.
describe('/start coming-soon links', () => {
  const source = readFileSync(new URL('../../src/pages/start.astro', import.meta.url), 'utf8');

  for (const [href, label] of [['/learn', 'back to learn'], ['/play', 'play the daily games']] as const) {
    it(`"${label}" is at least the tap-target height`, () => {
      const anchor = source.match(new RegExp(`<a [^>]*href="${href}"[^>]*>${label}</a>`));
      expect(anchor, label).not.toBeNull();
      expect(anchor![0]).toContain('min-h-(--tap-min)');
      expect(anchor![0]).toContain('inline-flex');
    });
  }
});
