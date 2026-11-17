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
  id: 'pulse' | 'cueword' | 'triage' | 'suture';
  /** The name visitors see, on /play, in headings and in the share line. */
  name: string;
  /** One line on what you do. */
  line: string;
  /** Playable now, with sample puzzles; the rest say "coming soon". */
  ready: boolean;
}

export const dailyGames: readonly DailyGame[] = [
  {
    id: 'pulse',
    name: 'pillo',
    line: 'guess the five-letter word in six tries. each guess marks every letter: in place, elsewhere in the word, or not in it.',
    ready: true,
  },
  {
    id: 'cueword',
    name: 'crossword',
    line: 'choose an easy, mid or hard crossword, then solve each crossing clue.',
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
    name: 'word path',
    line: 'trace the theme words through a board of letters, in any direction, and find the thread that names the theme.',
    ready: true,
  },
];

/** The name visitors see for a game. */
export function gameName(id: DailyGame['id']): string {
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
