/**
 * Lane 10: CLAUDE.md rule 1 and SECURITY.md rule 2. A `security definer` function runs with its owner's rights, so:
 * - it must pin `set search_path = ''` (no object lookup through a schema a caller can write to), and
 * - PUBLIC and anon must lose EXECUTE on it. Postgres grants EXECUTE on every new function to PUBLIC, and the
 *   locked-by-default migration's `alter default privileges` only removes anon, authenticated and service_role, so each
 *   function needs its own `revoke execute ... from public, anon`.
 *
 * Replays supabase/migrations in order, keyed by signature (`create or replace` keeps a function's grants; a new
 * argument list is a new function). An exception needs a comment in the same migration:
 * `-- grant-exception: schema.name: <why>`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type Fn = { definer: boolean; file: string; publicRevoked: boolean; anonRevoked: boolean };
export type GrantReport = { functions: Map<string, Fn>; problems: string[] };

/** Remove comments and replace dollar-quoted bodies, keeping single-quoted strings (search_path = '' is one). */
function stripSql(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    if (sql.startsWith('--', i)) {
      const end = sql.indexOf('\n', i);
      i = end < 0 ? sql.length : end;
    } else if (sql.startsWith('/*', i)) {
      const end = sql.indexOf('*/', i + 2);
      i = end < 0 ? sql.length : end + 2;
      out += ' ';
    } else if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length && !(sql[j] === "'" && sql[j + 1] !== "'")) j += sql[j] === "'" ? 2 : 1;
      out += sql.slice(i, j + 1);
      i = j + 1;
    } else {
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i, i + 64));
      if (tag) {
        const end = sql.indexOf(tag[0], i + tag[0].length);
        i = end < 0 ? sql.length : end + tag[0].length;
        out += ' $body$ ';
      } else {
        out += sql[i];
        i++;
      }
    }
  }
  return out;
}

/** Split on top-level commas (types like numeric(10, 2) keep their comma). */
function splitTop(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else current += char;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

const typeStarts = new Set(['double', 'character', 'timestamp', 'time', 'bit', 'interval', 'national', 'varchar', 'char']);

/** "public.check_answer(item_id uuid, picked text[] default '{}')" → "public.check_answer(uuid,text[])". */
export function signature(name: string, args: string): string {
  const qualified = name.replace(/"/g, '').toLowerCase();
  const fullName = qualified.includes('.') ? qualified : `public.${qualified}`;
  const types = splitTop(args).flatMap((raw) => {
    let arg = raw.trim().toLowerCase().replace(/\s+(default\b|=).*$/s, '').trim();
    if (/^out\s/.test(arg)) return [];
    arg = arg.replace(/^(in|inout|variadic)\s+/, '');
    const words = arg.split(/\s+/);
    if (words.length > 1 && !typeStarts.has(words[0]!)) words.shift();
    return [words.join(' ').replace(/\s*\[\s*\]/g, '[]').replace(/"/g, '')];
  });
  return `${fullName}(${types.join(',')})`;
}

function roles(list: string): string[] {
  return list.split(',').map((role) => role.trim().replace(/"/g, '').toLowerCase());
}

/** Replay migrations (in the order given). */
export function replayGrants(files: { name: string; sql: string }[]): GrantReport {
  const functions = new Map<string, Fn>();
  const problems: string[] = [];
  const excepted = new Set<string>();
  const fnRef = String.raw`([\w."]+)\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)`;

  for (const { name, sql } of files) {
    for (const match of sql.matchAll(/--\s*grant-exception:\s*([\w."]+)\s*:\s*\S/gi)) {
      const raw = match[1]!.replace(/"/g, '').toLowerCase();
      excepted.add(raw.includes('.') ? raw : `public.${raw}`);
    }
    for (const raw of stripSql(sql).split(';')) {
      const statement = raw.trim().replace(/\s+/g, ' ');
      let m: RegExpExecArray | null;
      if ((m = new RegExp(String.raw`^create (or replace )?function ${fnRef}(.*)$`, 'i').exec(statement))) {
        const key = signature(m[2]!, m[3]!);
        const options = m[4]!.toLowerCase();
        const definer = /\bsecurity definer\b/.test(options);
        if (definer && !/\bset search_path (=|to) ''(?!\S)/.test(options)) {
          problems.push(`${name}: ${key} is security definer without set search_path = ''`);
        }
        const before = m[1] ? functions.get(key) : undefined;
        functions.set(key, {
          definer,
          file: name,
          publicRevoked: before?.publicRevoked ?? false,
          anonRevoked: before?.anonRevoked ?? false,
        });
      } else if ((m = new RegExp(String.raw`^drop function (?:if exists )?(.*?)(?: cascade| restrict)?$`, 'i').exec(statement))) {
        for (const ref of m[1]!.matchAll(new RegExp(fnRef, 'g'))) functions.delete(signature(ref[1]!, ref[2]!));
      } else if ((m = new RegExp(String.raw`^alter function ${fnRef}(.*)$`, 'i').exec(statement))) {
        const options = m[3]!.toLowerCase();
        if (/\bsecurity definer\b|\bsearch_path\b|\bowner to\b/.test(options)) {
          problems.push(`${name}: alter function ${signature(m[1]!, m[2]!)} changes definer, search_path or owner; restate the function instead`);
        }
      } else if ((m = new RegExp(String.raw`^revoke (?:execute|all(?: privileges)?) on function (.*) from (.*?)(?: cascade| restrict)?$`, 'i').exec(statement))) {
        const who = roles(m[2]!);
        for (const ref of m[1]!.matchAll(new RegExp(fnRef, 'g'))) {
          const fn = functions.get(signature(ref[1]!, ref[2]!));
          if (!fn) continue;
          if (who.includes('public')) fn.publicRevoked = true;
          if (who.includes('anon')) fn.anonRevoked = true;
        }
      } else if ((m = /^revoke (?:execute|all(?: privileges)?) on all functions in schema (.*?) from (.*?)(?: cascade| restrict)?$/i.exec(statement))) {
        const schemas = roles(m[1]!);
        const who = roles(m[2]!);
        for (const [key, fn] of functions) {
          if (!schemas.includes(key.split('.')[0]!)) continue;
          if (who.includes('public')) fn.publicRevoked = true;
          if (who.includes('anon')) fn.anonRevoked = true;
        }
      } else if ((m = new RegExp(String.raw`^grant (?:execute|all(?: privileges)?) on function (.*) to (.*?)(?: with grant option)?$`, 'i').exec(statement))) {
        const who = roles(m[2]!);
        for (const ref of m[1]!.matchAll(new RegExp(fnRef, 'g'))) {
          const fn = functions.get(signature(ref[1]!, ref[2]!));
          if (!fn) continue;
          if (who.includes('public')) fn.publicRevoked = false;
          if (who.includes('anon')) fn.anonRevoked = false;
        }
      } else if (/^grant (?:execute|all(?: privileges)?) on all functions in schema .* to (?:.*\b(?:public|anon)\b)/i.test(statement)) {
        problems.push(`${name}: grants every function in a schema to public or anon`);
      }
    }
  }

  for (const [key, fn] of functions) {
    if (!fn.definer || excepted.has(key.slice(0, key.indexOf('(')))) continue;
    const missing = [fn.publicRevoked ? '' : 'public', fn.anonRevoked ? '' : 'anon'].filter(Boolean);
    if (missing.length) problems.push(`${key} (security definer, ${fn.file}) is executable by ${missing.join(' and ')}`);
  }
  return { functions, problems };
}

describe('security definer grants replay (fixtures)', () => {
  const run = (...sql: string[]) => replayGrants(sql.map((text, i) => ({ name: `m${i}.sql`, sql: text })));
  const fn = (opts = "security definer set search_path = ''") =>
    `create function public.f(item_id uuid, picked text[] default '{}') returns int language sql ${opts} as $f$ select 1; $f$;`;
  const revoke = 'revoke execute on function public.f(uuid, text[]) from public, anon, authenticated;';

  it('reads signatures without argument names, modes or defaults', () => {
    expect(signature('public.f', "in item_id uuid, out total int, picked text [] default '{}'")).toBe('public.f(uuid,text[])');
    expect(signature('"public"."g"', 'double precision, at timestamp with time zone')).toBe('public.g(double precision,timestamp with time zone)');
  });

  it('accepts a definer with an empty search_path and execute revoked from public and anon', () => {
    expect(run(fn() + revoke + 'grant execute on function public.f(uuid, text[]) to authenticated;').problems).toEqual([]);
  });

  it('refuses a definer without search_path, or with a non-empty one', () => {
    expect(run(fn('security definer') + revoke).problems).toHaveLength(1);
    expect(run(fn("security definer set search_path = public") + revoke).problems).toHaveLength(1);
  });

  it('refuses a definer still executable by public or anon, or granted back to them', () => {
    expect(run(fn()).problems).toEqual(['public.f(uuid,text[]) (security definer, m0.sql) is executable by public and anon']);
    expect(run(fn() + 'revoke execute on function public.f(uuid, text[]) from anon;').problems)
      .toEqual(['public.f(uuid,text[]) (security definer, m0.sql) is executable by public']);
    expect(run(fn() + revoke, 'grant execute on function public.f(uuid, text[]) to anon;').problems).toHaveLength(1);
  });

  it('keeps grants across create or replace, but not for a new argument list', () => {
    expect(run(fn() + revoke, fn().replace('create function', 'create or replace function')).problems).toEqual([]);
    expect(run(fn() + revoke, "create function public.f(item_id uuid) returns int language sql security definer set search_path = '' as $f$ select 1 $f$;").problems)
      .toEqual(['public.f(uuid) (security definer, m1.sql) is executable by public and anon']);
  });

  it('ignores invoker functions and dropped functions, and allows a written exception', () => {
    expect(run(fn("set search_path = ''")).problems).toEqual([]);
    expect(run(fn(), 'drop function if exists public.f(uuid, text[]);').problems).toEqual([]);
    expect(run('-- grant-exception: public.f: called by anonymous visitors on purpose\n' + fn()).problems).toEqual([]);
  });

  it('refuses alter function that makes a function definer or changes its search_path', () => {
    expect(run(fn("set search_path = ''"), 'alter function public.f(uuid, text[]) security definer;').problems).toHaveLength(1);
  });
});

describe('supabase/migrations: every security definer function is locked down', () => {
  const dir = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url));
  const files = readdirSync(dir).filter((file) => file.endsWith('.sql')).sort()
    .map((name) => ({ name, sql: readFileSync(join(dir, name), 'utf8') }));
  const report = replayGrants(files);

  it('finds the definer functions (so a parser miss cannot pass silently)', () => {
    const definers = [...report.functions].filter(([, fn]) => fn.definer).map(([key]) => key);
    for (const key of ['public.check_answer(uuid,uuid,text[])', 'public.submit_flag(text,uuid,uuid,text,text)',
      'public.admin_list_flags(text,integer,timestamptz,uuid)', 'public.delete_my_account(uuid)', 'app_private.mfa_access_allowed()']) {
      expect(definers).toContain(key);
    }
  });

  it("pins search_path = '' and revokes execute from public and anon on each one", () => {
    expect(report.problems).toEqual([]);
  });
});
