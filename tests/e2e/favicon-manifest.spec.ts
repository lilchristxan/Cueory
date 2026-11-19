import { expect, test } from '@playwright/test';

// /favicon.ico is served for browsers and tools that ask for it directly, and the app manifest names the whole site.
test('the site serves /favicon.ico and a manifest with id, scope and lang', async ({ request }) => {
  const favicon = await request.get('/favicon.ico');
  expect(favicon.status()).toBe(200);
  const bytes = await favicon.body();
  expect([bytes.readUInt16LE(0), bytes.readUInt16LE(2), bytes.readUInt16LE(4)]).toEqual([0, 1, 1]);
  const icon = await request.get('/brand/v1/icon-32.png');
  expect(icon.status()).toBe(200);
  expect(bytes.subarray(22).equals(await icon.body())).toBe(true);

  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.status()).toBe(200);
  const json = await manifest.json();
  expect([json.id, json.scope, json.start_url, json.lang]).toEqual(['/', '/', '/', 'en']);
});
