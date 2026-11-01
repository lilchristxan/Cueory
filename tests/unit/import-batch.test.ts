import { describe, expect, it } from 'vitest';
import { parsePassed, type ImportedItem } from '../../scripts/import-batch/parse';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Builds a minimal valid items.csv text with one single-answer item (labeled sample). */
function makeItemsCsv({
  item_id = 'sample-001',
  concept_id = 'sample-concept-a',
  stem = 'sample: A patient asks about fluid intake. What is the priority action?',
  choice_a = 'sample: Assess intake and output',
  choice_b = 'sample: Restrict fluids immediately',
  choice_c = 'sample: Document and report to the physician',
  choice_d = 'sample: Increase fluid intake',
  rationale_a = 'sample: Assessing intake and output is the first step in evaluation.',
  rationale_b = 'sample: Restriction without assessment is premature.',
  rationale_c = 'sample: Documentation alone does not address the clinical need first.',
  rationale_d = 'sample: Increasing fluids without assessment may cause harm.',
  rationale = 'sample: Assessment always precedes intervention.',
  source_ids = 's-001',
  type = '',
} = {}): string {
  const header = 'item_id,concept_id,stem,choice_a,choice_b,choice_c,choice_d,rationale_a,rationale_b,rationale_c,rationale_d,rationale,source_ids,type';
  const row = [item_id, concept_id, stem, choice_a, choice_b, choice_c, choice_d, rationale_a, rationale_b, rationale_c, rationale_d, rationale, source_ids, type]
    .map((v) => (v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replaceAll('"', '""')}"` : v))
    .join(',');
  return `${header}\n${row}\n`;
}

/** Builds a minimal valid items.csv with one SATA item (labeled sample). */
function makeSataItemsCsv({
  item_id = 'sample-sata-001',
  concept_id = 'sample-concept-b',
} = {}): string {
  return [
    'item_id,concept_id,stem,choice_a,choice_b,choice_c,choice_d,rationale_a,rationale_b,rationale_c,rationale_d,rationale,source_ids,type',
    [
      item_id,
      concept_id,
      'sample: Which actions are correct when documenting medication?',
      'sample: Sign your name after each entry',
      'sample: Use approved abbreviations',
      'sample: Leave blank lines between entries',
      'sample: Record the time of administration',
      'sample: Signing identifies the nurse responsible.',
      'sample: Approved abbreviations reduce misinterpretation.',
      'sample: Blank lines may allow someone to add false entries.',
      'sample: Recording time is required for accuracy.',
      'sample: Accurate documentation protects the patient and nurse.',
      's-002',
      'sata',
    ].join(','),
  ].join('\n') + '\n';
}

function makeKeyCsv(item_id = 'sample-001', answer = 'A'): string {
  return `item_id,answer\n${item_id},${answer}\n`;
}

function makePassedCsv(item_id = 'sample-001', concept_id = 'sample-concept-a'): string {
  return `item_id,concept_id\n${item_id},${concept_id}\n`;
}

// ── No second argument ────────────────────────────────────────────────────────

describe('parsePassed with no second argument', () => {
  it('imports nothing and reports that item files are needed', () => {
    const result = parsePassed('item_id,concept_id\nsample-001,sample-concept-a\n');
    expect(result.items).toHaveLength(0);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain('items.csv and key.csv are needed');
  });
});

// ── Happy path (single-answer) ─────────────────────────────────────────────

describe('parsePassed with a valid single-answer item', () => {
  const result = parsePassed(
    makePassedCsv(),
    { itemsCsv: makeItemsCsv(), keyCsv: makeKeyCsv() },
  );

  it('returns the item with no problems', () => {
    expect(result.problems).toHaveLength(0);
    expect(result.items).toHaveLength(1);
  });

  it('returns the correct id and concept_id', () => {
    expect(result.items[0]!.id).toBe('sample-001');
    expect(result.items[0]!.concept_id).toBe('sample-concept-a');
  });

  it('returns type "single"', () => {
    expect(result.items[0]!.type).toBe('single');
  });

  it('returns key as a one-element array', () => {
    expect(result.items[0]!.key).toEqual(['A']);
  });

  it('returns four choices each with a non-empty rationale', () => {
    const item = result.items[0]!;
    expect(item.choices).toHaveLength(4);
    for (const c of item.choices) {
      expect(c.text).not.toBe('');
      expect(c.rationale).not.toBe('');
    }
  });

  it('pins version to 1', () => {
    expect(result.items[0]!.version).toBe(1);
  });
});

// ── Happy path (SATA) ──────────────────────────────────────────────────────

describe('parsePassed with a valid SATA item', () => {
  const result = parsePassed(
    makePassedCsv('sample-sata-001', 'sample-concept-b'),
    {
      itemsCsv: makeSataItemsCsv(),
      keyCsv: makeKeyCsv('sample-sata-001', 'A;B;D'),
    },
  );

  it('returns the item with no problems', () => {
    expect(result.problems).toHaveLength(0);
    expect(result.items).toHaveLength(1);
  });

  it('returns type "sata"', () => {
    expect(result.items[0]!.type).toBe('sata');
  });

  it('returns key as sorted letters', () => {
    expect(result.items[0]!.key).toEqual(['A', 'B', 'D']);
  });
});

// ── Quoted commas and newlines in cells ───────────────────────────────────────

describe('quoted cells with commas and embedded newlines', () => {
  it('parses a stem containing a comma', () => {
    const stem = 'sample: A patient has low BP, tachycardia. What is priority?';
    const result = parsePassed(
      makePassedCsv(),
      { itemsCsv: makeItemsCsv({ stem }), keyCsv: makeKeyCsv() },
    );
    expect(result.problems).toHaveLength(0);
    expect(result.items[0]!.stem).toBe(stem);
  });

  it('parses a choice containing an embedded newline', () => {
    const choice_a = 'sample: Assess the patient\nand document findings';
    const result = parsePassed(
      makePassedCsv(),
      { itemsCsv: makeItemsCsv({ choice_a }), keyCsv: makeKeyCsv() },
    );
    expect(result.problems).toHaveLength(0);
    expect(result.items[0]!.choices[0]!.text).toBe(choice_a);
  });
});

// ── Refusals ──────────────────────────────────────────────────────────────────

describe('refusals', () => {
  it('refuses a row not found in items.csv', () => {
    const passed = 'item_id,concept_id\nsample-missing,sample-concept-a\n';
    const result = parsePassed(passed, { itemsCsv: makeItemsCsv(), keyCsv: makeKeyCsv() });
    expect(result.items).toHaveLength(0);
    expect(result.problems.some((p) => p.includes('sample-missing') && p.includes('items.csv'))).toBe(true);
  });

  it('refuses a row not found in key.csv', () => {
    const result = parsePassed(
      makePassedCsv(),
      { itemsCsv: makeItemsCsv(), keyCsv: 'item_id,answer\nsample-other,A\n' },
    );
    expect(result.items).toHaveLength(0);
    expect(result.problems.some((p) => p.includes('sample-001') && p.includes('key.csv'))).toBe(true);
  });

  it('refuses when the key answer is not among the choices', () => {
    const result = parsePassed(
      makePassedCsv(),
      { itemsCsv: makeItemsCsv(), keyCsv: makeKeyCsv('sample-001', 'E') },
    );
    expect(result.items).toHaveLength(0);
    expect(result.problems.some((p) => p.includes('"E"') && p.includes('not among'))).toBe(true);
  });

  it('refuses when the sata key is empty', () => {
    const result = parsePassed(
      makePassedCsv('sample-sata-001', 'sample-concept-b'),
      {
        itemsCsv: makeSataItemsCsv(),
        keyCsv: makeKeyCsv('sample-sata-001', ''),
      },
    );
    expect(result.items).toHaveLength(0);
    expect(result.problems.some((p) => p.includes('sample-sata-001') && p.includes('empty'))).toBe(true);
  });

  it('refuses when two choices have the same text', () => {
    const sameText = 'sample: Assess the patient first';
    const result = parsePassed(
      makePassedCsv(),
      {
        itemsCsv: makeItemsCsv({ choice_a: sameText, choice_b: sameText }),
        keyCsv: makeKeyCsv(),
      },
    );
    expect(result.items).toHaveLength(0);
    expect(result.problems.some((p) => p.includes('same'))).toBe(true);
  });

  it('refuses when a choice has no rationale', () => {
    const result = parsePassed(
      makePassedCsv(),
      {
        itemsCsv: makeItemsCsv({ rationale_b: '' }),
        keyCsv: makeKeyCsv(),
      },
    );
    expect(result.items).toHaveLength(0);
    expect(result.problems.some((p) => p.includes('choice B') && p.includes('rationale'))).toBe(true);
  });

  it('refuses when the stem is empty', () => {
    const result = parsePassed(
      makePassedCsv(),
      { itemsCsv: makeItemsCsv({ stem: '' }), keyCsv: makeKeyCsv() },
    );
    expect(result.items).toHaveLength(0);
    expect(result.problems.some((p) => p.includes('stem'))).toBe(true);
  });

  it('refuses when the main rationale is empty', () => {
    const result = parsePassed(
      makePassedCsv(),
      { itemsCsv: makeItemsCsv({ rationale: '' }), keyCsv: makeKeyCsv() },
    );
    expect(result.items).toHaveLength(0);
    expect(result.problems.some((p) => p.includes('rationale is empty'))).toBe(true);
  });

  it('refuses when source_ids is empty', () => {
    const result = parsePassed(
      makePassedCsv(),
      { itemsCsv: makeItemsCsv({ source_ids: '' }), keyCsv: makeKeyCsv() },
    );
    expect(result.items).toHaveLength(0);
    expect(result.problems.some((p) => p.includes('source_ids'))).toBe(true);
  });

  it('reports a malformed passed.csv as a problem', () => {
    const result = parsePassed('"unclosed', { itemsCsv: makeItemsCsv(), keyCsv: makeKeyCsv() });
    expect(result.items).toHaveLength(0);
    expect(result.problems.some((p) => p.includes('passed.csv'))).toBe(true);
  });

  it('reports a malformed items.csv as a problem', () => {
    const result = parsePassed(makePassedCsv(), { itemsCsv: '"unclosed', keyCsv: makeKeyCsv() });
    expect(result.items).toHaveLength(0);
    expect(result.problems.some((p) => p.includes('items.csv'))).toBe(true);
  });

  it('reports a malformed key.csv as a problem', () => {
    const result = parsePassed(makePassedCsv(), { itemsCsv: makeItemsCsv(), keyCsv: '"unclosed' });
    expect(result.items).toHaveLength(0);
    expect(result.problems.some((p) => p.includes('key.csv'))).toBe(true);
  });
});

// ── Multiple items: passes good, reports problems for bad ────────────────────

describe('multiple items in one batch', () => {
  it('imports passing items and collects problems for failing ones', () => {
    const passedCsv =
      'item_id,concept_id\n' +
      'sample-001,sample-concept-a\n' +
      'sample-bad,sample-concept-a\n';

    const itemsCsvGoodAndBad =
      'item_id,concept_id,stem,choice_a,choice_b,choice_c,choice_d,rationale_a,rationale_b,rationale_c,rationale_d,rationale,source_ids,type\n' +
      'sample-001,sample-concept-a,sample: What is priority?,sample: Assess,sample: Act,sample: Delegate,sample: Document,sample: ra,sample: rb,sample: rc,sample: rd,sample: Assess first.,s-001,\n' +
      'sample-bad,sample-concept-a,sample: Stem for bad item,sample: A,sample: B,sample: C,sample: D,sample: ra,sample: rb,sample: rc,sample: rd,,s-001,\n'; // rationale empty

    const keyCsv = 'item_id,answer\nsample-001,A\nsample-bad,A\n';

    const result = parsePassed(passedCsv, { itemsCsv: itemsCsvGoodAndBad, keyCsv });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe('sample-001');
    expect(result.problems.some((p) => p.includes('sample-bad'))).toBe(true);
  });
});
