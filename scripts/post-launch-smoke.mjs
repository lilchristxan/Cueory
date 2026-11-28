#!/usr/bin/env node
/**
 * Manual post-launch smoke. This is deliberately not wired into CI: run it
 * against the live deployment after Christian merges the approved release.
 *
 *   LIVE_BASE_URL=https://cueory.app node scripts/post-launch-smoke.mjs
 *
 * It only navigates and inspects pages. It does not click controls, submit
 * forms, write storage, solve a game, or create an account.
 */
import { chromium, request } from '@playwright/test';

const rawBase = process.env.LIVE_BASE_URL?.trim();
if (!rawBase) throw new Error('LIVE_BASE_URL is required; this is a manual live-host check.');
const base = new URL(rawBase);
if (base.protocol !== 'https:') throw new Error('LIVE_BASE_URL must use https.');
if (base.origin !== 'https://cueory.app') throw new Error('LIVE_BASE_URL must be exactly https://cueory.app.');
base.hash = '';
base.search = '';
const origin = base.origin;

const routes = [
  { path: '/', label: 'home', expected: 'page', markers: ['#hero-heading'] },
  { path: '/play', label: 'daily games', expected: 'page', markers: ['h1', '[data-testid="play-status"]'] },
  { path: '/play/vialo', label: 'vialo', expected: 'page', markers: ['[data-testid="vialo"]'] },
  { path: '/play/sudoku', label: 'sudoku', expected: 'page', markers: ['[data-testid="sudoku"]'] },
  { path: '/play/piccline', label: 'piccline', expected: 'page', markers: ['[data-testid="suture"]'] },
  { path: '/play/crossword', label: 'crossword', expected: 'coming-soon', markers: ['[data-testid="crossword-soon"]'] },
  { path: '/play/tachyyy', label: 'tachyyy', expected: 'coming-soon', markers: ['[data-testid="stat-soon"]'] },
  { path: '/privacy', label: 'privacy', expected: 'page', markers: ['h1'] },
];

const requiredHeaders = [
  'content-security-policy',
  'strict-transport-security',
  'x-content-type-options',
  'referrer-policy',
  'permissions-policy',
  'x-frame-options',
  'cross-origin-opener-policy',
];

function urlFor(path) {
  return new URL(path, `${origin}/`).href;
}

function checkHeaders(headers, label) {
  const missing = requiredHeaders.filter((name) => !headers[name]);
  if (missing.length) throw new Error(`${label}: missing security headers: ${missing.join(', ')}`);
  if (headers['strict-transport-security'].toLowerCase() !== 'max-age=31536000; includesubdomains') throw new Error(`${label}: unexpected Strict-Transport-Security`);
  if (headers['x-frame-options'].toLowerCase() !== 'deny') throw new Error(`${label}: X-Frame-Options must be DENY`);
  if (headers['x-content-type-options'].toLowerCase() !== 'nosniff') throw new Error(`${label}: X-Content-Type-Options must be nosniff`);
  if (headers['referrer-policy'].toLowerCase() !== 'strict-origin-when-cross-origin') throw new Error(`${label}: unexpected Referrer-Policy`);
  if (headers['cross-origin-opener-policy'].toLowerCase() !== 'same-origin') throw new Error(`${label}: Cross-Origin-Opener-Policy must be same-origin`);
  const csp = headers['content-security-policy'];
  const directives = new Map();
  for (const segment of csp.split(';')) {
    const tokens = segment.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    const name = tokens.shift().toLowerCase();
    if (directives.has(name)) throw new Error(`${label}: CSP repeats ${name}`);
    directives.set(name, tokens);
  }
  const exact = (name, sources) => {
    const actual = directives.get(name);
    if (!actual || actual.length !== sources.length || actual.some((source, index) => source !== sources[index])) {
      throw new Error(`${label}: CSP ${name} must be exactly ${sources.join(' ')}`);
    }
  };
  exact('frame-ancestors', ["'none'"]);
  exact('object-src', ["'none'"]);
  exact('frame-src', ['https://www.youtube-nocookie.com']);
  const scriptSources = directives.get('script-src');
  if (!scriptSources?.length) throw new Error(`${label}: CSP script-src is missing or empty`);
  if ([...directives.values()].flat().some((source) => /^'unsafe-(?:inline|eval)'$/i.test(source))) {
    throw new Error(`${label}: CSP contains unsafe-inline or unsafe-eval`);
  }
}

async function inspectViewport(browser, viewport, deviceLabel) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  const page = await context.newPage();
  const failures = [];
  page.on('console', (message) => { if (message.type() === 'error') failures.push(`${deviceLabel}: console error: ${message.text()}`); });
  page.on('pageerror', (error) => failures.push(`${deviceLabel}: page error: ${error.message}`));

  for (const route of routes) {
    const response = await page.goto(urlFor(route.path), { waitUntil: 'domcontentloaded' });
    if (!response) throw new Error(`${deviceLabel} ${route.label}: no navigation response`);
    if (response.status() !== 200) throw new Error(`${deviceLabel} ${route.label}: expected HTTP 200, got ${response.status()}`);
    if (new URL(response.url()).origin !== origin) throw new Error(`${deviceLabel} ${route.label}: navigation left ${origin}`);
    checkHeaders(response.headers(), `${deviceLabel} ${route.label}`);
    for (const marker of route.markers) await page.locator(marker).waitFor({ state: 'visible', timeout: 10000 });
    console.log(`${deviceLabel}\t${route.path}\t${response.status()}\t${route.expected}`);
  }
  await context.close();
  if (failures.length) throw new Error(failures.join('\n'));
}

const browser = await chromium.launch();
const api = await request.newContext();
try {
  await inspectViewport(browser, { width: 390, height: 844 }, 'phone');
  await inspectViewport(browser, { width: 1440, height: 900 }, 'desktop');
  const notFound = await api.get(urlFor('/post-launch-smoke-404'));
  if (notFound.status() !== 404) throw new Error(`unknown route: expected HTTP 404, got ${notFound.status()}`);
  if (new URL(notFound.url()).origin !== origin) throw new Error(`unknown route: navigation left ${origin}`);
  checkHeaders(notFound.headers(), 'unknown route');
  console.log(`unknown-route\t/post-launch-smoke-404\t${notFound.status()}\t404`);
} finally {
  await api.dispose();
  await browser.close();
}
