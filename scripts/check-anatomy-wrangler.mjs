/**
 * Wrangler's own pre-upload gate. A manual `wrangler deploy` can otherwise
 * upload a stale draft-enabled dist without running npm's postbuild hook.
 *
 * This script validates prebuilt assets. It intentionally does not rebuild,
 * so Cloudflare Workers Builds can still run npm build followed by deploy.
 */
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { auditAnatomyProduction } from './anatomy-production-audit.mjs';

export function shouldAuditWranglerUpload(env) {
  const command = typeof env.WRANGLER_COMMAND === 'string'
    ? env.WRANGLER_COMMAND.trim() : '';
  // Deploy and version upload must verify assets regardless of draft flags,
  // GitHub refs, or the current Workers Builds branch.
  if (command === 'deploy' || command === 'versions upload') return true;
  if (command === 'dev' || command === 'types' || command === 'preview') return false;
  // Workers preview builds are not production uploads. Wrangler may not set
  // WRANGLER_COMMAND for the preview subcommand on all CLI versions.
  const branch = typeof env.WORKERS_CI_BRANCH === 'string'
    ? env.WORKERS_CI_BRANCH.trim().replace(/^refs\/heads\//, '') : '';
  if (env.WORKERS_CI === '1' && branch && branch !== 'main') return false;
  // An unknown invocation without a verified preview context fails closed.
  return true;
}

export function checkAnatomyWranglerUpload(env = process.env, dist = 'dist', content = 'content/visuals') {
  if (!shouldAuditWranglerUpload(env)) return { skipped: true, errors: [] };
  return { skipped: false, ...auditAnatomyProduction(dist, content) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const checked = checkAnatomyWranglerUpload();
  if (checked.skipped) {
    process.stdout.write('anatomy Wrangler upload audit: skipped for development/preview\n');
  } else if (checked.errors.length) {
    process.stderr.write('anatomy Wrangler upload audit FAILED:\n');
    for (const problem of checked.errors) process.stderr.write('- ' + problem + '\n');
    process.exitCode = 1;
  } else {
    process.stdout.write('anatomy Wrangler upload audit PASS\n');
  }
}
