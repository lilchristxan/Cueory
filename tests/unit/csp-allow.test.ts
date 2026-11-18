import { describe, expect, it } from 'vitest';
import { dropWebkitSelectReports } from '../../tests/e2e/csp-allow';

const attr = 'style-src-attr: inline at http://localhost:4322/_astro/client.js:8';
const consoleLine =
  "Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive of the Content Security Policy.";
const drop = (items: string[], browserName: string, selectCount: number) =>
  dropWebkitSelectReports(items, (item) => item, { browserName, selectCount });

describe('WebKit native <select> CSP exception (csp-allow.ts, #862)', () => {
  it('sets aside the inline style-src-attr report, and its console twin, only in WebKit on a page with a select', () => {
    expect(drop([attr, consoleLine], 'webkit', 1)).toEqual([]);
    expect(drop([attr], 'webkit', 3)).toEqual([]);
  });

  it('keeps everything in other engines and on pages without a select', () => {
    expect(drop([attr, consoleLine], 'chromium', 1)).toEqual([attr, consoleLine]);
    expect(drop([attr, consoleLine], 'firefox', 2)).toEqual([attr, consoleLine]);
    expect(drop([attr, consoleLine], 'webkit', 0)).toEqual([attr, consoleLine]);
  });

  it('keeps every report when there are more of them than selects, so a real inline style still fails', () => {
    expect(drop([attr, attr], 'webkit', 1)).toEqual([attr, attr]);
    expect(drop([consoleLine, consoleLine], 'webkit', 1)).toEqual([consoleLine, consoleLine]);
  });

  it('keeps any other directive or target, even beside the select report', () => {
    const others = [
      'style-src-elem: inline at http://localhost:4322/x:1',
      'style-src-attr: https://evil.example/a.css at http://localhost:4322/x:1',
      'style-src-attr: eval at http://localhost:4322/x:1',
      'script-src-elem: inline at http://localhost:4322/x:1',
      'img-src: https://blocked.example/pixel.png at http://localhost:4322/x:1',
      'Refused to load the image because it violates the following Content Security Policy directive: "img-src".',
    ];
    expect(drop([attr, ...others], 'webkit', 1)).toEqual(others);
  });
});
