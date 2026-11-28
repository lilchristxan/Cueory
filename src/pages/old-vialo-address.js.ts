/**
 * /old-vialo-address.js, the one script of the old wordpill address (/play/vialo), written when the site is built. It is
 * an external file on this site's own address, so the page carries no inline script and the content security policy
 * stays as it is. The page loads it in the head so it runs before any island starts fetching. The logic is
 * src/scripts/oldvialoaddress.ts (unit tested); this file only calls it.
 */
import type { APIRoute } from 'astro';
import oldvialoaddress from '../scripts/oldvialoaddress.ts?raw';
import { buildPlainScript } from '../scripts/swbuild';

const script = buildPlainScript([oldvialoaddress, 'followOldVialoAddress(window.location);']);

export const GET: APIRoute = () => new Response(script, { headers: { 'Content-Type': 'text/javascript; charset=utf-8' } });
