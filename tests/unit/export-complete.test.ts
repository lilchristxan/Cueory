/**
 * Export completeness (lane 2): every table in supabase/migrations that holds a student's own rows must reach
 * download-my-data, with every column except the account id itself. A new user-owned table or column that the export
 * doesn't read fails here, so "export-my-data must work" (CLAUDE.md, privacy) can't silently fall behind the schema.
 *
 * "User-owned" means the table has a column that references auth.users or public.profiles. The export's reads are
 * recorded by running the real loadExport with a stand-in reader, so this checks what the code does, not a list.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadExport, type ExportReader } from '../../src/islands/exportload';

const dir = new URL('../../supabase/migrations/', import.meta.url);
const migrations = readdirSync(dir).filter(name => /^\d{14}_.+\.sql$/.test(name)).sort()
  .map(name => ({ name, sql: readFileSync(new URL(name, dir), 'utf8').replace(/--[^\n]*/g, '') }));

/** Splits on commas that are not inside parentheses. */
function topLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') depth -= 1;
    else if (text[i] === ',' && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map(part => part.trim()).filter(Boolean);
}

/** The text between the parenthesis at `open` and its match. */
function inside(text: string, open: number): string {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')' && --depth === 0) return text.slice(open + 1, i);
  }
  throw new Error('unbalanced parentheses in a migration');
}

const OWNER_REF = /references\s+(auth\.users|public\.profiles)\b/i;
const NOT_A_COLUMN = /^(constraint|primary\s+key|unique|check|foreign\s+key|exclude)\b/i;

interface Table { columns: string[]; owned: boolean }

/** Every public table after all migrations, with its columns and whether it holds a student's own rows. */
function schema(): Map<string, Table> {
  const tables = new Map<string, Table>();
  for (const { sql } of migrations) {
    for (const match of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_]+)\s*\(/gi)) {
      const body = inside(sql, match.index! + match[0].length - 1);
      const entries = topLevel(body);
      tables.set(match[1]!, {
        columns: entries.filter(entry => !NOT_A_COLUMN.test(entry)).map(entry => entry.split(/\s+/)[0]!),
        owned: entries.some(entry => OWNER_REF.test(entry)),
      });
    }
    // One alter table statement at a time (up to its semicolon); each comma-separated clause that adds a column counts.
    for (const match of sql.matchAll(/alter\s+table\s+(?:only\s+)?public\.([a-z_]+)\s([^;]*);/gi)) {
      const table = tables.get(match[1]!);
      if (!table) continue;
      for (const added of topLevel(match[2]!.trim())) {
        const column = /^add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_]+)/i.exec(added);
        if (!column) continue;
        table.columns.push(column[1]!);
        if (OWNER_REF.test(added)) table.owned = true;
      }
    }
    for (const match of sql.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?public\.([a-z_]+)/gi)) tables.delete(match[1]!);
  }
  return tables;
}

/** What loadExport reads: tables with their selected columns, and RPCs. */
async function exportReads() {
  const tables = new Map<string, string[]>();
  const rpcs = new Set<string>();
  const empty = { data: [], error: null };
  const reader: ExportReader = {
    select: (table, columns) => { tables.set(table, columns.split(',')); return Promise.resolve(empty); },
    async *selectPages(table, columns) { tables.set(table, columns.split(',')); yield empty; },
    rpc: (name) => { rpcs.add(name); return Promise.resolve(empty); },
    user: () => Promise.resolve({ data: { user: { created_at: '2026-11-01T08:00:00.000Z' } }, error: null }),
  };
  await loadExport(reader);
  return { tables, rpcs };
}

/** User-owned tables the browser can't read directly, and the permission-checked RPC that exports them. */
const THROUGH_RPC: Record<string, string> = {
  // flags also holds private moderation fields (status, handled_at), so students read their reports via my_flags().
  flags: 'my_flags',
};

/**
 * User-owned tables deliberately left out of the student's download, each with the reason. Adding to this list is a
 * privacy decision for Christian, not a way to make this test pass.
 */
const NOT_EXPORTED: Record<string, string> = {
  admins: 'the /admin access list: no website role can read it (Task 65), and the only admin is the founder',
};

/** Columns a direct read may leave out: the account id (it is the student's own, and the same on every row). */
const ACCOUNT_COLUMNS = new Set(['user_id']);
const PRIMARY_ACCOUNT_ID: Record<string, string> = { profiles: 'id' };

describe('download my data covers every user-owned table (lane 2)', () => {
  const tables = schema();
  const owned = [...tables].filter(([, table]) => table.owned).map(([name]) => name).sort();

  it('finds the user-owned tables in the migrations', () => {
    // A floor, not the list: the tables that existed when this test was written must still be found.
    for (const name of ['profiles', 'attempts', 'exam_plans', 'review_state', 'study_events', 'flags']) {
      expect(owned, `${name} should be detected as user-owned`).toContain(name);
    }
  });

  it('reads every user-owned table, directly or through its RPC, unless it is deliberately left out', async () => {
    const reads = await exportReads();
    const missing = owned.filter(name =>
      !reads.tables.has(name) && !(THROUGH_RPC[name] && reads.rpcs.has(THROUGH_RPC[name]!)) && !(name in NOT_EXPORTED));
    expect(missing, 'add these tables to export-my-data (src/islands/exportload.ts), or to NOT_EXPORTED with a reason').toEqual([]);
  });

  it('reads every column of each directly read table, apart from the account id', async () => {
    const reads = await exportReads();
    for (const [name, selected] of reads.tables) {
      const table = tables.get(name);
      expect(table, `${name} is read by the export but not created by any migration`).toBeDefined();
      const left = table!.columns.filter(column =>
        !selected.includes(column) && !ACCOUNT_COLUMNS.has(column) && PRIMARY_ACCOUNT_ID[name] !== column);
      expect(left, `export-my-data leaves out these ${name} columns`).toEqual([]);
    }
  });

  it('the exception lists only name tables that exist and are user-owned', () => {
    for (const name of [...Object.keys(THROUGH_RPC), ...Object.keys(NOT_EXPORTED)]) {
      expect(owned, `${name} is listed as an exception but is not a user-owned table`).toContain(name);
    }
  });

  it('notices a new user-owned table or column (the parser itself)', () => {
    const sql = `create table public.sample_notes (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users (id) on delete cascade,
      body text check (char_length(body) < 10),
      constraint sample_unique unique (user_id, id)
    );
    alter table public.sample_notes add column pinned boolean, add column color text;`;
    migrations.push({ name: '99999999999999_sample.sql', sql });
    try {
      const sample = schema().get('sample_notes');
      expect(sample).toEqual({ columns: ['id', 'user_id', 'body', 'pinned', 'color'], owned: true });
    } finally {
      migrations.pop();
    }
  });
});
