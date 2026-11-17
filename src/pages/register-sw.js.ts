/**
 * /register-sw.js, the page side of the offline service worker (src/scripts/offline.ts), written when the site is
 * built. It is an external file on this site's own address, so pages carry no inline script for it and the content
 * security policy stays as it is.
 *
 * Every page loads it, so it is minified with Vite's own minifier (already part of the build): that drops the
 * whitespace left where the types were and the helpers only the worker uses (lane 9: 4,071 → 1,307 gzip bytes).
 */
import type { APIRoute } from 'astro';
import offlineplan from '../scripts/offlineplan.ts?raw';
import offline from '../scripts/offline.ts?raw';
import swlogic from '../scripts/swlogic.ts?raw';
import { minifySync } from 'vite';
import { buildPlainScript } from '../scripts/swbuild';

const minified = minifySync('register-sw.js', buildPlainScript([offlineplan, swlogic, offline]));
if (minified.errors.length > 0) throw new Error(`register-sw.js did not minify: ${minified.errors[0]!.message}`);
const script = minified.code;

export const GET: APIRoute = () => new Response(script, { headers: { 'Content-Type': 'text/javascript; charset=utf-8' } });
