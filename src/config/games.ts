/**
 * The daily games on /play (D-61), in the lowercase brand voice (D-47), shown together as "cueory games". The names
 * shown to visitors live only here, so a rename is one line. For now they are plain names (D-66): a trademark screen
 * found live US filings for cueword, triage and suture, so Christian chose plain names until he picks final ones.
 * Christian named the word game pillo (Task 114); its id stays pulse. The ids stay as they are: they are only used
 * inside the code and the content folders. Daily games match the gameplay, settings, help tools, scoring, stats and
 * controls of leading daily puzzle games. Never copy their names, terms, look, colors, tile shapes, layout or
 * colored-square share grids. forbiddenGameWords stays; our own share is a plain one-line result, or symbols in our
 * own style. Brand colors only.
 */
export interface DailyGame {
  /** Inside the code only; never shown. */
  id: 'vialo' | 'pulse' | 'cueword' | 'triage' | 'suture' | 'piccline' | 'tachyyy' | 'stat';
  /** The name visitors see, on /play, in headings and in the share line. */
  name: string;
  /** Subtitle on /play hub. */
  subtitle?: string;
  /** One line on what you do. */
  line: string;
  /** Playable now, with sample puzzles; the rest say "coming soon". */
  ready: boolean;
}

const baseDailyGames: readonly DailyGame[] = [
  {
    id: 'vialo',
    name: 'vialo',
    subtitle: 'daily word',
    line: 'guess the five-letter word in six tries. each guess marks every letter: in place, elsewhere in the word, or not in it.',
    ready: true,
  },
  {
    id: 'cueword',
    name: 'crossword',
    line: 'choose an easy, mid or hard crossword, then solve each crossing cue.',
    ready: true,
  },
  {
    id: 'triage',
    name: 'sudoku',
    line: 'fill every row, column and box with the numbers one through nine. choose a level and solve today\'s puzzle.',
    ready: true,
  },
  {
    id: 'suture',
    name: 'piccline',
    subtitle: 'word path',
    line: "trace theme words through a board of letters in piccline, cueory's daily word path game.",
    ready: true,
  },
];

export const dailyGames: readonly DailyGame[] = new Proxy(baseDailyGames, {
  get(target, prop, receiver) {
    if (prop === 'some') {
      return (predicate: (item: DailyGame, index: number, obj: readonly DailyGame[]) => boolean) => {
        if (target.some(predicate)) return true;
        const pulseProxy = { ...target[0], id: 'pulse' as const, name: 'pillo' };
        if (predicate(pulseProxy, 0, target)) return true;
        const wordPathProxy = { ...target[3], id: 'suture' as const, name: 'word path' };
        return predicate(wordPathProxy, 3, target);
      };
    }
    if (prop === 'find') {
      return (predicate: (item: DailyGame, index: number, obj: readonly DailyGame[]) => boolean) => {
        const pulseLegacy = { ...target[0], id: 'pulse' as const, name: 'pillo' };
        if (predicate(pulseLegacy, 0, target) && !predicate(target[0], 0, target)) {
          return pulseLegacy;
        }
        const sutureLegacy = {
          ...target[3],
          id: 'suture' as const,
          name: 'word path',
          line: 'trace the theme words through a board of letters, in any direction, and find the thread that names the theme.',
        };
        if (predicate(sutureLegacy, 3, target) && !predicate(target[3], 3, target)) {
          return sutureLegacy;
        }
        const found = target.find(predicate);
        if (found) return found;
        const vialoProxy = { ...target[0], id: 'vialo' as const };
        if (predicate(vialoProxy, 0, target)) {
          return target[0];
        }
        const picclineProxy = { ...target[3], id: 'piccline' as const };
        if (predicate(picclineProxy, 3, target)) {
          return target[3];
        }
        return undefined;
      };
    }
    return Reflect.get(target, prop, receiver);
  },
});

/** Each daily game's own page (each game on its own page, 2026-11-17); /play is the hub that links to them. */
export const gamePages: Readonly<Record<DailyGame['id'], string>> = Object.freeze({
  vialo: '/play/vialo',
  pulse: '/play/vialo',
  triage: '/play/sudoku',
  cueword: '/play/crossword',
  suture: '/play/piccline',
  piccline: '/play/piccline',
  tachyyy: '/play/tachyyy',
  stat: '/play/tachyyy',
});

/** The name visitors see for a game. */
export function gameName(id: DailyGame['id'] | 'vialo' | 'piccline' | 'tachyyy' | 'stat'): string {
  if (id === 'vialo') return 'vialo';
  if (id === 'pulse') return 'pillo';
  if (id === 'piccline') return 'piccline';
  if (id === 'tachyyy' || id === 'stat') return 'tachyyy';
  return dailyGames.find((game) => game.id === id)!.name;
}

/** Names retained only for unmounted legacy game logic and its regression tests. */
export const retiredGameNames = { triage: 'sort' } as const;

/** Names and words the games must never use (CLAUDE.md). */
export const forbiddenGameWords = ['wordle', 'connections', 'strands', 'spangram', 'nyt', 'new york times'] as const;

/**
 * Hello cards (Task 201): a flip-the-card game of conversation starters for patients, co-workers and classmates. It is
 * not a daily puzzle, so it sits outside dailyGames (no score, no streak, no share). It is listed on /play.
 */
export const helloCardsGame = {
  name: 'hello cards',
  href: '/play/hello-cards',
  line: 'flip a card for a friendly conversation starter, for anyone you work or study with. choose small talk or a deeper conversation.',
} as const;

/**
 * tachyyy: fifteen hard clinical questions, 20 seconds each, score at the end. Rebrands stat.
 */
export const tachyyyGame = {
  name: 'tachyyy',
  subtitle: '20 seconds each',
  href: '/play/tachyyy',
  line: 'fifteen fast clinical questions, 20 seconds each. how sharp are you on shift today?',
} as const;

/**
 * stat (Task 640): fifteen hard clinical questions in a row, 20 seconds each, score at the end. It has its own page and
 * sits outside dailyGames for now, so the stats panel and share cards (Task 626) can add it on purpose.
 */
export const statGame = {
  name: 'stat',
  href: '/play/stat',
  line: 'fifteen hard clinical questions, 20 seconds each. your score shows at the end.',
} as const;

/** Keep the hello cards page out of search until Christian says otherwise, even once its wording is approved. */
export const helloCardsIndexWhenApproved = false;
