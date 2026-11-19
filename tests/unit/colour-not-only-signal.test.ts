import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (name: string) => readFileSync(resolve('src/islands', `${name}.tsx`), 'utf8');

/** Each game island must pair its right/wrong/found colour state with a text, symbol or shape cue. */
const cues: Array<[string, RegExp, string]> = [
  ['SudokuGame', /sudoku-wrong-mark/, 'a wrong number carries a mark'],
  ['TriageGame', /✓/, 'a right place shows a tick'],
  ['OrganizerBoard', /✓ right/, 'a locked item says right'],
  ['MatchingBoard', /Matched/, 'a matched item says Matched'],
  ['MatchingBoard', /selected/, 'a picked item says selected'],
  ['FillInBoard', /resultMessage/, 'an answered item says right or wrong in words'],
  ['LabelItBoard', /markWords\[value\]/, 'marks are words on the buttons'],
  ['SuturePathBoard', /theme-word symbol|diamond/, 'found answers carry a symbol'],
  ['SutureGame', /\(found\)/, 'a found word is announced and struck through'],
  ['PulseGame', /guessInWords/, 'each guess is described in words'],
  ['PulseGame', /pillo-legend/, 'the marks have a legend'],
];

describe('colour is never the only signal in game islands', () => {
  it.each(cues)('%s: %s', (name, pattern) => {
    expect(source(name)).toMatch(pattern);
  });

  it('a found cell in the Suture letter grid is underlined, not only filled', () => {
    expect(source('SutureGame')).toMatch(/'bg-soft underline[^']*'/);
  });
});
