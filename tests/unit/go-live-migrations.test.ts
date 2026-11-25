/**
 * docs/GO-LIVE.md section 1.5 is the list Christian follows to set up cueory-prod, one file at a time. It must name
 * every migration in supabase/migrations, in timestamp order, so a new file can never be left out of it (or an old one
 * listed twice) without this test failing. It reads files only: nothing here touches a database.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationsDir = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url));
const goLive = readFileSync(fileURLToPath(new URL('../../docs/GO-LIVE.md', import.meta.url)), 'utf8');

const onDisk = readdirSync(migrationsDir).filter(name => name.endsWith('.sql')).map(name => name.slice(0, -'.sql'.length)).sort();
const rows = [...goLive.matchAll(/^\| (\d+) \| `(\d{14}_[a-z0-9_]+)` \|/gm)].map(match => ({ number: Number(match[1]), name: match[2]! }));

describe('docs/GO-LIVE.md lists the repository migrations', () => {
  it('has a row for every migration file, in timestamp order, and no others', () => {
    expect(rows.map(row => row.name)).toEqual(onDisk);
  });

  it('numbers its rows 1, 2, 3 and so on', () => {
    expect(rows.map(row => row.number)).toEqual(rows.map((_, index) => index + 1));
  });

  it('states the same file count the repository has', () => {
    const stated = /There are (\d+) repository migration files/.exec(goLive);
    expect(stated, 'GO-LIVE.md no longer says how many repository migration files there are').not.toBeNull();
    expect(Number(stated![1])).toBe(onDisk.length);
  });

  it('keeps every migration file name in the form <14-digit version>_<name>.sql', () => {
    for (const name of onDisk) expect(name, name).toMatch(/^\d{14}_[a-z0-9_]+$/);
    expect(new Set(onDisk.map(name => name.slice(0, 14))).size).toBe(onDisk.length);
  });
});
