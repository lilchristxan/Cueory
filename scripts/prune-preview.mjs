// Removes the /preview/* pages from the LIVE deploy build only (production branch on Workers Builds).
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const removed = prunePreview(process.env);
  console.log(removed ? 'prune-preview: removed dist/preview from the live build.' : 'prune-preview: kept dist/preview (not the production build).');
}
