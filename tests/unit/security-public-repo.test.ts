/**
 * Lane 10: the repository is public (D-75), so no secret may ever be committed (CLAUDE.md rule 1, SECURITY.md rule 3).
 * gitleaks in CI and GitHub's push protection are the main defence; this test fails earlier, in `npm test`, on
 * high-confidence secret shapes in every tracked file, and on tracked env or key files. Failures name the file, line
 * and kind of secret but never print the value, so a real secret does not reach test logs.
 *
 * The content side of the public-repo rule (only labelled samples in /content) is already guarded by
 * public-content-safety.test.ts and sample-content-safety.test.ts.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const patterns: { kind: string; pattern: RegExp }[] = [
  { kind: 'private key block', pattern: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY(?: BLOCK)?-----/ },
  { kind: 'Supabase secret key', pattern: /\bsb_secret_[A-Za-z0-9_-]{20,}/ },
  { kind: 'JSON web token', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { kind: 'GitHub token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})/ },
  { kind: 'AWS access key', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { kind: 'Stripe live key', pattern: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}/ },
  { kind: 'Slack token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { kind: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { kind: 'Google OAuth client secret', pattern: /\bGOCSPX-[A-Za-z0-9_-]{20,}/ },
  { kind: 'Resend API key', pattern: /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/ },
  { kind: 'Postgres URL with a password', pattern: /\bpostgres(?:ql)?:\/\/[^\s:/@'"`]+:[^\s@'"`<>{}$]{6,}@/ },
];

/**
 * Exact made-up values the unit tests use to prove the app refuses a secret key in a public setting. Add a value here
 * only when it is obviously fake (letters in order, "example"), never to silence a real finding.
 */
const knownFakes = new Set(['sb_secret_abcdefghijklmnopqrstuvwxyz']);

/** Return "line N: kind" for every secret-shaped value in the text. Never returns the value itself. */
export function findSecrets(text: string): string[] {
  const findings: string[] = [];
  text.split('\n').forEach((line, index) => {
    for (const { kind, pattern } of patterns) {
      const global = new RegExp(pattern.source, 'g');
      for (const match of line.matchAll(global)) {
        if (!knownFakes.has(match[0])) findings.push(`line ${index + 1}: ${kind}`);
      }
    }
  });
  return findings;
}

/** Tracked files that should never be in a public repository at all, whatever they contain. */
export function forbiddenFile(path: string): boolean {
  const name = path.split('/').pop()!.toLowerCase();
  if (/^\.env(\..+)?$/.test(name) && !/^\.env\.(example|sample|template)$/.test(name)) return true;
  if (/^\.dev\.vars(\..+)?$/.test(name) && !name.endsWith('.example')) return true;
  if (/^id_(rsa|dsa|ecdsa|ed25519)$/.test(name)) return true;
  return /\.(pem|p12|pfx|key|keystore|jks)$/.test(name);
}

describe('secret finder (fixtures)', () => {
  // Fixtures are assembled at runtime so this file never contains a whole secret-shaped value itself.
  const join2 = (...parts: string[]) => parts.join('');
  it.each([
    ['private key block', join2('-----BEGIN ', 'PRIVATE KEY-----')],
    ['private key block', join2('-----BEGIN RSA ', 'PRIVATE KEY-----')],
    ['Supabase secret key', join2('sb_', 'secret_', 'Q7mZp2Lx9Rt4Wv8Nk3Hs6Yd1')],
    ['JSON web token', join2('eyJ', 'hbGciOiJIUzI1NiJ9', '.eyJ', 'yb2xlIjoic2VydmljZSJ9', '.', 'c2lnbmF0dXJlLWhlcmU')],
    ['GitHub token', join2('gh', 'p_', 'A'.repeat(36))],
    ['AWS access key', join2('AKIA', 'ABCDEFGHIJKLMNOP')],
    ['Google OAuth client secret', join2('GOCSPX-', 'a1B2c3D4e5F6g7H8i9J0k1L2')],
    ['Resend API key', join2('re_', 'Ab12Cd34', '_', 'Ef56Gh78Ij90Kl12Mn34')],
    ['Postgres URL with a password', join2('postgresql://', 'postgres:', 'hunter2hunter', '@db.example.co:5432/postgres')],
  ])('finds a %s and does not echo it', (kind, value) => {
    const findings = findSecrets(`first line\nconst value = '${value}';`);
    expect(findings).toEqual([`line 2: ${kind}`]);
    expect(findings.join()).not.toContain(value);
  });

  it('leaves public keys, placeholders and the listed made-up fixture alone', () => {
    expect(findSecrets([
      "PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example_not_a_real_key'",
      "SUPABASE_SECRET_KEY=<from the Supabase dashboard>",
      'postgresql://postgres:${PGPASSWORD}@localhost:54322/postgres',
      'postgresql://postgres@localhost:54322/postgres',
      "PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abcdefghijklmnopqrstuvwxyz'",
    ].join('\n'))).toEqual([]);
  });

  it('refuses env and key files but allows their examples', () => {
    for (const path of ['.env', 'app/.env.local', '.dev.vars', 'certs/server.pem', 'id_ed25519', 'x/signing.key']) {
      expect(forbiddenFile(path), path).toBe(true);
    }
    for (const path of ['.env.example', '.dev.vars.example', 'src/keyboard.ts', 'docs/KEYS.md']) {
      expect(forbiddenFile(path), path).toBe(false);
    }
  });
});

describe('tracked files hold no secrets', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0').filter(Boolean);

  it('lists the tracked files (so an empty list cannot pass silently)', () => {
    expect(tracked.length).toBeGreaterThan(100);
    expect(tracked).toContain('SECURITY.md');
  });

  it('tracks no env, private-key or certificate-store file', () => {
    expect(tracked.filter(forbiddenFile)).toEqual([]);
  });

  it('has no secret-shaped value in any tracked text file', () => {
    const findings: string[] = [];
    for (const path of tracked) {
      let bytes: Buffer;
      try {
        bytes = readFileSync(join(root, path));
      } catch {
        continue; // deleted in the working tree but not yet staged
      }
      if (bytes.subarray(0, 8000).includes(0)) continue; // binary (images, fonts, models)
      for (const finding of findSecrets(bytes.toString('utf8'))) findings.push(`${path} ${finding}`);
    }
    expect(findings).toEqual([]);
  });
});
