import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Advisor finding (#903, lane 4): the /start coming-soon page's two standalone links are 44 px tap targets. That branch
// only renders when onboarding is closed (the live build), so the browser tests cannot reach it; check the source.
describe('coming-soon panel links (/start and held-back lessons)', () => {
  const source = readFileSync(new URL('../../src/components/ComingSoonPanel.astro', import.meta.url), 'utf8');

  for (const [href, label] of [['/learn', 'back to learn'], ['/play', 'play the daily games']] as const) {
    it(`"${label}" is at least the tap-target height`, () => {
      const anchor = source.match(new RegExp(`<a [^>]*href="${href}"[^>]*>${label}</a>`));
      expect(anchor, label).not.toBeNull();
      // The shared panel gives both links one button class: a real 44 px pill.
      expect(anchor![0]).toContain('class={button}');
      expect(source).toMatch(/const button =\s*'[^']*min-h-\(--tap-min\)[^']*inline-flex|const button =\s*'[^']*inline-flex[^']*min-h-\(--tap-min\)/);
    });
  }
});
