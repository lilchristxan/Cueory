import { expect, test, type Page } from '@playwright/test';
import { dailySudokuSeed, generateSudoku } from '../../src/islands/sudoku';
import { markPanelsSeen } from './clock';

// Game sounds (task-games-v2/game-sounds). The browser's AudioContext is replaced with a counter that makes no noise:
// `starts` counts scheduled oscillators and `contexts` counts audio contexts made. Every game must stay silent until a
// real tap or key press, schedule a cue for a real move after it, and stay completely silent with the shared
// "game sounds" switch off (then not even an audio context is made).

const daily = generateSudoku(dailySudokuSeed('2026-11-01', 'easy'), 'easy');
const firstOpen = daily.puzzle.findIndex((digit) => digit === 0);

test.use({ timezoneId: 'America/Phoenix' });

type Audio = { contexts: number; starts: number };
const audio = (page: Page) => page.evaluate(() => (window as unknown as { audio: Audio }).audio);

async function setUp(page: Page, sound: boolean) {
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00-07:00'));
  await markPanelsSeen(page);
  await page.addInitScript((on) => {
    try {
      if (!on) localStorage.setItem('cueory-game-settings', JSON.stringify({ highContrast: false, motion: 'device', sound: false }));
    } catch { /* optional storage */ }
    const counted = { contexts: 0, starts: 0 };
    (window as unknown as { audio: Audio }).audio = counted;
    (window as unknown as { AudioContext: unknown }).AudioContext = class {
      state = 'running'; currentTime = 0; destination = {};
      constructor() { counted.contexts += 1; }
      resume() { return Promise.resolve(); }
      createGain() { return { connect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } }; }
      createOscillator() { return { type: '', frequency: { value: 0 }, connect() {}, start() { counted.starts += 1; }, stop() {} }; }
    };
  }, sound);
}

const games: { name: string; path: string; ready: (page: Page) => Promise<void>; move: (page: Page) => Promise<void> }[] = [
  {
    name: 'vialo', path: '/play/wordpill',
    ready: (page) => expect(page.getByTestId('vialo')).toBeVisible(),
    move: (page) => page.getByTestId('vialo').getByRole('group', { name: 'letters' }).getByRole('button', { name: 'q', exact: true }).click(),
  },
  {
    name: 'sudoku', path: '/play/sudoku',
    ready: (page) => expect(page.getByTestId('sudoku').getByRole('grid', { name: 'sudoku grid' }).getByRole('gridcell')).toHaveCount(81),
    move: async (page) => {
      await page.getByTestId('sudoku').getByRole('grid', { name: 'sudoku grid' }).getByRole('gridcell').nth(firstOpen).click();
      await page.keyboard.press('5');
    },
  },
  {
    name: 'crossword', path: '/play/crossword',
    ready: (page) => expect(page.getByTestId('cueword')).toBeVisible(),
    move: async (page) => {
      await page.getByTestId('cueword').getByRole('button', { name: /^(?:\d+, )?row 1, column 2,/ }).click();
      await page.keyboard.type('a');
    },
  },
  {
    name: 'piccline', path: '/play/piccline',
    ready: (page) => expect(page.getByTestId('suture')).toBeVisible(),
    move: (page) => page.getByTestId('suture').locator('button[data-cell="0,0"]').click(),
  },
  {
    name: 'tachyyy', path: '/play/tachyyy',
    ready: (page) => expect(page.getByTestId('stat-start')).toBeVisible(),
    move: async (page) => {
      await page.getByTestId('stat-start').click();
      await page.getByTestId('stat-choice-a').click();
    },
  },
  {
    name: 'hello cards', path: '/play/hello-cards',
    ready: (page) => expect(page.getByTestId('hello-card')).toBeEnabled(),
    move: (page) => page.getByTestId('hello-card').click(),
  },
];

for (const game of games) {
  test(`${game.name}: silent before a tap, then a real move schedules a sound cue`, async ({ page }) => {
    await setUp(page, true);
    await page.goto(game.path);
    await game.ready(page);
    expect(await audio(page)).toEqual({ contexts: 0, starts: 0 });
    await game.move(page);
    await expect.poll(async () => (await audio(page)).starts).toBeGreaterThan(0);
    expect((await audio(page)).contexts).toBe(1);
  });

  test(`${game.name}: with game sounds off nothing is scheduled and no audio context is made`, async ({ page }) => {
    await setUp(page, false);
    await page.goto(game.path);
    await game.ready(page);
    await game.move(page);
    await page.waitForTimeout(200);
    expect(await audio(page)).toEqual({ contexts: 0, starts: 0 });
  });
}
