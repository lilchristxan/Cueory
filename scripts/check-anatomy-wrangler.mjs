/**
 * Wrangler's own pre-upload gate. A manual `wrangler deploy` can otherwise
 * upload a stale draft-enabled dist without running npm's postbuild hook.
 *
 * This script validates prebuilt assets. It intentionally does not rebuild,
 * so Cloudflare Workers Builds can still run npm build followed by deploy.
 */
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { auditAnatomyProduction, builtSiteEntrypointErrors } from './anatomy-production-audit.mjs';

export function shouldAuditWranglerUpload(env) {
  const command = typeof env.WRANGLER_COMMAND === 'string'
    ? env.WRANGLER_COMMAND.trim() : '';
  // Version uploads always require the production artifact audit.
  if (command === 'versions upload') return true;
  const branch = typeof env.WORKERS_CI_BRANCH === 'string'
    ? env.WORKERS_CI_BRANCH.trim().replace(/^refs\/heads\//, '') : '';
  const validBuildId = typeof env.WORKERS_CI_BUILD_UUID === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(env.WORKERS_CI_BUILD_UUID);
  const workersCI = env.WORKERS_CI === '1' || env.WORKERS_CI === 'true';
  // Wrangler 4.156 can report WRANGLER_COMMAND=deploy within a preview.
  // Accept it as a preview only with the complete Workers Builds non-main
  // context. Draft mode by itself never bypasses this audit.
  if ((command === 'deploy' || command === '') && workersCI
      && validBuildId && branch && branch !== 'main') return false;
  if (command === 'deploy') return true;
  if (env.CUEORY_WRANGLER_PREVIEW === '1' && command !== 'deploy') return false;
  if (command === 'dev' || command === 'types' || command === 'preview') return false;
  // An unknown invocation without a verified preview context fails closed.
  return true;
}

export function checkAnatomyWranglerUpload(env = process.env, dist = 'dist', content = 'content/visuals') {
  if (!shouldAuditWranglerUpload(env)) return { skipped: true, errors: [] };
  const audit = auditAnatomyProduction(dist, content);
  return { skipped: false, ...audit, errors: [...audit.errors, ...builtSiteEntrypointErrors(dist)] };
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
