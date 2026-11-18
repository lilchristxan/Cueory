import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { accountsBuildEnv, accountsGateOpen, accountsPreviewAllowed } from '../../src/config/accountsgate';
import { accountLaunch, accountsOpen } from '../../src/config/site';
import SignIn, { type SignInAuth } from '../../src/islands/SignIn.tsx';

const fakeAuth = {} as SignInAuth;

describe('accounts gate', () => {
  it('is closed today: accounts are not open to the public', () => {
    expect(accountsOpen).toBe(false);
    expect(accountsGateOpen(accountsOpen, {})).toBe(false);
  });

  it('never opens on the live site, whatever the variables say', () => {
    for (const branch of ['main', 'refs/heads/main', '', '  ', undefined]) {
      const env = { WORKERS_CI: '1', WORKERS_CI_BRANCH: branch, CUEORY_ACCOUNTS_PREVIEW: '1' };
      expect(accountsPreviewAllowed(env), String(branch)).toBe(false);
      expect(accountsGateOpen(false, env), String(branch)).toBe(false);
    }
  });

  it('opens on staging and preview builds so the staging sign-in test path keeps working', () => {
    expect(accountsGateOpen(false, { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'staging' })).toBe(true);
    expect(accountsGateOpen(false, { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'refs/heads/lane5/x' })).toBe(true);
  });

  it('opens a local or CI build only with the explicit test flag', () => {
    expect(accountsGateOpen(false, {})).toBe(false);
    expect(accountsGateOpen(false, { CUEORY_ACCOUNTS_PREVIEW: 'true' })).toBe(false);
    expect(accountsGateOpen(false, { CUEORY_ACCOUNTS_PREVIEW: '1' })).toBe(true);
  });

  it('is open everywhere once accounts open to the public', () => {
    expect(accountsGateOpen(true, { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' })).toBe(true);
  });

  it('reads only its own variables from the build environment', () => {
    expect(accountsBuildEnv({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'staging', CUEORY_ACCOUNTS_PREVIEW: '1', PUBLIC_SUPABASE_URL: 'x' }))
      .toEqual({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'staging', CUEORY_ACCOUNTS_PREVIEW: '1' });
  });
});

describe('the sign-in island behind the gate', () => {
  for (const mode of ['signin', 'signup'] as const) {
    it(`${mode}: closed shows "accounts open soon" and the launch-updates link, even with a client`, () => {
      const html = renderToString(createElement(SignIn, { mode, auth: fakeAuth, updatesHref: accountLaunch(false).accountHref }));
      expect(html).toContain('accounts open soon');
      expect(html).toContain('href="/#signup"');
      expect(html).not.toContain('<form');
    });

    it(`${mode}: open with a client shows the form`, () => {
      const html = renderToString(createElement(SignIn, { mode, auth: fakeAuth, accountsOn: true }));
      expect(html).toContain('<form');
      expect(html).not.toContain('accounts open soon');
    });
  }

  for (const page of ['src/pages/signin.astro', 'src/pages/signup.astro']) {
    it(`${page} passes the build-time gate to the island`, () => {
      const source = readFileSync(page, 'utf8');
      expect(source).toContain('accountsGateOpen(accountsOpen, accountsBuildEnv(process.env))');
      expect(source).toMatch(/<SignIn accountsOn=\{accountsOn\} updatesHref=\{updatesHref\}/);
      // The layout's account corner and flag button stay signed out too (they would otherwise load the client).
      expect(source).toMatch(/<Layout [^>]*accountsOff=\{!accountsOn\}>/);
    });
  }
});

describe('the layout passes the closed gate to the account corner and the flag button', () => {
  it('threads accountsOff from Layout to AccountCorner and FlagMount', () => {
    const layout = readFileSync('src/layouts/Layout.astro', 'utf8');
    expect(layout.match(/<SiteHeader [^>]*accountsOff=\{accountsOff\}/g)).toHaveLength(2);
    expect(layout).toMatch(/<SiteFooter [^>]*accountsOff=\{accountsOff\}/);
    expect(readFileSync('src/components/SiteHeader.astro', 'utf8')).toMatch(/<AccountCorner [^>]*accountsOff=\{accountsOff\}/);
    expect(readFileSync('src/components/SiteFooter.astro', 'utf8')).toContain('{...(accountsOff ? { accountsOff: true } : {})}');
    const corner = readFileSync('src/components/AccountCorner.astro', 'utf8');
    expect(corner).toContain("data-accounts-off={accountsOff ? '' : undefined}");
    expect(corner).toContain("if (corner.hasAttribute('data-accounts-off'))");
  });
});
