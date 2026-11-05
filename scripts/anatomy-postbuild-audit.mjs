/**
 * Enforce the existing anatomy release-artifact audit after npm run build.
 * Astro's build hook removes unapproved GLBs. Pagefind runs afterward, so the
 * final audit must run after both steps and inspect the complete dist/ tree.
 * Previews intentionally keep draft models and must not run this production gate.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { auditAnatomyProduction } from './anatomy-production-audit.mjs';

/** The documented Workers Builds branch variable may be a short or full ref. */
export function shouldAuditAnatomyPostbuild(env) {
  if (env.CUEORY_ANATOMY_PRODUCTION_AUDIT === '1') return true;
  if (env.WORKERS_CI !== '1') return false;
  const rawBranch = typeof env.WORKERS_CI_BRANCH === 'string' ? env.WORKERS_CI_BRANCH.trim() : '';
  const branch = rawBranch.startsWith('refs/heads/') ? rawBranch.slice('refs/heads/'.length) : rawBranch;
  // An unrecognized Workers branch must not accidentally publish a draft.
  return !branch || branch === 'main';
}

/** Null indicates a preview/local build. All other results describe the actual output. */
export function auditAnatomyPostbuild(env, distDir = 'dist', contentDir = 'content/visuals') {
  return shouldAuditAnatomyPostbuild(env) ? auditAnatomyProduction(distDir, contentDir) : null;
}

function main() {
  const result = auditAnatomyPostbuild(process.env);
  if (result === null) return;
  if (result.errors.length) {
    process.stderr.write('anatomy production postbuild audit FAILED:\n');
    for (const error of result.errors) process.stderr.write('- ' + error + '\n');
    process.exitCode = 1;
    return;
  }
  process.stdout.write('anatomy production postbuild audit PASS: ' +
    result.approvedSystems + ' approved, ' + result.draftSystems + ' draft, ' +
    result.shippedModels + ' shipped models\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
