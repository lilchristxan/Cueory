/**
 * Wrangler's own pre-upload gate. A manual `wrangler deploy` can otherwise
 * upload a stale draft-enabled dist without running npm's postbuild hook.
 *
 * This script validates prebuilt assets. It intentionally does not rebuild,
 * so Cloudflare Workers Builds can still run npm build followed by deploy.
 */
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { auditAnatomyProduction, builtSiteEntrypointErrors } from './anatomy-production-audit.mjs';

export function shouldAuditWranglerUpload(env) {
  const command = typeof env.WRANGLER_COMMAND === 'string'
    ? env.WRANGLER_COMMAND.trim() : '';
  // Version uploads always require the production artifact audit.
  if (command === 'versions upload') return true;
  // CI variables are forgeable and cannot authenticate a preview invocation.
  // The optional standalone checker must never exempt an upload labeled deploy.
  if (command === 'deploy') return true;
  // A user-provided preview flag is not trusted release evidence.
  if (command === 'dev' || command === 'types' || command === 'preview') return false;
  // An unknown invocation without a verified preview context fails closed.
  return true;
}

export function checkAnatomyWranglerUpload(env = process.env, dist = 'dist', content = 'content/visuals') {
  if (!shouldAuditWranglerUpload(env)) return { skipped: true, errors: [] };
  const audit = auditAnatomyProduction(dist, content);
  return { skipped: false, ...audit, errors: [...audit.errors, ...builtSiteEntrypointErrors(dist)] };
}

if (process.argv[1]) {
  let invokedScript;
  try { invokedScript = realpathSync(resolve(process.argv[1])); }
  catch { /* Node reports an invalid CLI path before evaluating it; imports remain side-effect-free. */ }
  if (invokedScript && import.meta.url === pathToFileURL(invokedScript).href) {
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
}
