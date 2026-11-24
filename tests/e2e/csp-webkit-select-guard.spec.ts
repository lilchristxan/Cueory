import { expect, test } from '@playwright/test';
import { withoutWebkitSelectReports } from './csp-allow';

/**
 * Guard for the WebKit <select> exception (csp-allow.ts, #862): it must never hide a real inline style. The probe's
 * control (a style attribute) is put on a page with and without a <select>, under the site's real CSP; the filtered
 * reports must still be non-empty in every engine. (In WebKit the select's own report is set aside, and the control's
 * is one more than the number of selects, so it stays.)
 */
for (const [name, body] of [
  ['an inline style attribute alone', '<p style="color:red">x</p>'],
  ['an inline style attribute beside a select', '<select><option>a</option></select><p style="color:red">x</p>'],
] as const) {
  test(`the exception still reports ${name}`, async ({ page, baseURL }) => {
    const real = await page.request.get(`${baseURL}/support`);
    const meta = /<meta http-equiv="content-security-policy" content="([^"]+)"/i.exec(await real.text())?.[1] ?? '';
    const csp = meta.replaceAll('&#39;', "'").replaceAll('&amp;', '&');
    expect(csp, 'the guard needs the real CSP').toBeTruthy();
    await page.route('**/__csp-guard**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        headers: { 'content-security-policy': csp },
        body: `<!doctype html><html><head><meta charset="utf-8"><title>guard</title></head><body>${body}</body></html>`,
      }));
    await page.addInitScript(() => {
      const found: string[] = [];
      Object.assign(window, { __guardViolations: found });
      document.addEventListener('securitypolicyviolation', (event) => {
        found.push(`${event.effectiveDirective}: ${event.blockedURI} at ${event.sourceFile}:${event.lineNumber}`);
      });
    });
    await page.goto('/__csp-guard');
    await page.waitForTimeout(200);
    const events = await page.evaluate(() => (window as unknown as { __guardViolations: string[] }).__guardViolations.slice());
    expect(events.length, 'the control must be reported by the engine').toBeGreaterThan(0);
    expect((await withoutWebkitSelectReports(page, [], events)).length).toBeGreaterThan(0);
  });
}

test('a console-only stylesheet line is never set aside, with or without a select', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/support`);
  const line = "Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive of the Content Security Policy.";
  // No structured event was recorded for it, so the exception has nothing to qualify.
  expect(await withoutWebkitSelectReports(page, [line], [])).toEqual([line]);
});
