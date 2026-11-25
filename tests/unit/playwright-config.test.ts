import { describe, expect, it } from 'vitest';
import config from '../../playwright.config';

// A config-level storageState with origins breaks every JavaScript-disabled test in Firefox (Playwright restores
// localStorage by running script in the origin). Seed storage per test with an init script instead (tests/e2e/clock.ts).
describe('playwright config', () => {
  it('has no global storageState', () => {
    expect((config.use as Record<string, unknown>).storageState).toBeUndefined();
    for (const project of config.projects ?? []) {
      expect((project.use as Record<string, unknown> | undefined)?.storageState).toBeUndefined();
    }
  });
});
