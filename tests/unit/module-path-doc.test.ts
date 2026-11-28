import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { markdownTable, simulate, SIMULATION_END, SIMULATION_START } from '../../scripts/simulate-module-path';

// The simulation numbers in the design doc come from the script (`--check` compares them exactly, with the pinned
// Node). This fast test keeps the quoted block honest between runs: same rows as the script, arithmetic that adds up.
const doc = readFileSync('docs/design/module-mastery-path.md', 'utf8');
const quoted = doc.slice(doc.indexOf(SIMULATION_START) + SIMULATION_START.length, doc.indexOf(SIMULATION_END));

describe('design doc simulation block', () => {
  it('is present and has exactly the rows the script prints', () => {
    expect(doc).toContain(SIMULATION_START);
    expect(doc).toContain(SIMULATION_END);
    const small = markdownTable([simulate('old', { students: 4, seed: 1, stepCap: 10 })]);
    const labels = small.split('\n').slice(2).map((row) => row.split(' | ')[0]!.replace(/^\| /, ''));
    expect(labels.length).toBeGreaterThan(15);
    for (const label of labels) expect(quoted).toContain(`| ${label} |`);
    expect(quoted).toContain('because the step cap was reached');
    expect(quoted).toContain('because no content remained');
    expect(quoted).toContain('Across seeds 13, 31, 67, 109, 173, 257, 383');
  });

  it('every quoted percentage matches its own count', () => {
    const matches = [...quoted.matchAll(/(\d+(?:\.\d)?)% \((\d+) of (\d+)\)/g)];
    expect(matches.length).toBeGreaterThan(30);
    for (const [, percent, n, of] of matches) {
      expect(Number(percent)).toBeCloseTo((Number(n) / Number(of)) * 100, 1);
    }
  });

  it('the prose figures agree with the table', () => {
    // The targets table quotes figures from the block: they must appear in it.
    for (const figure of ['60 of 77', '52 of 64', '5 of 65', '16 of 1332', '53 of 408']) expect(quoted).toContain(figure);
    expect(doc).toContain('60 of 77 (77.9%)');
    expect(doc).toContain('5 of 65 (7.7%)');
  });
});
