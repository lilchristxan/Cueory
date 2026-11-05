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

export function shouldAuditWranglerUpload(env = process.env) {
  // In particular, CUEORY_ANATOMY_DRAFTS=1 must never exempt a deploy.
  // Unknown or missing commands fail closed rather than assuming preview.
  return !LOCAL_ONLY_COMMANDS.has(env.WRANGLER_COMMAND);
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
