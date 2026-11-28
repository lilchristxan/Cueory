# Opening accounts: what is ready, what is left

Christian, 2026-11-28: get everything ready for students to create accounts, make the repository private, and start
seeing the data so Cueory can improve. This page is the single checklist. It records what was checked, not what is
assumed.

## Checked on 2026-11-28

| Thing | State |
| --- | --- |
| `cueory-staging` database | Healthy. All 20 changes in `supabase/migrations` are applied. 14 tables, row-level security on every one, 0 rows in each. |
| Supabase security check on staging | One kind of warning only: ten functions that signed-in students may call (check an answer, send a flag, delete my account and so on). That is by design: each checks who is calling before it does anything. |
| `cueory-prod` database | **Paused** (Supabase pauses free projects after 7 days without activity). Nothing can be checked or applied there until it is restored. |
| Pages | Built and on staging: `/signup`, `/signin`, `/auth/callback`, `/reset-password`, `/account` (name, download my data, delete my account, sign out), `/account/two-factor`, `/progress`, `/admin/flags`. |
| The switch | `accountsOpen` in `src/config/site.ts` is `false`: the live site says "accounts open soon" and never loads Supabase. Staging and other previews open sign-in for testing through their own gate. |

## The order to open in

1. **Staging build variables.** The preview build needs `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   for `cueory-staging` (docs/GO-LIVE.md, section 1.8). The key must be the `sb_publishable_` kind: the build refuses
   the older anon key. Without both, the build succeeds but accounts stay unavailable. Rebuild, then confirm the
   staging preview received them.
2. **Staging sign-in settings.** docs/SETUP.md Part M (sign-in settings for `cueory-staging`) and Part N (the Google
   client for staging).
3. **Staging sign-in works end to end.** Staging already opens sign-in for testing through the preview gate
   (`accountsPreviewAllowed` in `src/config/accountsgate.ts`); `accountsOpen` stays `false`. On locked staging:
   - sign up with Google;
   - sign up with an email and password, confirm the email, then sign in with the password;
   - ask for a password reset and finish it (it returns through `/reset-password`);
   - change the display name, download the data, delete the account, and confirm every row is gone.
4. **Rate limits hold on the hosted project.** Run `scripts/ratelimit-check.mjs` against staging with a fresh confirmed
   account and a published sample question (answer checks, flags, study events, name changes) and record the results
   (docs/STATUS.md, Task 302). Confirm Supabase's own sign-in limits are still at their defaults after the email
   sender is set up.
5. **Account emails.** Resend as the sender for confirmation and reset emails (free: 100 a day), with the domain's
   email records. Email DNS is Christian's to change (CLAUDE.md rule 9).
6. **Privacy and terms copy for accounts.** Today `/privacy` says "Public accounts are closed" and `/terms` says
   registration has not opened. Before opening, both need approved wording that says what accounts store: the
   Supabase account, what Google shares at sign-in, sign-in sessions, and account emails sent through Resend. The
   wording is Christian's to approve.
7. **Production database.** Restore `cueory-prod`, apply the same 20 changes in order and run the security check.
   Keep it awake: a free project pauses again after 7 quiet days.
8. **Backups proven, not just running.** Before any student record is stored (SECURITY.md, backups rule;
   docs/BACKUPS.md): one completed encrypted off-site upload of `cueory-prod`, and one successful practice restore
   into a scratch database, with the date and result written down. A backup that runs but has never been restored
   does not pass this step.
9. **Production sign-in.** docs/SETUP.md Part O: the same settings for `cueory-prod`, with the production Site URL
   and both return addresses (`/auth/callback**` and `/reset-password`), and the production Google client. Then the
   two production build variables.
10. **Admin.** Cloudflare Access in front of `/admin` on the live site (SECURITY.md rule 10: it must be in place before
   any admin page is public), checked from a signed-out browser. Then Christian's own account added to `admins` (by
   hand in the SQL editor, by design) with two-factor on.
11. **Open the live site.** Only now does `accountsOpen` change to `true`, in its own pull request that Christian
    approves. It is one shared setting, not a staging-only one: once it reaches `main` with the production variables
    present, sign-in is open to everyone.

## Seeing the data

What exists today:

- `study_events`: every answered, marked and skipped question by signed-in students, with time on each.
- `attempts`, `review_state`, `exam_plans`: answers checked, spaced-review state, exam dates.
- `flags`: every "flag or comment", with an admin inbox at `/admin/flags`.
- Cloudflare Web Analytics: page views and where visitors come from, without cookies.

What is missing: a place to *read* the study data. Today only the flag inbox has an admin screen. The plan is a
read-only insights page under `/admin` fed by admin-only database functions that return totals, never a student's
rows: sign-ups per day, active students, questions most missed, concepts with the lowest share right, where students
stop, flags per item. That is a database change (new functions), so it waits for Christian's approval like every other.

## Making the repository private

Possible at any time, and it does not block accounts. What changes:

- **Cost.** The repository was made public so GitHub's test minutes are free (D-75). Private repositories on the free
  plan get 2,000 minutes a month; Cueory's pull requests use far more than that. Going private means paying for
  minutes, running fewer tests, or running tests somewhere else.
- **Security tools.** CodeQL code scanning and secret scanning with push protection are free only for public
  repositories. Semgrep and gitleaks in CI would keep running.
- **What private does not fix.** Everything already pushed has been public and may have been copied. No answer keys,
  secrets or personal data are in it, by rule.
- **Suggested path.** Keep the code public and keep real content out of it, as now; or measure a month of test minutes
  first, then decide with the real number.

## Needs Christian

- Restore `cueory-prod` (one button in Supabase), or say "restore prod" and Claude does it.
- The two staging build variables in Cloudflare (step 1), and SETUP Parts M and N for staging, if not already done.
- SETUP Part O and the production build variables when step 9 is reached.
- Resend account and the domain's email records.
- Approve the account wording for `/privacy` and `/terms`.
- The practice restore of a production backup (docs/BACKUPS.md), with Claude walking through it.
- Cloudflare Access for `/admin` on the live site.
- Approve the insights database change when its pull request is up.
- Approve the pull request that opens accounts.
- Decide on private: stay public, or approve the cost.
