/**
 * Run the existing read-only anatomy release audit on every production-style
 * build, before Wrangler can deploy the generated static files.
 *
 * Do not audit a deliberately draft-enabled preview: those models are allowed
 * only on the Cloudflare Access-protected preview URL. This decision mirrors
 * the build-data and GLB pruning guards. Main/release CI always audits, even
 * if somebody accidentally opted into drafts.
 */
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { auditAnatomyProduction } from './anatomy-production-audit.mjs';

export function shouldAuditAnatomyBuild(env) {
  // Any build on main must be audited, including manual and scheduled
  // GitHub workflows, not only push events. Release PR builds also audit.
  if (env.GITHUB_REF === 'refs/heads/main' ||
      (env.GITHUB_EVENT_NAME === 'pull_request' && env.GITHUB_BASE_REF === 'main')) return true;
  if (env.WORKERS_CI === '1') {
    const raw = env.WORKERS_CI_BRANCH?.trim();
    const branch = raw?.startsWith('refs/heads/') ? raw.slice('refs/heads/'.length) : raw;
    return !branch || branch === 'main';
  }
  // Local tests may explicitly build the locked draft fixture. Otherwise,
  // including an unknown environment, a built artifact must be release-safe.
  return env.CUEORY_ANATOMY_DRAFTS !== '1';
}

export function checkAnatomyBuild(env = process.env, dist = 'dist', content = 'content/visuals') {
  if (!shouldAuditAnatomyBuild(env)) return { skipped: true, errors: [] };
  const result = auditAnatomyProduction(dist, content);
  return { skipped: false, ...result };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = checkAnatomyBuild();
  if (result.skipped) {
    process.stdout.write('anatomy release audit: skipped for explicitly draft-enabled preview\n');
  } else if (result.errors.length) {
    process.stderr.write('anatomy production artifact audit FAILED:\n');
    for (const problem of result.errors) process.stderr.write('- ' + problem + '\n');
    process.exitCode = 1;
  } else {
    process.stdout.write('anatomy production artifact audit PASS\n');
  }
}
