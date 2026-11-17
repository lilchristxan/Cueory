/**
 * Lane 10: CLAUDE.md rule 1 and SECURITY.md rule 1, "row-level security on every table, with explicit policies".
 * Replays every migration in supabase/migrations in file order and fails if a table in the public schema ends up
 * without RLS turned on or without at least one policy, if RLS is ever turned off, or if a public view skips the
 * caller's RLS (a view runs as its owner unless it is created with security_invoker).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type TableState = { rls: boolean; policies: Set<string>; file: string };
export type RlsReport = { tables: Map<string, TableState>; problems: string[] };

const ident = String.raw`(?:"[^"]+"|[A-Za-z_][\w$]*)`;
const qualified = String.raw`${ident}(?:\s*\.\s*${ident})?`;

/** Remove comments, the contents of quoted strings, and dollar-quoted bodies (function code). */
export function stripSql(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const rest = sql.slice(i);
    if (rest.startsWith('--')) {
      const end = sql.indexOf('\n', i);
      i = end < 0 ? sql.length : end;
      continue;
    }
    if (rest.startsWith('/*')) {
      const end = sql.indexOf('*/', i + 2);
      i = end < 0 ? sql.length : end + 2;
      out += ' ';
      continue;
    }
    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") break;
        else j++;
      }
      out += "''";
      i = j + 1;
      continue;
    }
    const tag = /^\$[A-Za-z_]*\$/.exec(rest);
    if (tag) {
      const end = sql.indexOf(tag[0], i + tag[0].length);
      i = end < 0 ? sql.length : end + tag[0].length;
      out += ' $body$ ';
      continue;
    }
    out += sql[i];
    i++;
  }
  return out;
}

/** "public.items", 'items' and '"public"."items"' all become "public.items". Unqualified names are public. */
export function tableName(raw: string): string {
  const parts = raw.split('.').map((part) => part.trim().replace(/^"|"$/g, '').toLowerCase());
  return parts.length === 1 ? `public.${parts[0]}` : `${parts[0]}.${parts[1]}`;
}

function bareName(raw: string): string {
  return raw.trim().replace(/^"|"$/g, '').toLowerCase();
}

/** Replay migrations (in the order given) and report every public table's final RLS and policy state. */
export function replayMigrations(files: { name: string; sql: string }[]): RlsReport {
  const tables = new Map<string, TableState>();
  const problems: string[] = [];
  const statement = new RegExp(
    [
      String.raw`create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(?<create>${qualified})`,
      String.raw`alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?<alter>${qualified})\s+(?<action>enable|disable|no\s+force|force)\s+row\s+level\s+security`,
      String.raw`alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?<renameFrom>${qualified})\s+rename\s+to\s+(?<renameTo>${ident})`,
      String.raw`alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?<moveFrom>${qualified})\s+set\s+schema\s+(?<moveTo>${ident})`,
      String.raw`drop\s+table\s+(?:if\s+exists\s+)?(?<drop>${qualified}(?:\s*,\s*${qualified})*)`,
      String.raw`create\s+policy\s+(?<policy>${ident})\s+on\s+(?<policyOn>${qualified})`,
      String.raw`drop\s+policy\s+(?:if\s+exists\s+)?(?<dropPolicy>${ident})\s+on\s+(?<dropPolicyOn>${qualified})`,
      String.raw`alter\s+policy\s+(?<renamePolicy>${ident})\s+on\s+(?<renamePolicyOn>${qualified})\s+rename\s+to\s+(?<renamePolicyTo>${ident})`,
      String.raw`create\s+(?:or\s+replace\s+)?(?:(?:temp|temporary|recursive)\s+)*(?<viewKind>materialized\s+view|view)\s+(?:if\s+not\s+exists\s+)?(?<view>${qualified})(?<viewRest>[^;]*)`,
    ].join('|'),
    'gi',
  );

  for (const { name, sql } of files) {
    for (const match of stripSql(sql).matchAll(statement)) {
      const g = match.groups!;
      if (g.create) {
        const table = tableName(g.create);
        if (table.startsWith('public.')) tables.set(table, { rls: false, policies: new Set(), file: name });
      } else if (g.alter) {
        const state = tables.get(tableName(g.alter));
        const action = g.action!.toLowerCase().replace(/\s+/g, ' ');
        if (action === 'disable' || action === 'no force') {
          problems.push(`${name}: ${tableName(g.alter)} turns row level security off (${action})`);
        }
        if (state && action === 'enable') state.rls = true;
        if (state && action === 'disable') state.rls = false;
      } else if (g.renameFrom) {
        const from = tableName(g.renameFrom);
        const state = tables.get(from);
        if (state) {
          tables.delete(from);
          tables.set(`${from.split('.')[0]}.${bareName(g.renameTo!)}`, state);
        }
      } else if (g.moveFrom) {
        const from = tableName(g.moveFrom);
        const to = `${bareName(g.moveTo!)}.${from.split('.')[1]}`;
        const state = tables.get(from) ?? null;
        tables.delete(from);
        if (to.startsWith('public.')) {
          // A table moved in from another schema is checked like a new one.
          tables.set(to, state ?? { rls: false, policies: new Set(), file: name });
        }
      } else if (g.drop) {
        for (const raw of g.drop.split(',')) tables.delete(tableName(raw));
      } else if (g.policy) {
        tables.get(tableName(g.policyOn!))?.policies.add(bareName(g.policy));
      } else if (g.dropPolicy) {
        tables.get(tableName(g.dropPolicyOn!))?.policies.delete(bareName(g.dropPolicy));
      } else if (g.renamePolicy) {
        const policies = tables.get(tableName(g.renamePolicyOn!))?.policies;
        if (policies?.delete(bareName(g.renamePolicy))) policies.add(bareName(g.renamePolicyTo!));
      } else if (g.view) {
        const view = tableName(g.view);
        if (!view.startsWith('public.')) continue;
        const kind = g.viewKind!.toLowerCase().replace(/\s+/g, ' ');
        if (kind === 'materialized view') {
          problems.push(`${name}: ${view} is a materialized view in public, which row level security cannot protect`);
        } else if (!/\bwith\s*\([^)]*security_invoker\s*(?:=\s*(?:true|on|1)\s*)?[,)]/i.test(g.viewRest ?? '')) {
          problems.push(`${name}: view ${view} needs with (security_invoker = true) so the caller's row level security applies`);
        }
      }
    }
  }

  for (const [table, state] of tables) {
    if (!state.rls) problems.push(`${table} (created in ${state.file}) has no "enable row level security"`);
    if (state.policies.size === 0) problems.push(`${table} (created in ${state.file}) has no policy`);
  }
  return { tables, problems };
}

describe('row-level security replay (fixtures)', () => {
  const run = (...sql: string[]) => replayMigrations(sql.map((text, i) => ({ name: `m${i}.sql`, sql: text })));
  const good = `create table public.notes (id int);
    alter table public.notes enable row level security;
    create policy "notes: read own" on public.notes for select using (true);`;

  it('accepts a table with RLS on and a policy, in one file or spread over several', () => {
    expect(run(good).problems).toEqual([]);
    expect(run('create table notes (id int);', 'alter table only notes enable row level security;',
      'create policy p on "public"."notes" for select using (true);').problems).toEqual([]);
  });

  it('refuses a table without RLS, without a policy, or with its only policy dropped', () => {
    expect(run('create table public.a (id int); create policy p on public.a using (true);').problems)
      .toEqual(['public.a (created in m0.sql) has no "enable row level security"']);
    expect(run('create table public.b (id int); alter table public.b enable row level security;').problems)
      .toEqual(['public.b (created in m0.sql) has no policy']);
    expect(run(good, 'drop policy if exists "notes: read own" on public.notes;').problems)
      .toEqual(['public.notes (created in m0.sql) has no policy']);
  });

  it('refuses turning RLS off later, even when it was on', () => {
    expect(run(good, 'alter table public.notes disable row level security;').problems).toHaveLength(2);
    expect(run(good, 'alter table public.notes no force row level security;').problems).toHaveLength(1);
  });

  it('ignores comments, quoted strings and function bodies, and other schemas', () => {
    expect(run(`-- create table public.c (id int);
      /* create table public.d (id int); */
      select 'create table public.e (id int)';
      create function f() returns void language plpgsql as $fn$ begin create table public.f (id int); end $fn$;
      create table app_private.g (id int);`).problems).toEqual([]);
  });

  it('follows renames, schema moves and drops', () => {
    expect(run(good, 'alter table public.notes rename to jottings;').tables.has('public.jottings')).toBe(true);
    expect(run('create table app_private.h (id int);', 'alter table app_private.h set schema public;').problems)
      .toHaveLength(2);
    expect(run('create table public.i (id int);', 'drop table if exists public.i;').problems).toEqual([]);
  });

  it('refuses a public view that runs as its owner, and any public materialized view', () => {
    expect(run('create view public.v as select 1;').problems).toHaveLength(1);
    expect(run('create or replace view public.v with (security_invoker = true) as select 1;').problems).toEqual([]);
    expect(run('create materialized view public.mv as select 1;').problems).toHaveLength(1);
  });
});

describe('supabase/migrations: row-level security on every public table', () => {
  const dir = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url));
  const files = readdirSync(dir).filter((file) => file.endsWith('.sql')).sort()
    .map((name) => ({ name, sql: readFileSync(join(dir, name), 'utf8') }));
  const report = replayMigrations(files);

  it('finds the tables (so a parser miss cannot pass silently)', () => {
    expect(files.length).toBeGreaterThan(0);
    for (const table of ['public.profiles', 'public.item_answers', 'public.flags', 'public.admins']) {
      expect([...report.tables.keys()]).toContain(table);
    }
  });

  it('has RLS on and at least one policy for every table, never turns RLS off, and has no owner-run views', () => {
    expect(report.problems).toEqual([]);
  });
});
