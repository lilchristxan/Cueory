import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Status notes (AGENTS.md "Process"): every pull request adds one file `docs/status/in-review/<branch-with-dashes>.md`
 * with exactly one `status:` line and at most one `decision:` line. Lowercase keys, no headings, nothing else. The
 * director's docs batch copies the lines into docs/STATUS.md and docs/DECISIONS.md, so the note must be machine-readable.
 * Each failure names the file and line so a contributor can fix it in one go.
 */

const notesDir = resolve(process.cwd(), 'docs/status/in-review');
const decisionsFile = resolve(process.cwd(), 'docs/DECISIONS.md');

const noteName = /^[a-z0-9][a-z0-9.-]*\.md$/;
const statusLine = /^status: \S/;
const decisionLine = /^decision: (?:D-pending \(Task \d+\)|D-\d+)(?:\s|$)/;
const anyKey = /^[A-Za-z][A-Za-z-]*\s*:/;

/** Files in the notes folder that are documentation, not notes. */
const notNotes = new Set(['README.md']);

export function checkNote(file: string, text: string): string[] {
  const problems: string[] = [];
  if (!noteName.test(file)) {
    problems.push(`${file}: file name must match ${noteName} (branch name with "/" replaced by "-", lowercase)`);
  }
  const lines = text.split(/\r?\n/);
  const nonEmpty = lines.map((line, i) => ({ line, n: i + 1 })).filter(({ line }) => line.trim() !== '');
  if (nonEmpty.length === 0) {
    problems.push(`${file}: empty note; needs one "status: ..." line`);
    return problems;
  }
  const first = nonEmpty[0];
  if (!statusLine.test(first.line)) {
    problems.push(`${file}:${first.n}: first line must start with "status: " (lowercase, then a space and the text)`);
  }
  let statusCount = 0;
  let decisionCount = 0;
  for (const { line, n } of nonEmpty) {
    if (line.startsWith('#')) {
      problems.push(`${file}:${n}: no Markdown headings in a status note`);
      continue;
    }
    if (statusLine.test(line)) {
      statusCount += 1;
      if (statusCount > 1) problems.push(`${file}:${n}: second "status:" line; a note has exactly one`);
      continue;
    }
    if (line.startsWith('decision: ')) {
      decisionCount += 1;
      if (decisionCount > 1) problems.push(`${file}:${n}: second "decision:" line; a note has at most one`);
      if (!decisionLine.test(line)) {
        problems.push(
          `${file}:${n}: decision line must start "decision: D-pending (Task N) ..." or "decision: D-<number> ..."`,
        );
      }
      continue;
    }
    if (anyKey.test(line)) {
      const key = line.slice(0, line.indexOf(':')).trim();
      problems.push(
        `${file}:${n}: unknown key "${key}:"; only lowercase "status:" and "decision:" are allowed (not "STATUS:", "D-pending:", "Status :" or similar)`,
      );
      continue;
    }
    problems.push(`${file}:${n}: unexpected line; a note holds only the "status:" line and an optional "decision:" line`);
  }
  if (statusCount === 0) problems.push(`${file}: missing "status: ..." line`);
  return problems;
}

export function duplicateDecisionNumbers(markdown: string): string[] {
  const seen = new Map<string, number>();
  const problems: string[] = [];
  markdown.split(/\r?\n/).forEach((line, i) => {
    const match = /^- \*\*D-(\d+)\*\*/.exec(line);
    if (!match) return;
    const id = `D-${Number(match[1])}`; // D-01 and D-1 are the same decision number
    const firstLine = seen.get(id);
    if (firstLine !== undefined) {
      problems.push(`docs/DECISIONS.md:${i + 1}: ${id} is already defined on line ${firstLine}; use the next free number`);
    } else {
      seen.set(id, i + 1);
    }
  });
  return problems;
}

describe('status notes in docs/status/in-review', () => {
  const files = readdirSync(notesDir).filter((file) => !notNotes.has(file));

  it('follow the AGENTS.md format (one status: line, at most one decision: line, nothing else)', () => {
    const problems = files.flatMap((file) => checkNote(file, readFileSync(resolve(notesDir, file), 'utf8')));
    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('reports each formatting mistake with file and line', () => {
    const bad = ['# Task 1', 'STATUS: done', 'decision: pending', 'D-pending: thing', 'status: again', 'extra prose'].join(
      '\n',
    );
    const problems = checkNote('Task_1.md', bad);
    expect(problems).toEqual([
      expect.stringContaining('Task_1.md: file name must match'),
      expect.stringContaining('Task_1.md:1: first line must start with "status: "'),
      expect.stringContaining('Task_1.md:1: no Markdown headings'),
      expect.stringContaining('Task_1.md:2: unknown key "STATUS:"'),
      expect.stringContaining('Task_1.md:3: decision line must start'),
      expect.stringContaining('Task_1.md:4: unknown key "D-pending:"'),
      expect.stringContaining('Task_1.md:6: unexpected line'),
    ]);
    expect(checkNote('task-1-ok.md', 'status: Task 1, done.\ndecision: D-pending (Task 1) Keep it.\n')).toEqual([]);
    expect(checkNote('task-2-ok.md', '\nstatus: Task 2, done.\ndecision: D-77 Already numbered.\n')).toEqual([]);
    expect(checkNote('task-3.md', 'status: a\nstatus: b')).toEqual([expect.stringContaining('task-3.md:2: second "status:"')]);
    expect(checkNote('task-4.md', '')).toEqual([expect.stringContaining('task-4.md: empty note')]);
  });
});

describe('docs/DECISIONS.md', () => {
  it('defines each decision number once', () => {
    const problems = duplicateDecisionNumbers(readFileSync(decisionsFile, 'utf8'));
    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('names the duplicate and both lines', () => {
    expect(duplicateDecisionNumbers('- **D-1** a\n- **D-2** b\n- **D-1** c\n')).toEqual([
      'docs/DECISIONS.md:3: D-1 is already defined on line 1; use the next free number',
    ]);
  });

  it('treats a zero-padded number as the same decision', () => {
    expect(duplicateDecisionNumbers('- **D-01** a\n- **D-1** b\n')).toEqual([
      'docs/DECISIONS.md:2: D-1 is already defined on line 1; use the next free number',
    ]);
  });
});
