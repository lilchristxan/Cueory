/**
 * Batch importer parser (Roadmap Task 2). Reads a passed.csv allowlist and the original items.csv / key.csv and
 * returns validated item rows ready for the database, or plain-language problems for every row that can't be
 * imported. Pure functions only: no files, no network, so every rule is unit-testable.
 *
 * Batch format: docs/BATCHES.md.
 */
import { CsvError, parseCsv } from '../check-batch/csv.ts';

const LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;
type Letter = (typeof LETTERS)[number];

export type ItemType = 'single' | 'sata';

export interface Choice {
  letter: Letter;
  text: string;
  rationale: string;
}

export interface ImportedItem {
  id: string;
  concept_id: string;
  type: ItemType;
  stem: string;
  choices: Choice[];
  /** Correct letters in sorted order. One letter for single-answer; one or more for sata. */
  key: Letter[];
  rationale: string;
  source_ids: string[];
  version: 1;
}

export interface ParseResult {
  items: ImportedItem[];
  problems: string[];
}

/** Splits a `;`-separated list cell into trimmed, non-empty strings. */
function splitList(cell: string | undefined): string[] {
  return (cell ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/** Resolves the type cell to 'single' or 'sata', or returns null for an unrecognised value. */
function resolveType(cell: string | undefined): ItemType | null {
  const v = (cell ?? '').trim().toLowerCase();
  if (v === '' || v === 'single') return 'single';
  if (v === 'sata') return 'sata';
  return null;
}

/**
 * Parses a passed.csv allowlist and the source items.csv / key.csv into ready-to-import rows.
 *
 * - Every id in `passedCsv` must be found in both `itemsCsv` and `keyCsv`; a missing or partial row is
 *   reported by id, never guessed.
 * - Without a second argument the function imports nothing and reports that the item files are needed.
 */
export function parsePassed(
  passedCsv: string,
  batch?: { itemsCsv: string; keyCsv: string },
): ParseResult {
  if (!batch) {
    return {
      items: [],
      problems: [
        'items.csv and key.csv are needed to import items; call parsePassed with a second argument ' +
          'containing { itemsCsv, keyCsv } as text.',
      ],
    };
  }

  const problems: string[] = [];

  // ── Parse the three CSV files ──────────────────────────────────────────────

  let passedRows: ReturnType<typeof parseCsv>;
  try {
    passedRows = parseCsv(passedCsv, ['item_id', 'concept_id']);
  } catch (err) {
    return {
      items: [],
      problems: [`passed.csv: ${err instanceof CsvError ? err.message : String(err)}`],
    };
  }

  let itemRows: ReturnType<typeof parseCsv>;
  try {
    itemRows = parseCsv(batch.itemsCsv, ['item_id', 'stem', 'choice_a', 'choice_b', 'choice_c', 'choice_d', 'rationale', 'source_ids']);
  } catch (err) {
    return {
      items: [],
      problems: [`items.csv: ${err instanceof CsvError ? err.message : String(err)}`],
    };
  }

  let keyRows: ReturnType<typeof parseCsv>;
  try {
    keyRows = parseCsv(batch.keyCsv, ['item_id', 'answer']);
  } catch (err) {
    return {
      items: [],
      problems: [`key.csv: ${err instanceof CsvError ? err.message : String(err)}`],
    };
  }

  // ── Index items and key by item_id ─────────────────────────────────────────

  const itemsById = new Map(itemRows.map((r) => [r['item_id'] ?? '', r]));
  const keyById = new Map(keyRows.map((r) => [r['item_id'] ?? '', r['answer'] ?? '']));

  // ── Process each passed id ─────────────────────────────────────────────────

  const imported: ImportedItem[] = [];

  for (const passedRow of passedRows) {
    const id = passedRow['item_id'] ?? '';
    const itemProblems: string[] = [];

    const itemRow = itemsById.get(id);
    if (!itemRow) {
      problems.push(`item "${id}": not found in items.csv`);
      continue;
    }

    if (!keyById.has(id)) {
      problems.push(`item "${id}": not found in key.csv`);
      continue;
    }
    const keyAnswer = keyById.get(id)!;

    // concept_id: prefer items.csv value; fall back to passed.csv (both are checked)
    const concept_id = (itemRow['concept_id'] ?? passedRow['concept_id'] ?? '').trim();
    if (concept_id === '') itemProblems.push('concept_id is empty');

    const stem = (itemRow['stem'] ?? '').trim();
    if (stem === '') itemProblems.push('stem is empty');

    const rationale = (itemRow['rationale'] ?? '').trim();
    if (rationale === '') itemProblems.push('rationale is empty');

    const source_ids = splitList(itemRow['source_ids']);
    if (source_ids.length === 0) itemProblems.push('source_ids is empty');

    const type = resolveType(itemRow['type']);
    if (type === null) {
      itemProblems.push(`type "${itemRow['type'] ?? ''}" must be "single" or "sata" (blank means single)`);
    }

    // ── Choices ──────────────────────────────────────────────────────────────

    const choiceLetters: Letter[] = LETTERS.filter((l) => l !== 'E' || (itemRow[`choice_e`] ?? '') !== '');
    const choices: Choice[] = [];
    const seenTexts = new Map<string, Letter>();

    for (const l of choiceLetters) {
      const text = (itemRow[`choice_${l.toLowerCase()}`] ?? '').trim();
      const ratl = (itemRow[`rationale_${l.toLowerCase()}`] ?? '').trim();

      if (text === '') {
        itemProblems.push(`choice ${l} is empty`);
        continue;
      }

      const normalized = text.toLowerCase().replace(/\s+/g, ' ');
      const twin = seenTexts.get(normalized);
      if (twin) {
        itemProblems.push(`choices ${twin} and ${l} are the same`);
      } else {
        seenTexts.set(normalized, l);
      }

      if (ratl === '') {
        itemProblems.push(`choice ${l} has no rationale (rationale_${l.toLowerCase()})`);
      }

      choices.push({ letter: l, text, rationale: ratl });
    }

    // ── Key validation ────────────────────────────────────────────────────────

    let key: Letter[] = [];

    if (keyAnswer.trim() === '') {
      itemProblems.push('key answer is empty');
    } else if (type === 'sata') {
      const parts = keyAnswer
        .split(';')
        .map((p) => p.trim().toUpperCase())
        .filter((p) => p !== '');
      if (parts.length === 0) {
        itemProblems.push('select-all-that-apply key is empty');
      } else {
        for (const p of parts) {
          if (!(LETTERS as readonly string[]).includes(p)) {
            itemProblems.push(`key letter "${p}" is not A–E`);
          } else if (!choiceLetters.includes(p as Letter)) {
            itemProblems.push(`key letter "${p}" is not among this item's choices`);
          }
        }
        if (new Set(parts).size !== parts.length) {
          itemProblems.push('key names a choice letter more than once');
        }
        if (itemProblems.length === 0) {
          key = [...(parts as Letter[])].sort();
        }
      }
    } else {
      // single-answer
      const letter = keyAnswer.trim().toUpperCase();
      if (!(LETTERS as readonly string[]).includes(letter)) {
        itemProblems.push(`key answer "${letter}" is not A–E`);
      } else if (!choiceLetters.includes(letter as Letter)) {
        itemProblems.push(`key answer "${letter}" is not among this item's choices`);
      } else {
        key = [letter as Letter];
      }
    }

    if (itemProblems.length > 0) {
      for (const p of itemProblems) problems.push(`item "${id}": ${p}`);
      continue;
    }

    imported.push({
      id,
      concept_id,
      type: type!,
      stem,
      choices,
      key,
      rationale,
      source_ids,
      version: 1,
    });
  }

  return { items: imported, problems };
}
