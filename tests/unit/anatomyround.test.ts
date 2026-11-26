import { describe, expect, it } from 'vitest';
import {
  answerCells, backspace, describeAnswer, currentTarget, formatClock, hintLetter, nameWords, nextQuestion, roundFinished, roundRows,
  setFirstLetters, setNearby, showAnswer, skipQuestion, startRound, typeLetter, type StudyRound,
} from '../../src/islands/anatomyround';

// Made-up names, not anatomy.
const NAMES: Record<string, string> = { A: 'test cube', B: 'test slab (two)', C: 'plain' };
const type = (round: StudyRound, text: string) => [...text].reduce((r, ch) => typeLetter(r, ch, NAMES[currentTarget(r)!]!), round);

describe('nameWords', () => {
  it('splits an official name into words of letters and digits', () => {
    expect(nameWords('Test  Slab (two)')).toEqual(['test', 'slab', 'two']);
    expect(nameWords('')).toEqual([]);
  });
});

describe('typing the answer', () => {
  it('is right when the letters match, ignoring case and spacing', () => {
    const round = type(startRound('test', ['A', 'B']), 'TESTcube');
    expect(round.feedback).toBe('right');
    expect(round.streak).toBe(1);
    expect(round.rightFirstTime).toBe(1);
  });
  it('is wrong when every cell is full but a letter is off, and does not build the streak', () => {
    const round = type(startRound('test', ['A']), 'testcubx');
    expect(round.feedback).toBe('wrong');
    expect(round.streak).toBe(0);
    // Backspace and fix it.
    const fixed = type(backspace(round, NAMES.A!), 'e');
    expect(fixed.feedback).toBe('right');
    expect(fixed.rightFirstTime).toBe(0);
  });
  it('ignores keys that are not letters or digits, and letters once every cell is full', () => {
    const round = startRound('test', ['C']);
    expect(typeLetter(round, '!', NAMES.C!)).toBe(round);
    expect(typeLetter(round, 'Enter', NAMES.C!)).toBe(round);
    const full = type(round, 'plain');
    expect(typeLetter(full, 'x', NAMES.C!)).toBe(full);
  });
  it('lays cells out by word, and an empty cell holds no letter', () => {
    const cells = answerCells(type(startRound('test', ['B']), 'tes'), NAMES.B!);
    expect(cells.map((w) => w.length)).toEqual([4, 4, 3]);
    expect(cells[0]!.map((c) => c.from)).toEqual(['typed', 'typed', 'typed', 'empty']);
    expect(cells.flat().filter((c) => c.from === 'empty').every((c) => c.letter === '')).toBe(true);
  });
});

describe('first letters and hints', () => {
  it('fill cells for the student and count as help', () => {
    const on = setFirstLetters(startRound('test', ['A']), true);
    expect(answerCells(on, NAMES.A!).map((w) => w[0]!.from)).toEqual(['first', 'first']);
    const done = type(on, 'estube');
    expect(done.feedback).toBe('right');
    expect(done.streak).toBe(0);
  });
  it('a hint fills the next empty cell after what is typed', () => {
    let round = type(startRound('test', ['A']), 'te');
    round = hintLetter(round, NAMES.A!);
    const cells = answerCells(round, NAMES.A!).flat();
    expect(cells.map((c) => c.from).slice(0, 4)).toEqual(['typed', 'typed', 'hint', 'empty']);
    expect(cells[2]!.letter).toBe('s');
    expect(round.streak).toBe(0);
  });
  it('a wrong letter typed before a hint can still be taken back, and the hinted cell stays', () => {
    let round = type(startRound('test', ['A']), 'x');
    round = hintLetter(round, NAMES.A!);
    const back = backspace(round, NAMES.A!);
    const cells = answerCells(back, NAMES.A!).flat();
    expect(cells.slice(0, 3).map((c) => c.from)).toEqual(['empty', 'hint', 'empty']);
    expect(cells[1]!.letter).toBe('e');
    // The next letter fills the emptied cell, not the one after the hint.
    const fixed = type(back, 't');
    expect(answerCells(fixed, NAMES.A!).flat().slice(0, 3).map((c) => c.letter)).toEqual(['t', 'e', '']);
    // And a hint asked while a cell is empty goes into that cell.
    const hinted = hintLetter(back, NAMES.A!);
    expect(answerCells(hinted, NAMES.A!).flat().slice(0, 2).map((c) => c.letter)).toEqual(['t', 'e']);
  });
  it('a full answer built round a hint is judged on every cell', () => {
    let round = type(startRound('test', ['A']), 'x');
    round = hintLetter(round, NAMES.A!);
    round = type(backspace(round, NAMES.A!), 'tstcube');
    expect(round.feedback).toBe('right');
  });
  it('a hint keeps the first letters in place, and a hint is test-only', () => {
    const on = setFirstLetters(startRound('test', ['A']), true);
    const hinted = hintLetter(on, NAMES.A!);
    expect(answerCells(hinted, NAMES.A!)[0]!.map((c) => c.letter).join('')).toBe('te' + '');
    const learn = startRound('learn', ['A']);
    expect(hintLetter(learn, NAMES.A!)).toBe(learn);
  });
  it('backspace never takes back a hint', () => {
    const round = hintLetter(startRound('test', ['A']), NAMES.A!);
    expect(backspace(round, NAMES.A!)).toBe(round);
  });
});

describe('missed names come back once', () => {
  it('skip sends the name to the end and asks the next one', () => {
    const round = skipQuestion(startRound('test', ['A', 'B', 'C']));
    expect(round.queue).toEqual(['B', 'C', 'A']);
    expect(round.requeued).toEqual(['A']);
    expect(round.streak).toBe(0);
  });
  it('a second miss does not send it round again', () => {
    let round = skipQuestion(startRound('test', ['A']));
    expect(round.queue).toEqual(['A']);
    round = skipQuestion(round);
    expect(round.queue).toEqual([]);
    expect(roundFinished(round)).toBe(true);
  });
  it('a name answered wrongly, then corrected, comes back once', () => {
    let round = type(startRound('test', ['A', 'B']), 'testcubx');
    round = type(backspace(round, NAMES.A!), 'e');
    expect(round.feedback).toBe('right');
    round = nextQuestion(round);
    expect(round.queue).toEqual(['B', 'A']);
    expect(round.requeued).toEqual(['A']);
    // Coming back, it is asked clean, and a second correct answer does not send it round again.
    round = nextQuestion(type(nextQuestion(type(round, 'testslabtwo')), 'testcube'));
    expect(roundFinished(round)).toBe(true);
  });
  it('a name answered right the first time does not come back', () => {
    const round = nextQuestion(type(startRound('test', ['A']), 'testcube'));
    expect(roundFinished(round)).toBe(true);
  });
  it('show answer settles the question as missed, and next moves on', () => {
    let round = showAnswer(startRound('test', ['A', 'B']));
    expect(round.feedback).toBe('shown');
    expect(answerCells(round, NAMES.A!).flat().every((c) => c.from === 'shown')).toBe(true);
    expect(round.queue).toEqual(['A', 'B', 'A']);
    round = nextQuestion(round);
    expect(currentTarget(round)).toBe('B');
    expect(round.done).toEqual(['A']);
  });
  it('next does nothing until the question is settled', () => {
    const round = startRound('test', ['A', 'B']);
    expect(nextQuestion(round)).toBe(round);
  });
});

describe('streak, rows and clock', () => {
  it('builds the streak on clean answers and a miss resets it', () => {
    let round = startRound('test', ['A', 'C', 'B']);
    round = nextQuestion(type(round, 'testcube'));
    round = nextQuestion(type(round, 'plain'));
    expect(round.streak).toBe(2);
    round = skipQuestion(round);
    expect(round.streak).toBe(0);
  });
  it('shows finished names, the current one and the next, and hides the rest', () => {
    let round = startRound('test', ['A', 'B', 'C']);
    expect(roundRows(round).map((r) => r.state)).toEqual(['now', 'next', 'later']);
    round = nextQuestion(type(round, 'testcube'));
    expect(roundRows(round).map((r) => r.state)).toEqual(['done', 'now', 'next']);
  });
  it('formats the clock as minutes and seconds', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(42_900)).toBe('00:42');
    expect(formatClock(187_000)).toBe('03:07');
    expect(formatClock(-5)).toBe('00:00');
  });
  it('turns show nearby on and off', () => {
    const round = startRound('test', ['A']);
    expect(setNearby(round, true).nearby).toBe(true);
    expect(setNearby(round, false)).toBe(round);
  });
});

describe('describeAnswer (what a screen reader hears of the cells)', () => {
  it('says blank for empty cells and marks given letters', () => {
    let round = type(startRound('test', ['A']), 'x');
    round = hintLetter(round, NAMES.A!);
    const heard = describeAnswer(answerCells(round, NAMES.A!));
    expect(heard).toBe('word 1: x, e (hint), blank, blank. word 2: blank, blank, blank, blank');
  });
  it('never contains an unrevealed letter, and first letters are marked', () => {
    const round = setFirstLetters(startRound('test', ['A']), true);
    const heard = describeAnswer(answerCells(round, NAMES.A!));
    expect(heard).toBe('word 1: t (first letter), blank, blank, blank. word 2: c (first letter), blank, blank, blank');
    expect(heard).not.toMatch(/\b[esu]\b/);
  });
  it('speaks the whole answer once it is shown', () => {
    const heard = describeAnswer(answerCells(showAnswer(startRound('test', ['C'])), NAMES.C!));
    expect(heard).toBe('word 1: p, l, a, i, n');
  });
});
