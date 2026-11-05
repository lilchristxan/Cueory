/**
 * Opt-in production deployment path. Check the exact prebuilt asset directory
 * immediately before Wrangler uploads it, regardless of draft-build flags.
 *
 * NOT automatically active in Cloudflare until its production Deploy command
 * is separately approved and changed to "npm run deploy:production".
 * Raw "npx wrangler deploy" can bypass this helper and must be restricted via
 * credentials and deployment policy, never assumed safe.
 */
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { auditAnatomyProduction } from './anatomy-production-audit.mjs';

function runWranglerDeploy() {
  return spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['--no-install', 'wrangler', 'deploy'], { stdio: 'inherit' });
}

/** The injected runner is for tests; production always uses Wrangler. */
export function deployProduction({ distDir = 'dist', contentDir = 'content/visuals', runDeploy = runWranglerDeploy } = {}) {
  const audit = auditAnatomyProduction(distDir, contentDir);
  if (audit.errors.length) return { attempted: false, exitCode: 1, errors: audit.errors };
  try {
    const response = runDeploy();
    return {
      attempted: true,
      exitCode: Number.isInteger(response?.status) && response.status >= 0 ? response.status : 1,
      errors: response?.error ? ['Wrangler deployment command could not start'] : [],
    };
  } catch {
    return { attempted: true, exitCode: 1, errors: ['Wrangler deployment command failed'] };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = deployProduction();
  if (result.errors.length) {
    process.stderr.write('anatomy production upload blocked:\n');
    for (const problem of result.errors) process.stderr.write('- ' + problem + '\n');
  }
  process.exitCode = result.exitCode;
}
