/**
 * Whether this build's /signin and /signup may open the sign-in form at all. Pure and used only at build time by
 * those pages, so nothing here ships to the browser.
 *
 * - The live site (a Workers Build of `main`, wrangler.jsonc's production branch): only `accountsOpen` in
 *   src/config/site.ts opens accounts. No variable can, so a stray build setting can never open sign-in early.
 * - Preview and staging builds (Workers Builds of any other branch, locked behind Cloudflare Access): open, so the
 *   staging sign-in test path keeps working with the cueory-staging project (docs/GO-LIVE.md, Previews variables).
 * - Any other build (a plain `npm run build`, CI, the browser tests): closed unless CUEORY_ACCOUNTS_PREVIEW=1 asks for
 *   it on purpose. A Workers Build ignores that variable, so setting it in Cloudflare's Production variables does
 *   nothing.
 *
 * A Workers Build that doesn't say which branch it builds counts as the live site (fails closed), as in draftsAllowed.
 * Supabase settings are still needed on top: with this gate open and no project settings, the page says accounts
 * open soon, as before.
 */
export interface AccountsBuildEnv {
  WORKERS_CI?: string | undefined;
  WORKERS_CI_BRANCH?: string | undefined;
  CUEORY_ACCOUNTS_PREVIEW?: string | undefined;
}

/** The live site's branch (wrangler.jsonc: production branch `main`). */
export const LIVE_BRANCH = 'main';

/** May a build that isn't public yet open sign-in for testing? Never on the live site. */
export function accountsPreviewAllowed(env: AccountsBuildEnv): boolean {
  if (env.WORKERS_CI === '1') {
    const raw = env.WORKERS_CI_BRANCH?.trim();
    const branch = raw?.startsWith('refs/heads/') ? raw.slice('refs/heads/'.length) : raw;
    return Boolean(branch) && branch !== LIVE_BRANCH;
  }
  return env.CUEORY_ACCOUNTS_PREVIEW === '1';
}

/** The gate the pages use: open when accounts are open to the public, or on a build allowed to preview them. */
export function accountsGateOpen(open: boolean, env: AccountsBuildEnv): boolean {
  return open || accountsPreviewAllowed(env);
}

/** Only the variables the gate reads, from the build's environment. */
export function accountsBuildEnv(source: Record<string, string | undefined>): AccountsBuildEnv {
  return {
    WORKERS_CI: source.WORKERS_CI,
    WORKERS_CI_BRANCH: source.WORKERS_CI_BRANCH,
    CUEORY_ACCOUNTS_PREVIEW: source.CUEORY_ACCOUNTS_PREVIEW,
  };
}
