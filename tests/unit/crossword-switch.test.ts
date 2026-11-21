import { describe, expect, it } from 'vitest';
import { crosswordShown } from '../../src/config/crossword';
import { crosswordOpen } from '../../src/config/site';

// While the crossword is closed (site.ts), only builds that may show drafts keep the sample puzzles.
describe('crossword switch', () => {
  it('is closed on the live build', () => {
    expect(crosswordShown({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' }, false)).toBe(false);
    expect(crosswordShown({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'refs/heads/main' }, false)).toBe(false);
  });

  it('is closed on a plain local or uploaded build', () => {
    expect(crosswordShown({}, false)).toBe(false);
  });

  it('still shows the sample crossword where drafts may show (staging, previews, test builds)', () => {
    expect(crosswordShown({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'staging' }, false)).toBe(true);
    expect(crosswordShown({ CUEORY_ANATOMY_DRAFTS: '1' }, false)).toBe(true);
  });

  it('is open everywhere once the switch is on', () => {
    expect(crosswordShown({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' }, true)).toBe(true);
  });

  it('keeps the site.ts default off', () => {
    expect(typeof crosswordOpen).toBe('boolean');
    expect(crosswordShown({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' })).toBe(crosswordOpen);
  });
});
