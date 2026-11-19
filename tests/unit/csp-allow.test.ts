import { describe, expect, it } from 'vitest';
import { dropWebkitSelectReports } from '../../tests/e2e/csp-allow';

const attr = 'style-src-attr: inline at http://localhost:4322/_astro/client.js:8';
const consoleLine =
  "Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive of the Content Security Policy.";
// events: structured securitypolicyviolation reports; others: console lines and page errors.
const drop = (events: string[], others: string[], browserName: string, selectCount: number) =>
  dropWebkitSelectReports(events, others, (item) => item, { browserName, selectCount });

describe('WebKit native <select> CSP exception (csp-allow.ts, #862)', () => {
  it('sets aside the qualifying event and its console mirror, only in WebKit on a page with a select', () => {
    expect(drop([attr], [consoleLine], 'webkit', 1)).toEqual([]);
    expect(drop([attr], [], 'webkit', 3)).toEqual([]);
    expect(drop([attr, attr], [consoleLine, consoleLine], 'webkit', 2)).toEqual([]);
  });

  it('never qualifies anything from a console line alone', () => {
    expect(drop([], [consoleLine], 'webkit', 1)).toEqual([consoleLine]);
    expect(drop([], [consoleLine, consoleLine], 'webkit', 5)).toEqual([consoleLine, consoleLine]);
  });

  it('sets aside no more console mirrors than there were qualifying events', () => {
    expect(drop([attr], [consoleLine, consoleLine], 'webkit', 3)).toEqual([consoleLine]);
  });

  it('keeps unrelated console lines and page errors beside a qualifying event', () => {
    const other = 'Error: something else broke';
    expect(drop([attr], [other, consoleLine], 'webkit', 1)).toEqual([other]);
  });

  it('keeps everything in other engines and on pages without a select', () => {
    expect(drop([attr], [consoleLine], 'chromium', 1)).toEqual([consoleLine, attr]);
    expect(drop([attr], [consoleLine], 'firefox', 2)).toEqual([consoleLine, attr]);
    expect(drop([attr], [consoleLine], 'webkit', 0)).toEqual([consoleLine, attr]);
  });

  it('keeps every report when there are more events than selects, so a real inline style still fails', () => {
    expect(drop([attr, attr], [consoleLine], 'webkit', 1)).toEqual([consoleLine, attr, attr]);
  });

  it('keeps any other directive or target, even beside the select event', () => {
    const others = [
      'style-src-elem: inline at http://localhost:4322/x:1',
      'style-src-attr: https://evil.example/a.css at http://localhost:4322/x:1',
      'style-src-attr: eval at http://localhost:4322/x:1',
      'script-src-elem: inline at http://localhost:4322/x:1',
      'img-src: https://blocked.example/pixel.png at http://localhost:4322/x:1',
    ];
    expect(drop([attr, ...others], [], 'webkit', 1)).toEqual(others);
    const imgConsole = 'Refused to load the image because it violates the following Content Security Policy directive: "img-src".';
    expect(drop([attr], [imgConsole], 'webkit', 1)).toEqual([imgConsole]);
  });
});
