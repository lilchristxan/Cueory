// Removes the /preview/* pages from the LIVE deploy build only (production branch on Workers Builds).
// Staging, branch previews, local builds and CUEORY_ANATOMY_DRAFTS=1 builds keep them. Fails closed: only an
// explicit production build prunes; it runs before Pagefind so the search index never sees these pages.
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** True only for the production build: WORKERS_CI=1 on branch main (or refs/heads/main). */
export function isProductionBuild(env) {
  if (env.WORKERS_CI !== '1') return false;
  const raw = env.WORKERS_CI_BRANCH?.trim();
  const branch = raw?.startsWith('refs/heads/') ? raw.slice('refs/heads/'.length) : raw;
  return branch === 'main';
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
