// Removes the /preview/* pages, and /about while Christian's story is unwritten (aboutShown in src/lessons/draftgate.ts),
// from the LIVE deploy build only (production branch on Workers Builds).
// Same rule as draftsAllowed (src/islands/anatomylab.ts): a Workers build with no branch name counts as production.
// Builds on an explicitly named non-main branch (staging, previews) and plain local builds keep them; the
// CUEORY_ANATOMY_DRAFTS flag matters only to those local builds. It runs before Pagefind so search never sees them.
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** True for the production build: WORKERS_CI=1 and branch main, refs/heads/main, or no branch name at all. */
export function isProductionBuild(env) {
  if (env.WORKERS_CI !== '1') return false;
  const raw = env.WORKERS_CI_BRANCH?.trim();
  const branch = raw?.startsWith('refs/heads/') ? raw.slice('refs/heads/'.length) : raw;
  return !branch || branch === 'main';
}

/** Deletes dist/preview when env is a production build. Returns true when it removed the folder. */
export function prunePreview(env, dist = resolve('dist')) {
  if (!isProductionBuild(env)) return false;
  const folder = resolve(dist, 'preview');
  if (!existsSync(folder)) return false;
  rmSync(folder, { recursive: true, force: true });
  return true;
}

/**
 * Pages the live build leaves out, so their addresses get the site's normal 404 page (not_found_handling in
 * wrangler.jsonc). /about waits for Christian's story; delete it from this list and the gate in draftgate.ts together.
 */
export const LIVE_HELD_PAGES = ['about.html'];

/** Deletes LIVE_HELD_PAGES from dist when env is a production build. Returns the files it removed. */
export function pruneHeldPages(env, dist = resolve('dist')) {
  if (!isProductionBuild(env)) return [];
  return LIVE_HELD_PAGES.filter((file) => {
    const path = resolve(dist, file);
    if (!existsSync(path)) return false;
    rmSync(path, { force: true });
    return true;
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const removed = prunePreview(process.env);
  console.log(removed ? 'prune-preview: removed dist/preview from the live build.' : 'prune-preview: kept dist/preview (not the production build).');
  const held = pruneHeldPages(process.env);
  console.log(held.length ? `prune-preview: removed ${held.join(', ')} from the live build.` : 'prune-preview: kept every page (not the production build).');
}
