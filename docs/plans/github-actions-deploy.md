# Proposal: deploy Cueory with GitHub Actions

**Status:** D-pending — documentation only. **Christian must approve before implementation.**  
**Prepared:** 2026-11-16, task #731.  
**Decision:** No deployment, workflow, repository ruleset, Cloudflare setting, secret, database, or production change is authorized by this document.

## Goal and current behavior

Move the **build/deploy execution** from Cloudflare Workers Builds to GitHub Actions while keeping:

- Feature PRs tested before they reach staging, with protected Preview URLs.
- **staging** as an always-access-controlled Worker Preview, never a production deployment.
- **main** as the *only* source of production deployments, after Christian approves merging a release into main.
- Existing CI, CodeQL, Semgrep, Gitleaks, independent review, founder holds, and the staging auto-merge security policy.
- Total service cost at $0 beyond the already-approved domain.

Repo facts checked on **staging**: **package.json** pins Wrangler **4.156.0**, requires Node 24 and builds Astro/Pagefind static assets into **dist/**. **.node-version** pins Node **24.22.2**. **wrangler.jsonc** names the existing Worker **cueory**, serves **./dist**, and already has a **previews** block. **.github/workflows/ci.yml** runs existing PR checks. **.github/workflows/staging-automerge.yml** and **scripts/automerge/decide.ts** currently depend on Cloudflare's **Workers Builds: cueory** check. These dependencies make a direct switch-off unsafe.

Official references: [Cloudflare GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/), [Worker Previews](https://developers.cloudflare.com/workers/previews/), [Wrangler preview command](https://developers.cloudflare.com/workers/wrangler/commands/workers/#preview), and [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/).

## Proposed trigger and deployment contract

| GitHub event | Preconditions | Proposed build/deploy | Target | May touch production? |
| --- | --- | --- | --- | --- |
| Open/update PR into **staging**, from a trusted branch **inside this repository** | Required CI/security checks successful, exact commit verified, secret-use policy satisfied | **npm ci**, **npm run build**, then **npx wrangler preview --name pr-N** (N is PR number) | Isolated, Access-protected PR Preview | **No** |
| Open/update PR from an external fork | Ordinary unprivileged tests only; no Cloudflare credentials | No automatic privileged Preview deployment; obtain a founder-approved trusted branch if a Preview is needed | GitHub checks only | **No** |
| Push to **staging** after its merge safeguards pass | Source ref is exactly staging, same-repository push | **npm ci**, **npm run build**, **npx wrangler preview --name staging** | Stable, Access-protected staging Preview | **No** |
| Push to **main** after Christian merges the release | Exact main ref, green release checks, founder-controlled GitHub production environment | **npm ci**, **npm run build**, **npx wrangler deploy** | Existing cueory production Worker/custom domain | **Yes, only here** |
| Pull request targeting main, tag, branch other than main, manual dispatch | Never a production trigger | Check only, or a separately approved Preview | None in production | **No** |

The PR number in **pr-N** is an illustration, not a literal string. Use a stable, validated Preview name such as **pr-731** and clean it up on PR close only when Christian approves that automation. **Wrangler preview** is the correct branch-isolated command. **wrangler versions upload** makes a version URL using production resources and must not substitute for an isolated PR or staging Preview. [Cloudflare comparison](https://developers.cloudflare.com/workers/previews/compare-workflows/).

**Critical safety boundary:** A successful GitHub check is not permission to merge or deploy main. Main remains founder-controlled. A release PR to main still needs the existing release CI, independent review, and Christian's explicit merge approval. Do not allow an Actions manual event or branch expression to select a production target. Use an explicit main-only event AND a checked main-only job condition, plus a protected GitHub production environment (with Christian approval and deployment branch restrictions, where supported). Never publish a draft Anatomy Lab model or bypass the existing legal-release build gate.

## Workflow design (proposal only — no workflow file in this PR)

1. Create a dedicated **Preview deploy** workflow for approved same-repository PRs and pushes to staging. Read the checked-out event SHA and verify the repository/ref before any Cloudflare credentials are exposed. Require the existing CI verdict first, including security checks; ensure the Preview success check is attached to the **actual PR head SHA** expected by auto-merge, not a stale or unrelated ref. If a workflow is skipped, missing, canceled, or unauthorized, the required Preview gate must **not** report success.
2. Create a separate **Production deploy** workflow triggered only by a push to main. Gate it with founder-controlled production environment approval and successful release verification. Use the project's pinned Node version, **npm ci**, **npm run build**, and **npx wrangler deploy** only in this main-only path. If this event fires before required release checks can be proven for its exact SHA, block and require founder intervention rather than deploy optimistically.
3. Use least-permission workflow-level **GITHUB_TOKEN** (normally contents read for the build). Grant PR-comment permission only to a small, reviewed step if a Preview URL comment is approved. Configure concurrency by ref/PR so a late job cannot overwrite a newer Preview. Check the HEAD SHA again immediately before publishing a Preview.
4. Do not use **pull_request_target** to check out and execute untrusted PR code with secrets. External forks never receive Cloudflare credentials. Even same-repository branches must be restricted to trusted authors and reviewed deployment scripts: a malicious build script can read a CI secret. No preview deployment job should run arbitrary fork code with credentials.
5. Require the existing project verification gates and a reproducible build, including its prebuild legal-release check. Do not loosen **.github/workflows/ci.yml**, CodeQL, secret scanning, browser coverage, or the default-branch auto-merge rules for this migration.

[Cloudflare's official GitHub Actions guide](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/) supports a scoped token and account ID for Wrangler. [Cloudflare's Preview Actions example](https://developers.cloudflare.com/workers/previews/examples/) warns that forked PRs do not receive repository secrets and says to verify the PR's head repository before exposing them.

## Credentials, staging isolation, and Access

- **Cloudflare credentials:** Create a narrowly scoped Cloudflare API token, limited to the necessary account and Worker permissions (verify the narrowest supported resource scope before approval), plus the account ID. Store them **only** as GitHub Actions secrets. Never place values in this document, code, committed YAML, workflow output, artifacts, or PR comments. Never use a personal global API key. Cloudflare recommends a scoped token for CI. [Cloudflare authentication guide](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/), [Workers permissions](https://developers.cloudflare.com/workers/authorization/workers/).
- **Privilege separation:** Prefer separate, restricted Preview and production credentials with GitHub environment protections. Preview jobs must not have access to production environment secrets. A Worker Editor token can deploy Worker code, so simply naming a token "preview" is **not** a technical prohibition on production changes; verify actual token permissions and protect the CI trust boundary. Require founder approval if the available Cloudflare scope cannot sufficiently separate privileges.
- **Preview configuration:** Keep **wrangler.jsonc**'s Preview settings separate from production settings. Before any migration, inspect the existing Previews Base variables, secrets, bindings and their associated Supabase staging resources. Do not inherit production credentials or connect PR previews to production data. No database migrations are part of this plan. [Preview configuration](https://developers.cloudflare.com/workers/previews/get-started/), [isolation guidance](https://developers.cloudflare.com/workers/previews/).
- **Cloudflare Access stays on previews:** Keep the existing **Previews only** Access policy, limited to Christian's approved identity. Test the fixed staging URL, a PR Preview URL, and the per-deployment Preview URL in a private browser: an unauthenticated visitor must see an Access challenge or denial. Ensure **cueory.app** remains public (does not require the Access sign-in). **Never switch preview protection off to make CI green.** [Protect Workers with Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/).
- **Preview URL visibility:** A Preview URL is publicly guessable unless Access protects it. Publishing the link in a PR comment is acceptable only after the Access check succeeds. Do not treat a noindex header as authentication.

## Replace the required “Workers Builds: cueory” gate — no gap allowed

Today two separate mechanisms trust **Workers Builds: cueory**:

1. The GitHub branch ruleset/required-status-check configuration (must be inspected by Christian before changing anything).
2. **scripts/automerge/decide.ts**: **REQUIRED_CHECKS** includes that exact name and **REQUIRED_CHECK_APP** pins publisher **cloudflare-workers-and-pages**. **.github/workflows/staging-automerge.yml** also listens for this Cloudflare check-run name.

A new Actions job **Preview deploy** should produce a stable, always-required success/failure check published by the trusted **github-actions** app for the exact PR head (confirm actual check name and app from real runs before hardcoding). Merely renaming a status check will not update auto-merge safely. In an approved follow-up, update all three areas together: the auto-merge required-check list, its trusted publisher mapping, and its completion-event routing. Update unit tests for missing, failed, skipped, wrong-app, stale-SHA, and successful new Preview checks. Protect these changes with **needs-christian**.

**Transition order (fail closed):**

1. Founder reviews this proposal, the current repository rulesets, Cloudflare Builds/Access configuration, credential scopes, and a written rollback plan. No changes until approval.
2. In a separate founder-held PR, add and review Actions workflows and test them on trusted branches, keeping Workers Builds enabled and the original required check intact.
3. Observe successful authenticated, *locked* Preview deployments plus failure tests. Record the new check's exact display name, trusted app, SHA association, URL, and CI timing. Confirm staging receives a Preview and main receives **no deployment** during PR/push testing.
4. In a separately approved, coordinated change, replace the required Cloudflare check with the proven Actions Preview check in **both** GitHub rulesets and default-branch staging auto-merge code/event handling. Do not remove the old gate before the new gate is enforced. If the transition cannot be atomic, temporarily stop auto-merges and keep release approval manual until both sides are consistent.
5. Only after new protections pass end-to-end, disable/disconnect automatic Workers Builds to eliminate duplicate deploys. Verify live production and staging previews remain available. **Disconnecting a Git integration does not automatically delete existing Worker deployments**, per [Cloudflare Builds documentation](https://developers.cloudflare.com/workers/ci-cd/builds/).
6. For rollback, pause auto-merges and production deploys, restore the old Cloudflare integration/check only after verifying it runs, and restore the exact required-check mapping. Do not weaken checks or temporarily grant production deploy authority to a PR workflow.

The new deployment workflow itself, GitHub ruleset changes, Cloudflare setup, and bot changes **are explicitly outside issue #731**.

## Free-tier and cost checks (verify again before implementation)

| Service | Relevant documented free limits | Migration implication |
| --- | --- | --- |
| **GitHub Actions** | Standard GitHub-hosted runners are free for **public repositories**. Larger runners and some storage can cost money. [GitHub billing](https://docs.github.com/en/actions/concepts/billing-and-usage). | Keep Cueory public, use standard runners, check artifact/cache usage, avoid paid runners. |
| **Workers Builds (current system)** | **3,000 build minutes/month**, **1 concurrent build**, **20-minute build timeout** on the free plan. [Cloudflare Builds limits](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/). | These are Workers Builds limits, **not GitHub Actions limits**. They stop being relevant to builds moved off Workers Builds. |
| **Workers Free (serving/deploy target)** | **100,000 requests/day**, **10 ms CPU per request**, **128 MB memory**. For static assets, **20,000 files/Worker version**, max **25 MiB per file**. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/). | Moving CI does **not** increase Worker runtime limits. Keep assets and requests within free allowances. |
| **Worker Previews** | Free plan: **100 Previews per Worker**, **100 deployments per Preview**. Oldest entries are pruned when limits are reached. [Preview limits](https://developers.cloudflare.com/workers/previews/). | Reuse stable Preview names and add approved cleanup for closed PRs. Avoid creating one Preview per CI retry. |

This plan does not authorize billing, token generation, enabling paid features, or upgrading any plan. If the free limits or implementation requirements cannot be met, stop and ask Christian rather than incur a charge.

## Approval and acceptance checklist

The migration is **not complete** unless Christian confirms, on the *exact tested commits*:

- A trusted internal PR gets CI + security checks and an isolated **Access-protected** PR Preview; an external fork gets no Cloudflare secret.
- A staging push updates only the locked **staging** Preview; it never runs **wrangler deploy**.
- A main push, only after founder-approved release, can deploy the existing production Worker through the protected GitHub environment.
- Wrong branch, missing/failed/late check, unauthorized actor, missing Access, or stale SHA **blocks deployment and auto-merge**.
- The new GitHub check replaces **Workers Builds: cueory** in the required-status ruleset, trusted-app check, and event handling, without any unguarded window.
- No regressions in the current CI/security suites, no missing preview lock, no loss of the public production site, and no additional paid services.

**Decision needed from Christian:** Approve or reject a separate implementation PR after reviewing this plan. Until then, **Workers Builds and all existing policies remain unchanged**.
