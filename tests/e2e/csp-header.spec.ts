import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { themeHeadScript } from '../../src/scripts/theme';

// Issue #746: `astro preview` doesn't read _headers, so this serves a built page with the exact Content-Security-Policy
// the build wrote into dist/_headers as a real HTTP header, then checks the theme script (which runs before Astro's
// <meta> policy) still applies a saved pick, with no policy violations. The theme is read when parsing ends
// (readyState "interactive"), before the footer's theme picker module runs and could set it a second way. A control
// without the theme hash proves the header, not the <meta>, is what governs that early script.
const headerLine = readFileSync(resolve('dist/_headers'), 'utf8')
  .split('\n')
  .find((line) => /^\s+Content-Security-Policy:/.test(line));
const headerPolicy = headerLine?.replace(/^\s+Content-Security-Policy:\s*/, '').trim() ?? '';
const themeHash = `'sha256-${createHash('sha256').update(themeHeadScript).digest('base64')}'`;

async function openWithHeader(page: Page, policy: string): Promise<{ violations: string[]; themeAtParse: string }> {
  await page.addInitScript(() => {
    const violations: string[] = [];
    Object.assign(window, { __cueoryCspViolations: violations, __cueoryThemeAtParse: 'unread' });
    document.addEventListener('readystatechange', () => {
      if (document.readyState === 'interactive') {
        Object.assign(window, { __cueoryThemeAtParse: document.documentElement.dataset.theme ?? 'none' });
      }
    });
    document.addEventListener('securitypolicyviolation', (event) => {
      violations.push(`${event.effectiveDirective}: ${event.blockedURI}`);
    });
    try { localStorage.setItem('cueory-theme', 'dark'); } catch { /* the test fails below if storage is blocked */ }
  });
  await page.route('**/privacy', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': policy } });
  });
  const response = await page.goto('/privacy');
  expect(response?.headers()['content-security-policy']).toBe(policy);
  await page.waitForLoadState('networkidle');
  return page.evaluate(() => {
    const w = window as Window & { __cueoryCspViolations?: string[]; __cueoryThemeAtParse?: string };
    return { violations: w.__cueoryCspViolations ?? [], themeAtParse: w.__cueoryThemeAtParse ?? 'unread' };
  });
}

test.describe('issue #746: the HTTP CSP header', () => {
  test('carries script-src with the theme hash', () => {
    expect(headerPolicy).toContain('script-src ');
    expect(headerPolicy).toContain(themeHash);
  });

  test('lets the theme script apply a saved pick, with no violations', async ({ page }) => {
    const { violations, themeAtParse } = await openWithHeader(page, headerPolicy);
    expect(themeAtParse).toBe('dark');
    expect(violations).toEqual([]);
  });

  test('blocks the theme script when its hash is missing from the header (control)', async ({ page }) => {
    const { violations, themeAtParse } = await openWithHeader(page, headerPolicy.replace(` ${themeHash}`, ''));
    expect(themeAtParse).toBe('none');
    expect(violations.some((v) => v.startsWith('script-src') && v.endsWith('inline'))).toBe(true);
  });
});
