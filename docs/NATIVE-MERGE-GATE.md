# Native merge-policy gate (#585)

This is a proposed control-plane adapter, not an activated release control. It publishes
`Cueory merge policy (staging)` or `Cueory merge policy (main)` on a PR's exact head commit.
The two names keep a staging result from satisfying the production rule.

The evaluator reuses `checkProblems`, `codexState`, and `codexProblems` from the reviewed
auto-merge policy. Every required check, including the real Workers preview, must report
`success` from its expected publisher. Missing, pending, skipped, neutral, failed and
untrusted-publisher results fail. Codex's newest surviving bot-authored machine receipt must
be completed, finding-free and for that exact head. Failed/quota-limited, stale, missing,
malformed and unresolved receipts fail. The gate never substitutes its own review.

The workflow checks out the default branch only, installs no packages, consumes no PR code
or build artifacts, and has no merge, deployment, content-write or comment capability.
Its only write is the Checks API. Before evidence reads it publishes `in_progress`, then
explicit `success` or `failure`; read/pagination errors fail. It re-reads the PR before
completion and rejects a changed head/base, retarget, draft, closure or fork. Production
PRs must come from this repository's `staging` branch. Forks are never checked out or run.
The CLI defaults to read-only evaluation; the reviewed workflow explicitly passes `--publish`.

CI/CodeQL completion and Cloudflare check events select their associated PR through the
existing bounded event router. Codex PR comments are re-evaluated on creation, edit or
deletion, including edits that remove the receipt marker. An hourly/manual sweep reconciles
missed or ambiguous events across open staging and main PRs. Publishing this gate does not
trigger itself. There is no scheduled task outside GitHub Actions.

## Reviewed activation sequence

1. Independently review the exact PR head, complete CI/security/browser checks, and obtain
   Christian's workflow approval. Merge into staging through the normal process only.
2. Promote the reviewed control code to the default branch through the separately approved
   staging-to-main release path. Default-branch-only events do not activate on a staging merge.
   A main push currently triggers Cloudflare production deployment; do not bypass the existing
   legal, anatomy, database or release gates to activate this workflow.
3. Run the default-branch workflow and inspect the **API-created** head check (not the workflow
   job named `Publish strict merge evidence`). Verify its name, head SHA, publisher, and
   eligibility in GitHub's actual PR merge box. Do not infer native eligibility from unit tests.
4. On an approved non-sensitive candidate, exercise missing/pending/failed/neutral/skipped
   checks, wrong publishers, unavailable/stale/finding reviews, a changed head and a clean
   receipt. Confirm failures block and the fully clean case passes. A missing Workers preview
   must block; repair and verify the protected preview build flow separately.
5. Only after those checks, add the branch-specific name as a native required status check,
   pinned to the verified GitHub Actions app id (currently 15368). Preserve every existing
   required check, strict up-to-date rule, bypass restriction, founder hold and release rule.

## Limits to verify before closing #585

- GitHub Actions is a shared publisher: this adapter does not create a separate GitHub App
  or isolate check publishing from other same-repository workflows granted `checks: write`.
  Native app pinning alone cannot prove which workflow produced a check. Review those
  writers before treating the receipt as an independently isolated security boundary.
- Checks and comment events are asynchronous, not an atomic merge transaction. A changed
  receipt is invalidated on the next event/reconciliation. The existing auto-merge final
  checks, strict native branch rules and founder release gate remain necessary.
- If GitHub is unavailable before the new blocking check can be created, this run cannot
  revoke an older result. Required checks have no custom expiry/lease in this adapter.
- This does not activate staging's newer founder-held paths on main, approve sensitive
  changes, configure preview builds, authorize models or legal copy, or prove production
  release readiness. Keep #585 open until its remaining acceptance evidence is verified.

## Official references

- [Checks API: exact head, permissions, create and update](https://docs.github.com/en/rest/checks/runs)
- [Workflow events and default-branch requirements](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- [Native required-check semantics and event eligibility](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)
