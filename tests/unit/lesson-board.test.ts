import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSet } from '../../src/islands/labelit';
import { boardLabelSets, boardProblems, boardRows, parseBoard, wrongChoices, type LessonBoard } from '../../src/lessons/board';

const root = join(__dirname, '..', '..');
const sample = (): LessonBoard => JSON.parse(readFileSync(join(root, 'content', 'samples', 'templates', 'lesson-board.json'), 'utf8')) as LessonBoard;

describe('lesson board: one file from a teaching video becomes every way to study', () => {
  it('accepts the labeled sample', () => {
    expect(boardProblems(sample())).toEqual([]);
    expect(parseBoard(sample()).status).toBe('sample');
  });

  it('turns the picture into a label-it set that the label-it page already accepts', () => {
    const [set] = boardLabelSets(parseBoard(sample()));
    expect(parseSet(set).labels.map((label) => label.text)).toEqual(['roof', 'chimney', 'window', 'door']);
    // The sample board carries the same picture and covers as the label-it sample on the site.
    const live = JSON.parse(readFileSync(join(root, 'content', 'label-it', 'study-skills-01.json'), 'utf8'));
    expect(set!.image).toEqual(live.image);
    expect(set!.labels).toEqual(live.labels);
  });

  it('gives each picture its own set when a board has several', () => {
    const board = sample();
    const second = { ...board.pictures[0]!, id: 'second', labels: [{ id: 'gate', text: 'gate', x: 1, y: 1, w: 10, h: 5 }] };
    board.pictures.push(second);
    board.clauses.push({ id: 'c6', said: 'The gate opens.', label: 'gate' });
    expect(boardLabelSets(parseBoard(board)).map((set) => set.id)).toEqual(['sample-house-house', 'sample-house-second']);
  });

  it('turns only the clauses that teach a fact into study rows, with a fill-in sentence', () => {
    const rows = boardRows(parseBoard(sample()));
    expect(rows.map((row) => row.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(rows[0]).toEqual({ id: 'c1', question: 'What covers the top of the house?', answer: 'roof', sentence: 'The ___ covers the top of the house.' });
  });

  it('blanks whole words only and leaves the sentence out when the answer is not said', () => {
    const board = sample();
    board.clauses[0] = { id: 'c1', said: 'Roofing keeps rain out.', question: 'What keeps rain out?', answer: 'roof', label: 'roof' };
    expect(boardRows(board)[0]).toEqual({ id: 'c1', question: 'What keeps rain out?', answer: 'roof' });
  });

  it('borrows wrong choices from the same lesson and never repeats the right answer', () => {
    const rows = boardRows(parseBoard(sample()));
    expect(wrongChoices(rows, 'c1')).toEqual(['chimney', 'window', 'door']);
    expect(wrongChoices(rows, 'c4', 2)).toEqual(['roof', 'chimney']);
    expect(wrongChoices(rows, 'missing')).toEqual([]);
  });

  it('names every problem in plain words', () => {
    const board = sample() as unknown as Record<string, unknown> & LessonBoard;
    board.status = 'ready' as never;
    board.pictures[0]!.labels[0]!.w = 90;
    board.clauses[1] = { id: 'c2', said: 'Smoke leaves.', question: 'Where?' };
    const problems = boardProblems(board);
    expect(problems).toContain('board "sample-house" needs a status of sample, draft or approved');
    expect(problems).toContain('board "sample-house": label "roof" must sit inside the picture (percent values from 0 to 100)');
    expect(problems).toContain('board "sample-house": clause "c2" needs both a question and an answer, or neither');
    expect(problems).toContain('board "sample-house": label "chimney" is never written by a clause');
    expect(() => parseBoard(board)).toThrow();
  });
});
