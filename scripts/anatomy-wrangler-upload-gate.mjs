/**
 * Fail-closed anatomy release check for direct Wrangler uploads.
 *
 * Cloudflare Workers Builds does not run Wrangler custom-build hooks, so
 * production Workers Builds must keep its separate npm postbuild audit.
 * This hook protects local "wrangler deploy" of prebuilt dist/ files.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { auditAnatomyProduction } from './anatomy-production-audit.mjs';

/** These Wrangler commands do not upload to the production custom domain. */
const LOCAL_ONLY_COMMANDS = new Set(['dev', 'types', 'preview']);
const WORKERS_BUILD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function shouldAuditWranglerUpload(env = process.env) {
  const command = env.WRANGLER_COMMAND;
  // A real upload must be checked even inside Workers Builds or if drafts were
  // intentionally enabled for local development.
  if (command === 'deploy' || command === 'versions upload') return true;
  if (LOCAL_ONLY_COMMANDS.has(command)) return false;

  // Wrangler 4.156 invokes its custom-build hook for "wrangler preview" but
  // does not document a WRANGLER_COMMAND=preview value. Workers Builds injects
  // a branch and a per-build UUID. Permit that *specific* preview-build case.
  // A missing or unexpected command outside this known context fails closed.
  const branch = env.WORKERS_CI_BRANCH;
  if ((command === undefined || command === '') &&
      env.WORKERS_CI === '1' &&
      WORKERS_BUILD_ID.test(env.WORKERS_CI_BUILD_UUID ?? '') &&
      typeof branch === 'string' && branch.trim() !== '' &&
      branch !== 'main') {
    return false;
  }
  return true;
}

export function checkWranglerUpload(env = process.env, dist = 'dist', content = 'content/visuals') {
  if (!shouldAuditWranglerUpload(env)) return { skipped: true, errors: [] };
  return { skipped: false, ...auditAnatomyProduction(dist, content) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = checkWranglerUpload();
  if (result.skipped) {
    process.stdout.write('anatomy Wrangler upload audit: local non-upload command\n');
  } else if (result.errors.length) {
    process.stderr.write('anatomy Wrangler upload audit FAILED:\n');
    for (const error of result.errors) process.stderr.write('- ' + error + '\n');
    process.exitCode = 1;
  } else {
    process.stdout.write('anatomy Wrangler upload audit PASS\n');
  }
}
