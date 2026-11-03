import { describe, expect, it } from 'vitest';
import { BASE_CONNECT_SRC, connectSrc } from '../../src/islands/supabasecsp';

const VALID_KEY = 'sb_publishable_example_not_a_real_key';

describe('supabasecsp', () => {
  it('exports the fixed baseline policy', () => {
    expect(BASE_CONNECT_SRC).toBe("connect-src 'self' https://cloudflareinsights.com");
  });

  it('returns only the baseline when account settings are absent', () => {
    expect(connectSrc({})).toBe(BASE_CONNECT_SRC);
  });

  it('adds the normalized hosted project origin for valid settings', () => {
    expect(connectSrc({
      PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co/',
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: VALID_KEY,
    })).toBe(`${BASE_CONNECT_SRC} https://abcdefghijklmnopqrst.supabase.co`);
  });

  it('adds the local project origin for valid development settings', () => {
    expect(connectSrc({
      PUBLIC_SUPABASE_URL: 'http://localhost:54321/',
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: VALID_KEY,
    })).toBe(`${BASE_CONNECT_SRc} http://localhost:54321`);
  });

  it('does not add an origin when the settings are invalid', () => {
    expect(connectSrc({
      PU@LIC_SUPABASE_URL: 'https://evil.example.com',
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: VALID_KEY,
    })).toBe(BASE_CONNECT_SRC);
    expect(connectSrc({
      PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_not_for_public_use',
    })).toBe(BASE_CONNECT_SRC);
  });
});
