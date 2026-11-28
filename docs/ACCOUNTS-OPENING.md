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
| The switch | `accountsOpen` in `src/config/site.ts` is `false`: the live site says "accounts open soon" and never loads Supabase. |

## The order to open in

1. **Staging sign-in works end to end.** Create a test account on locked staging with Google and with an email link;
   confirm the email arrives; change the name; download the data; delete the account; confirm every row is gone.
   Needs Christian: Supabase sign-in settings and the Google client for staging (docs/SETUP.md Parts L and M), if not
   done yet.
2. **Account emails.** Resend set up as the sender for confirmation and reset emails (free: 100 a day), with the
   domain's email records. Email DNS is Christian's to change (CLAUDE.md rule 9).
3. **Production database.** Restore `cueory-prod`, apply the same 20 changes in order, run the security check, and
   confirm nightly backups run against it. Keep it awake: a free project pauses again after 7 quiet days.
4. **Production sign-in.** Supabase settings and the Google client for `cueory.app` (SETUP Part N); production build
   variables for the Supabase address and public key.
5. **Legal pages.** `/privacy` and `/terms` say what accounts store (they already describe it); Christian re-reads both.
6. **Admin.** Christian's own account added to `admins` (by hand in the SQL editor, by design) with two-factor on.
7. **Open on staging first** (`accountsOpen` true on staging only), watch for a few days, then open on the live site.

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
- SETUP Parts L and M for staging, if not already done; Part N for production when step 4 is reached.
- Resend account and the domain's email records.
- Approve the insights database change when its pull request is up.
- Decide on private: stay public, or approve the cost.
