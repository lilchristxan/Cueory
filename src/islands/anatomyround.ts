/**
 * The anatomy lab's study round (Task 178, redesign part 3): "learn it" and "test it" over one group of structures.
 * Pure logic, unit tested (tests/unit/anatomyround.test.ts). Every name comes from the system's label file; an answer
 * is right only when its letters are the official name's letters (case, accents, spacing and punctuation ignored, as
 * in "name it"). Nothing here invents a name or an alias.
 *
 * The answer is typed into one cell per letter, grouped by word. "first letters" fills the first cell of each word,
 * "hint: next letter" fills the next empty cell, and either one counts as help: a question that used help, or that was
 * answered wrongly, shown or skipped, does not build the streak, and a missed name comes back once later in the round.
 */
import { normalizeSearch } from './anatomylab';

export type StudyMode = 'learn' | 'test';
export type StudyFeedback = null | 'right' | 'wrong' | 'shown';

export interface StudyRound {
  mode: StudyMode;
  /** Every structure in the round, in the order first asked. */
  ids: string[];
  /** Still to ask, the current one first. A missed name is added again, once, at the end. */
  queue: string[];
  /** Already settled this round, in order (a name that comes back is listed each time it settles). */
  done: string[];
  /** Names that already came back once, so a second miss does not loop forever. */
  requeued: string[];
  /** What fills the empty cells of the current answer, in order: the student's letters and the hints they asked for. */
  entries: Entry[];
  firstLetters: boolean;
  nearby: boolean;
  feedback: StudyFeedback;
  /** The current question used a hint, "show answer" or a wrong try: it cannot build the streak. */
  helped: boolean;
  /** The current question was answered wrongly at least once, so it comes back once even if it is then corrected. */
  wrongTry?: boolean;
  streak: number;
  rightFirstTime: number;
  /** Counts every question transition (start, next, skip, a name coming back), so the same name asked again is a new question. */
  seq: number;
}

/** A 'blank' keeps a hinted cell in place after the typed letter before it was taken back; the next letter fills it. */
export interface Entry { letter: string; from: 'typed' | 'hint' | 'blank' }

export interface StudyCell {
  letter: string;
  /** Where the letter came from: nothing yet, the first-letters switch, a hint, or the student. */
  from: 'empty' | 'first' | 'hint' | 'typed' | 'shown';
}

/** The official name as words of letters and digits: "left (right) lobe" gives ["left", "right", "lobe"]. */
export function nameWords(official: string): string[] {
  const text = normalizeSearch(official);
  return text === '' ? [] : text.split(' ');
}

export function startRound(mode: StudyMode, ids: readonly string[]): StudyRound {
  const unique = [...new Set(ids)];
  return {
    mode,
    ids: unique,
    queue: [...unique],
    done: [],
    requeued: [],
    entries: [],
    firstLetters: false,
    nearby: false,
    feedback: null,
    helped: false,
    streak: 0,
    rightFirstTime: 0,
    seq: 0,
  };
}

export const currentTarget = (round: StudyRound): string | null => round.queue[0] ?? null;
export const roundFinished = (round: StudyRound): boolean => round.queue.length === 0;

/** The cells of the current answer, one list of cells per word. */
export function answerCells(round: StudyRound, official: string): StudyCell[][] {
  const words = nameWords(official);
  const cells: StudyCell[][] = words.map((word) => [...word].map(() => ({ letter: '', from: 'empty' as StudyCell['from'] })));
  const shown = round.feedback === 'shown';
  const flat = cells.flat();
  let empty: StudyCell[] = flat;
  const letters = words.map((word) => [...word]);
  if (shown) {
    cells.forEach((word, w) => word.forEach((cell, i) => { cell.from = 'shown'; cell.letter = letters[w]![i]!; }));
    return cells;
  }
  if (round.firstLetters) {
    cells.forEach((word, w) => { if (word[0]) { word[0].from = 'first'; word[0].letter = letters[w]![0]!; } });
    empty = flat.filter((cell) => cell.from === 'empty');
  }
  empty.forEach((cell, index) => {
    const entry = round.entries[index];
    if (entry && entry.from !== 'blank') {
      cell.from = entry.from;
      cell.letter = entry.letter;
    }
  });
  return cells;
}

/**
 * The answer as a screen reader hears it: each word's cells in order, a letter where one is filled and "blank" where
 * not, with where a letter came from when it was given. Only cells already filled (typed, hinted, first letters, or
 * the shown answer) have a letter at all, so an unrevealed letter can never be in this text.
 */
export function describeAnswer(cells: readonly (readonly StudyCell[])[]): string {
  const given: Record<StudyCell['from'], string> = { empty: '', first: ' (first letter)', hint: ' (hint)', typed: '', shown: '' };
  return cells
    .map((word, index) => `word ${index + 1}: ${word.map((cell) => (cell.from === 'empty' ? 'blank' : `${cell.letter}${given[cell.from]}`)).join(', ')}`)
    .join('. ');
}

/** The letters of the official name, in order, as the cells hold them. */
const officialLetters = (official: string): string[] => [...nameWords(official).join('')];

/** The letters of the cells the student or a hint fills, in order (every cell except the first-letters ones). */
function openLetters(round: StudyRound, official: string): string[] {
  return nameWords(official).flatMap((word) => [...word].filter((_, index) => !(round.firstLetters && index === 0)));
}

/** How many cells are still empty. */
function room(round: StudyRound, official: string): number {
  return Math.max(0, openLetters(round, official).length - round.entries.filter((entry) => entry.from !== 'blank').length);
}

const isSettled = (round: StudyRound) => round.feedback === 'right' || round.feedback === 'shown';

/** Judges the answer once every cell is full: right only when the letters are the official ones. */
function judge(round: StudyRound, official: string): StudyRound {
  if (room(round, official) > 0) return { ...round, feedback: round.feedback === 'wrong' ? null : round.feedback };
  const cells = answerCells(round, official);
  const letters = officialLetters(official);
  const correct = cells.flat().every((cell, index) => cell.letter === letters[index]);
  if (correct) {
    const clean = !round.helped && !round.firstLetters && round.entries.every((entry) => entry.from === 'typed');
    return {
      ...round,
      feedback: 'right',
      streak: clean ? round.streak + 1 : round.streak,
      rightFirstTime: clean ? round.rightFirstTime + 1 : round.rightFirstTime,
    };
  }
  return { ...round, feedback: 'wrong', helped: true, wrongTry: true, streak: 0 };
}

/** Puts an entry in the first blank cell, or after the last one when none is blank. */
function fillNext(entries: Entry[], entry: Entry): Entry[] {
  const blank = entries.findIndex((item) => item.from === 'blank');
  return blank < 0 ? [...entries, entry] : entries.map((item, index) => (index === blank ? entry : item));
}

/** One letter (or digit) typed. Anything else, or a settled question, changes nothing. */
export function typeLetter(round: StudyRound, key: string, official: string): StudyRound {
  if (isSettled(round) || roundFinished(round)) return round;
  const letter = normalizeSearch(key);
  if (letter.length !== 1) return round;
  if (room(round, official) === 0) return round;
  return judge({ ...round, entries: fillNext(round.entries, { letter, from: 'typed' }) }, official);
}

/** Takes back the last letter the student typed. A letter a hint gave stays where it is, even after it. */
export function backspace(round: StudyRound, official: string): StudyRound {
  if (isSettled(round)) return round;
  let at = -1;
  round.entries.forEach((entry, index) => { if (entry.from === 'typed') at = index; });
  if (at < 0) return round;
  let entries = round.entries.map((entry, index) => (index === at ? { letter: '', from: 'blank' as const } : entry));
  while (entries.length > 0 && entries[entries.length - 1]!.from === 'blank') entries = entries.slice(0, -1);
  return judge({ ...round, entries }, official);
}

/** "hint: next letter": fills the next empty cell with the right letter. It counts as help. */
export function hintLetter(round: StudyRound, official: string): StudyRound {
  if (isSettled(round) || roundFinished(round) || round.mode !== 'test') return round;
  if (room(round, official) === 0) return round;
  // The cells that are not first letters, in order: the next one is where the hint goes.
  const open = openLetters(round, official);
  const blank = round.entries.findIndex((entry) => entry.from === 'blank');
  const letter = open[blank < 0 ? round.entries.length : blank];
  if (letter === undefined) return round;
  return judge({ ...round, entries: fillNext(round.entries, { letter, from: 'hint' }), helped: true, streak: 0 }, official);
}

function requeue(round: StudyRound, id: string): StudyRound {
  if (round.requeued.includes(id)) return round;
  return { ...round, queue: [...round.queue, id], requeued: [...round.requeued, id] };
}

/** "show answer": the name is shown, the question is missed, and it comes back once. */
export function showAnswer(round: StudyRound): StudyRound {
  const id = currentTarget(round);
  if (!id || isSettled(round)) return round;
  return requeue({ ...round, feedback: 'shown', helped: true, streak: 0 }, id);
}

/** Moves on to the next question. */
export function nextQuestion(round: StudyRound): StudyRound {
  const id = currentTarget(round);
  if (!id || !isSettled(round)) return round;
  // A name that was answered wrongly first (or needed help) before it came right comes back once, like a shown one.
  const missed = round.wrongTry && round.feedback === 'right' ? requeue(round, id) : round;
  return reset({ ...missed, queue: missed.queue.slice(1), done: [...missed.done, id] });
}

/** "skip": a missed name that comes back once, then the next question. */
export function skipQuestion(round: StudyRound): StudyRound {
  const id = currentTarget(round);
  if (!id) return round;
  const settled = isSettled(round);
  const missed = settled ? round : requeue({ ...round, streak: 0 }, id);
  return reset({ ...missed, queue: missed.queue.slice(1), done: settled ? [...missed.done, id] : missed.done });
}

function reset(round: StudyRound): StudyRound {
  return { ...round, entries: [], feedback: null, helped: false, wrongTry: false, seq: round.seq + 1 };
}

export function setFirstLetters(round: StudyRound, on: boolean): StudyRound {
  if (isSettled(round) || round.firstLetters === on) return round;
  // The cells move, so the answer so far starts again.
  return { ...round, firstLetters: on, entries: [], helped: round.helped || on, feedback: null };
}

export function setNearby(round: StudyRound, on: boolean): StudyRound {
  return round.nearby === on ? round : { ...round, nearby: on };
}

export type RowState = 'done' | 'now' | 'next' | 'later';

/** The round list: finished names are shown, the current one is "now" and the one after it "next"; the rest are hidden. */
export function roundRows(round: StudyRound): { id: string; state: RowState }[] {
  const finished = new Set(round.done);
  const current = currentTarget(round);
  const upcoming = round.queue.filter((id) => id !== current);
  return round.ids.map((id) => ({
    id,
    state: finished.has(id) && id !== current ? 'done' : id === current ? 'now' : id === upcoming[0] ? 'next' : 'later',
  }));
}

/** "03:07", from milliseconds. */
export function formatClock(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(total / 60);
  return `${String(minutes).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
