import { describe, expect, it } from 'vitest';
import { firstVisitUrls, startOffline, type OfflineEnvironment, type WorkerContainer } from '../../src/scripts/offline';

const ORIGIN = 'https://example.test';

describe('first visit address edges', () => {
  it('returns nothing when neither the page nor its files would be kept', () => {
    expect(firstVisitUrls(`${ORIGIN}/api/thing`, [`${ORIGIN}/data.json`], ORIGIN)).toEqual([]);
    expect(firstVisitUrls(`${ORIGIN}/learn/a`, [], ORIGIN)).toEqual([`${ORIGIN}/learn/a`]);
  });
  it('drops the part after a hash, and counts the same address once', () => {
    expect(firstVisitUrls(`${ORIGIN}/learn/a#top`, [`${ORIGIN}/learn/a#bottom`, `${ORIGIN}/learn/a`], ORIGIN)).toEqual([`${ORIGIN}/learn/a`]);
  });
  it('resolves relative addresses against the site, not the page', () => {
    expect(firstVisitUrls('/learn/a', ['/_astro/x.js', '_astro/y.js'], ORIGIN)).toEqual([`${ORIGIN}/learn/a`, `${ORIGIN}/_astro/x.js`, `${ORIGIN}/_astro/y.js`]);
  });
  it('leaves out other sites, even with a matching path', () => {
    expect(firstVisitUrls(`${ORIGIN}/learn/a`, ['https://other.test/_astro/x.js', 'http://example.test/_astro/x.js'], ORIGIN)).toEqual([`${ORIGIN}/learn/a`]);
  });
  it('leaves out addresses with a query string', () => {
    expect(firstVisitUrls(`${ORIGIN}/learn/a?x=1`, [`${ORIGIN}/_astro/x.js?v=2`], ORIGIN)).toEqual([]);
  });
  it('skips an unreadable address and keeps going', () => {
    expect(firstVisitUrls(`${ORIGIN}/learn/a`, ['http://[bad', `${ORIGIN}/_astro/x.js`], 'https://example.test')).toEqual([
      `${ORIGIN}/learn/a`, `${ORIGIN}/_astro/x.js`,
    ]);
  });
  it('never keeps the play page, because its puzzles are inside it', () => {
    expect(firstVisitUrls(`${ORIGIN}/play`, [`${ORIGIN}/play/`], ORIGIN)).toEqual([]);
  });
  it('keeps the page first and the files in the order the page loaded them', () => {
    const files = ['/_astro/c.js', '/_astro/a.js', '/_astro/b.css'].map((path) => `${ORIGIN}${path}`);
    expect(firstVisitUrls(`${ORIGIN}/learn/a`, files, ORIGIN)).toEqual([`${ORIGIN}/learn/a`, ...files]);
  });
  it('stops at exactly 60, counting the page', () => {
    const files = Array.from({ length: 100 }, (_, index) => `${ORIGIN}/_astro/f${index}.js`);
    const result = firstVisitUrls(`${ORIGIN}/learn/a`, files, ORIGIN);
    expect(result).toHaveLength(60);
    expect(result[59]).toBe(`${ORIGIN}/_astro/f58.js`);
  });
  it('does not count refused addresses toward the 60', () => {
    const noise = Array.from({ length: 80 }, (_, index) => `${ORIGIN}/data${index}.json`);
    const files = Array.from({ length: 5 }, (_, index) => `${ORIGIN}/_astro/f${index}.js`);
    expect(firstVisitUrls(`${ORIGIN}/learn/a`, [...noise, ...files], ORIGIN)).toHaveLength(6);
  });
});

function environment(changes: Partial<OfflineEnvironment> & { registrations?: WorkerContainer['getRegistrations'] } = {}) {
  const log = { registered: 0, fetched: [] as string[], cleared: 0, unregistered: 0 };
  const { registrations, ...rest } = changes;
  const container: WorkerContainer = {
    controller: {},
    ready: Promise.resolve({}),
    register: async () => { log.registered += 1; return {}; },
    getRegistrations: registrations ?? (async () => [{ unregister: async () => { log.unregistered += 1; return true; } }]),
    addEventListener: () => undefined,
  };
  const env: OfflineEnvironment = {
    serviceWorker: container, secure: true, enabled: true, origin: ORIGIN, pageUrl: `${ORIGIN}/learn/a`,
    resources: () => [], fetchOne: async (url) => void log.fetched.push(url),
    clearCopies: async () => void (log.cleared += 1), wait: async () => undefined, ...rest,
  };
  return { env, log };
}

describe('offline start edges', () => {
  it('does nothing at all when the page is not secure, even if switched off', async () => {
    const { env, log } = environment({ secure: false, enabled: false });
    await startOffline(env);
    expect(log).toEqual({ registered: 0, fetched: [], cleared: 0, unregistered: 0 });
  });
  it('does nothing without a service worker container, even if switched off', async () => {
    const { env, log } = environment({ serviceWorker: undefined, enabled: false });
    await startOffline(env);
    expect(log.cleared).toBe(0);
  });
  it('switched off: still unregisters when the list of registrations is empty, without registering', async () => {
    const { env, log } = environment({ enabled: false, registrations: async () => [] });
    await startOffline(env);
    expect(log).toMatchObject({ registered: 0, cleared: 1, unregistered: 0 });
  });
  it('switched off: does not throw when reading the registrations fails', async () => {
    const { env, log } = environment({ enabled: false, registrations: async () => { throw new Error('no'); } });
    await expect(startOffline(env)).resolves.toBeUndefined();
    expect(log.cleared).toBe(1);
  });
  it('switched off: does not throw when one unregister fails, and still tries the next', async () => {
    let tried = 0;
    const failing = { unregister: async () => { tried += 1; throw new Error('no'); } };
    const { env } = environment({ enabled: false, registrations: async () => [failing, failing] });
    await expect(startOffline(env)).resolves.toBeUndefined();
    await new Promise((resolve) => setImmediate(resolve));
    expect(tried).toBe(2);
  });
  it('switched off: does not throw when clearing copies fails', async () => {
    const { env, log } = environment({ enabled: false, clearCopies: async () => { throw new Error('no'); } });
    await expect(startOffline(env)).resolves.toBeUndefined();
    expect(log.unregistered).toBe(1);
  });
  it('registers once on a controlled page and saves nothing until a worker takes over', async () => {
    const { env, log } = environment();
    await startOffline(env);
    expect(log.registered).toBe(1);
    expect(log.fetched).toEqual([]);
  });
});
