import { expect, test } from '@playwright/test';

/**
 * Diagnostic for the WebKit-only "style-src-attr: inline" findings (webkit run 44267813559) on /resources,
 * /learn/study-skills/fill-in and /preview/anatomy-lab. Those three are the only pages with a native <select>.
 * This probe puts one kind of element at a time on a page served with the site's real CSP (both parsed from HTML and
 * created from script, the way React does) and records which kinds raise a CSP violation in the running engine.
 * It reports instead of failing, so it never blocks a run; read the "csp-probe" annotations / the printed lines.
 * Only the probe's own page is touched: the site's CSP is never changed.
 */
const probes: Record<string, string> = {
  none: '<p>plain</p>',
  'control: inline style attribute (must report a violation everywhere)': '<p style="color:red">x</p>',
  select: '<select><option value="a">a</option><option value="b">b</option></select>',
  'select disabled': '<select disabled><option>a</option></select>',
  'select with class': '<select class="w-full border"><option>a</option></select>',
  fieldset: '<fieldset disabled><legend>l</legend><p>x</p></fieldset>',
  label: '<label>label <input type="text"></label>',
  'input text': '<input type="text" value="x">',
  table: '<table><caption>c</caption><tbody><tr><td>x</td></tr></tbody></table>',
  progress: '<progress value="1" max="2"></progress>',
  details: '<details><summary>s</summary>x</details>',
};

test.describe('csp element probe (diagnostic)', () => {
  for (const [name, html] of Object.entries(probes)) {
    test(`${name}`, async ({ page, baseURL }) => {
      const real = await page.request.get(`${baseURL}/support`);
      // The built pages carry the policy in a <meta http-equiv> (the preview server sends no _headers).
      const metaPolicy = /<meta http-equiv="content-security-policy" content="([^"]+)"/i.exec(await real.text())?.[1] ?? '';
      const csp = real.headers()['content-security-policy'] ?? metaPolicy.replaceAll('&#39;', "'").replaceAll('&amp;', '&');
      expect(csp, 'the probe needs the real CSP').toBeTruthy();
      await page.route('**/__csp-probe**', (route) =>
        route.fulfill({
          contentType: 'text/html',
          headers: { 'content-security-policy': csp },
          body: `<!doctype html><html><head><meta charset="utf-8"><title>probe</title></head><body><div id="parsed">${html}</div><div id="made"></div></body></html>`,
        }));
      await page.addInitScript(() => {
        const found: string[] = [];
        Object.assign(window, { __probeViolations: found });
        document.addEventListener('securitypolicyviolation', (event) => {
          found.push(`${event.effectiveDirective} at ${event.sourceFile || 'document'}:${event.lineNumber}`);
        });
      });
      await page.goto('/__csp-probe');
      const parsed = await page.evaluate(() => (window as unknown as { __probeViolations: string[] }).__probeViolations.slice());
      await page.evaluate((markup) => {
        const host = document.getElementById('made')!;
        const template = document.createElement('div');
        template.innerHTML = markup;
        for (const node of Array.from(template.children)) host.append(node);
      }, html);
      await page.waitForTimeout(200);
      const all = await page.evaluate(() => (window as unknown as { __probeViolations: string[] }).__probeViolations.slice());
      const line = `csp-probe ${test.info().project.name} | ${name} | parsed: ${parsed.join('; ') || 'none'} | script-made: ${all.slice(parsed.length).join('; ') || 'none'}`;
      console.log(line);
      test.info().annotations.push({ type: 'csp-probe', description: line });
      // Reports only. The real pages' own CSP assertions are in csp-sweep.spec.ts and console-clean.spec.ts.
      expect(Array.isArray(all)).toBe(true);
    });
  }
});
