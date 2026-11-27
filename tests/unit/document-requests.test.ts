import { EventEmitter } from 'node:events';
import type { Frame, Page, Request } from '@playwright/test';
import { expect, it } from 'vitest';
import { trackDocumentRequests } from '../e2e/document-requests';

it('retires abandoned requests at a main document commit and keeps the destination requests', () => {
  let mainUrl = 'about:blank';
  const main = { url: () => mainUrl } as Frame;
  const iframe = { url: () => 'https://cueory.test/iframe' } as Frame;
  const events = new EventEmitter();
  const page = Object.assign(events, { mainFrame: () => main }) as unknown as Page;
  const request = (url: string, navigates = false, frame = main) => ({
    url: () => url,
    isNavigationRequest: () => navigates,
    frame: () => frame,
  } as Request);

  const tracker = trackDocumentRequests(page);
  const legacy = request('https://cueory.test/play/vialo', true);
  events.emit('request', legacy);
  mainUrl = legacy.url();
  events.emit('framenavigated', main);
  events.emit('requestfinished', legacy);

  const sharedUrl = 'https://cueory.test/_astro/shared.js';
  const abandoned = request(sharedUrl);
  const iframeRequest = request(iframe.url(), true, iframe);
  const canonical = request('https://cueory.test/play/wordpill', true);
  const current = request(sharedUrl);
  events.emit('request', abandoned);
  events.emit('request', iframeRequest);
  events.emit('framenavigated', iframe);
  events.emit('requestfailed', iframeRequest);
  events.emit('request', canonical);
  events.emit('request', current);
  expect([...tracker.open.keys()]).toEqual([abandoned, canonical, current]);

  mainUrl = canonical.url() + '#print';
  events.emit('framenavigated', main);
  events.emit('requestfinished', canonical);
  expect([...tracker.open.keys()]).toEqual([current]);

  events.emit('requestfailed', abandoned);
  expect([...tracker.open.keys()]).toEqual([current]);
  events.emit('requestfinished', current);
  expect(tracker.open.size).toBe(0);
});
